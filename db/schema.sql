-- =============================================================================
-- Hotel room tracker - database schema (PostgreSQL 13+)
--
-- Every statement can safely run again ("if not exists" / "or replace"):
-- scripts/setup-db.mjs applies this file on every install and update.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- users: everyone who can log in.
-- "worker" = reception staff, "admin" = owner/manager (also sees Administrimi).
-- Users are deactivated, never deleted, so old stays keep the worker's name.
-- -----------------------------------------------------------------------------
create table if not exists users (
  id            serial primary key,
  username      text not null unique,
  full_name     text not null default '',
  password_hash text not null,
  role          text not null default 'worker' check (role in ('admin', 'worker')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- rooms: one row per room. Inactive rooms (e.g. under repair) are hidden from
-- the room board but keep their history.
-- -----------------------------------------------------------------------------
create table if not exists rooms (
  id         serial primary key,
  number     text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- key_cards: one row per physical key card. "code" is the number printed as a
-- barcode on the back of the card. A room can have several cards; a lost card
-- is deactivated so scanning it no longer works.
-- -----------------------------------------------------------------------------
create table if not exists key_cards (
  id         serial primary key,
  code       text not null unique,
  room_id    int not null references rooms(id) on delete cascade,
  label      text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- settings: exactly one row (id = 1) with the prices and the time rules.
-- -----------------------------------------------------------------------------
create table if not exists settings (
  id               int primary key default 1 check (id = 1),
  hotel_name       text not null default 'Hotel',
  currency         text not null default 'EUR',
  timezone         text not null default 'Europe/Tirane',
  short_price      numeric(10,2) not null default 20,
  short_minutes    int not null default 120,
  night_price      numeric(10,2) not null default 40,
  night_start      time not null default '21:00',    -- check-ins from this time are night stays
  night_end        time not null default '06:00',    -- ...until this time in the morning
  night_checkout   time not null default '12:00',    -- night guests leave by this time
  extra_hour_price numeric(10,2) not null default 10, -- overtime charge per started hour
  grace_minutes    int not null default 10           -- overtime tolerated before charging
);

insert into settings (id) values (1) on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- stays: one row per guest visit, from the check-in scan to the check-out scan.
--   status 'open'      the guest is in the room (or may still be)
--   status 'closed'    checked out
--   status 'cancelled' the check-in was a mistake; kept so nothing disappears
--
-- base_price is copied from the settings at check-in, so a later price change
-- doesn't rewrite history. extra_charge adds up extensions and overtime.
-- -----------------------------------------------------------------------------
create table if not exists stays (
  id             serial primary key,
  room_id        int not null references rooms(id),
  stay_type      text not null check (stay_type in ('short', 'night')),
  status         text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  check_in       timestamptz not null default now(),
  expected_out   timestamptz not null,
  check_out      timestamptz,
  base_price     numeric(10,2) not null,
  extra_charge   numeric(10,2) not null default 0,
  checked_in_by  int references users(id),
  checked_out_by int references users(id)
);

-- A room can never have two open stays, even if two devices scan at the same moment
create unique index if not exists stays_one_open_per_room on stays(room_id) where status = 'open';

-- The History page filters by check-in date
create index if not exists stays_check_in_idx on stays(check_in);


-- =============================================================================
-- Time rules
-- They are SQL functions so they always use the hotel's timezone (from
-- settings), whatever timezone the server itself runs in.
-- =============================================================================

-- 'night' if the given moment is inside the night window (e.g. 21:00 - 06:00,
-- which crosses midnight), otherwise 'short'.
create or replace function auto_stay_type(at_ts timestamptz) returns text
language sql stable as $$
  select case
    -- Window that crosses midnight, e.g. 21:00 -> 06:00
    when s.night_start > s.night_end and (x.local_time >= s.night_start or x.local_time < s.night_end)
      then 'night'
    -- Window within one day, e.g. 01:00 -> 05:00
    when s.night_start <= s.night_end and x.local_time >= s.night_start and x.local_time < s.night_end
      then 'night'
    else 'short'
  end
  from settings s,
       lateral (select (at_ts at time zone s.timezone)::time as local_time) x
  where s.id = 1
$$;


-- When a stay of the given type that started at from_ts has to end:
--   short: start + short_minutes
--   night: the next night_checkout (the same day if checked in after midnight)
create or replace function stay_expected_out(stype text, from_ts timestamptz) returns timestamptz
language sql stable as $$
  select case
    when stype = 'short' then
      from_ts + make_interval(mins => s.short_minutes)
    else (
      case
        -- Checked in after midnight, before checkout time: leave the same day
        when (from_ts at time zone s.timezone)::time < s.night_checkout
          then (from_ts at time zone s.timezone)::date + s.night_checkout
        -- Checked in in the evening: leave the next day
        else (from_ts at time zone s.timezone)::date + 1 + s.night_checkout
      end
    ) at time zone s.timezone
  end
  from settings s
  where s.id = 1
$$;


-- Current price of a stay type.
create or replace function stay_price(stype text) returns numeric
language sql stable as $$
  select case when stype = 'short' then short_price else night_price end
  from settings
  where id = 1
$$;
