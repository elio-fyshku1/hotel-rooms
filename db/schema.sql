-- =============================================================================
-- Hotel room tracker - database schema (PostgreSQL 13+)
--
-- Every statement is idempotent ("if not exists" / "or replace"), so the file
-- can be applied again after an update without losing data.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- users
-- People who can log in. "worker" = reception staff, "admin" = owner/manager.
-- Users are never deleted, only deactivated, so old stays keep their author.
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
-- rooms
-- needs_cleaning is set to true when a guest checks out (if the cleaning step
-- is enabled in settings) and back to false when someone marks it as cleaned.
-- -----------------------------------------------------------------------------
create table if not exists rooms (
  id             serial primary key,
  number         text not null unique,
  floor          int,
  active         boolean not null default true,
  needs_cleaning boolean not null default false,
  created_at     timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- key_cards
-- One row per physical room key card. "code" is whatever the reader types when
-- the card is presented: the NFC/RFID chip UID, or a barcode if one is used.
-- A room can have more than one card. Lost cards are deactivated, not deleted.
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
-- settings
-- Exactly one row (id = 1). Time rules, overtime and the hotel timezone.
-- The prices of the stays themselves are in the packages table.
-- -----------------------------------------------------------------------------
create table if not exists settings (
  id               int primary key default 1 check (id = 1),
  hotel_name       text not null default 'Hotel',
  currency         text not null default 'ALL',
  timezone         text not null default 'Europe/Tirane',
  night_start      time not null default '21:00',   -- check-ins from this time are "night" stays
  night_end        time not null default '06:00',   -- ...until this time in the morning
  night_checkout   time not null default '12:00',   -- night guests must leave by this time
  extra_hour_price numeric(10,2) not null default 500, -- overtime charge per started hour
  grace_minutes    int not null default 10,         -- overtime tolerated before suggesting a charge
  require_cleaning boolean not null default true    -- room waits for "cleaned" after checkout
);

insert into settings (id) values (1) on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- packages
-- What the guest can choose when the room is given: 2, 3, 4, 5 hours, 24 hours
-- or the night. minutes = length of the stay, counted from check-in; null
-- means a night stay, which ends at settings.night_checkout the next morning.
-- Stays copy the name and price, so editing or deleting a package never
-- changes the history.
-- -----------------------------------------------------------------------------
create table if not exists packages (
  id      serial primary key,
  name    text not null,
  minutes int check (minutes > 0),
  price   numeric(10,2) not null check (price >= 0),
  sort    int not null default 0,
  active  boolean not null default true
);

-- First run with packages: create the hotel's price list. Older versions had
-- one price for "2 hours" and one for the night, in euro, so the currency and
-- the overtime price switch to lekë at the same moment. Runs only once (while
-- the table is empty); after that prices are changed in Administrimi.
do $$
begin
  if not exists (select 1 from packages) then
    insert into packages (name, minutes, price, sort) values
      ('2 orë',   120,  2000, 1),
      ('3 orë',   180,  2500, 2),
      ('4 orë',   240,  3000, 3),
      ('5 orë',   300,  3500, 4),
      ('24 orë',  1440, 4000, 5),
      ('Natë',    null, 3500, 6);
    update settings set currency = 'ALL', extra_hour_price = 500 where id = 1;
  end if;
end $$;

-- The single prices from older versions are replaced by the packages above
alter table settings drop column if exists short_price;
alter table settings drop column if exists short_minutes;
alter table settings drop column if exists night_price;


-- -----------------------------------------------------------------------------
-- stays
-- One row per guest visit, from the check-in scan to the check-out scan.
--   status = 'open'      guest is (or may still be) in the room
--   status = 'closed'    checked out normally
--   status = 'cancelled' check-in was a mistake (kept for the audit trail)
-- package_name and base_price are copied from the package chosen at check-in
-- (stay_type is 'night' for the night package, 'short' for the others);
-- extra_charge collects overtime and extensions. Prices are copied into the row so later price changes don't
-- rewrite history.
-- -----------------------------------------------------------------------------
create table if not exists stays (
  id             serial primary key,
  room_id        int not null references rooms(id),
  card_id        int references key_cards(id),
  stay_type      text not null check (stay_type in ('short', 'night')),
  status         text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  check_in       timestamptz not null default now(),
  expected_out   timestamptz not null,
  check_out      timestamptz,
  base_price     numeric(10,2) not null,
  extra_charge   numeric(10,2) not null default 0,
  currency       text not null,
  checked_in_by  int references users(id),
  checked_out_by int references users(id)
);

-- Payment. The guest can pay at check-in or at check-out, so each stay records
-- how much was collected. Still to pay = base_price + extra_charge - paid_amount.
-- Added with "add column if not exists" so existing databases get the columns too.
alter table stays add column if not exists paid_amount numeric(10,2) not null default 0;
alter table stays add column if not exists paid_at timestamptz;          -- when the last payment was taken
alter table stays add column if not exists paid_by int references users(id); -- who took it

-- Name of the package the guest chose ("3 orë", "Natë"...). Stays from before
-- packages existed were all 2 hours or a night.
alter table stays add column if not exists package_name text not null default '';
update stays set package_name = case when stay_type = 'night' then 'Natë' else '2 orë' end
 where package_name = '';

-- A room can never have two open stays at the same time, even if two
-- devices scan at the same moment.
create unique index if not exists stays_one_open_per_room on stays(room_id) where status = 'open';

-- History and reports filter by check-in date.
create index if not exists stays_check_in_idx on stays(check_in);


-- -----------------------------------------------------------------------------
-- stay_events
-- Audit log: every action taken on a stay, who did it and the amount involved.
-- Used to answer "who checked this room in/out and what was charged".
-- -----------------------------------------------------------------------------
create table if not exists stay_events (
  id       serial primary key,
  stay_id  int not null references stays(id) on delete cascade,
  kind     text not null,  -- check_in, check_out, payment, extend_hour, set_package, cancel
  amount   numeric(10,2) not null default 0,
  user_id  int references users(id),
  at       timestamptz not null default now(),
  note     text not null default ''
);

create index if not exists stay_events_stay_idx on stay_events(stay_id);


-- =============================================================================
-- Functions
-- The time rules live in the database so they are always evaluated in the
-- hotel's timezone, no matter where the app server runs.
-- =============================================================================

-- Returns 'night' when the given moment falls inside the night window
-- (e.g. 21:00 - 06:00, which wraps past midnight), otherwise 'short'.
-- Used to suggest the night package when a room is given in the evening.
create or replace function auto_stay_type(at_ts timestamptz) returns text
language sql stable as $$
  select case
    -- Window that wraps midnight, e.g. 21:00 -> 06:00
    when s.night_start > s.night_end and (x.local_time >= s.night_start or x.local_time < s.night_end)
      then 'night'
    -- Window inside one day, e.g. 01:00 -> 05:00
    when s.night_start <= s.night_end and x.local_time >= s.night_start and x.local_time < s.night_end
      then 'night'
    else 'short'
  end
  from settings s,
       lateral (select (at_ts at time zone s.timezone)::time as local_time) x
  where s.id = 1
$$;


-- Returns the moment a stay started at from_ts has to end.
--   p_minutes set:  start + p_minutes (2 hours, 24 hours...)
--   p_minutes null: night stay, the next night_checkout time (the same day if
--                   the guest checked in after midnight)
create or replace function stay_end(p_minutes int, from_ts timestamptz) returns timestamptz
language sql stable as $$
  select case
    when p_minutes is not null then
      from_ts + make_interval(mins => p_minutes)
    else (
      case
        -- Checked in after midnight but before checkout time: leave the same day
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

-- Replaced by stay_end and the packages table
drop function if exists stay_expected_out(text, timestamptz);
drop function if exists stay_price(text);
