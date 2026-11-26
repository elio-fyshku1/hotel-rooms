/**
 * Hotel logic: settings, packages, check-in, check-out and changes to an open stay.
 *
 * All functions that change data run inside a transaction and lock the room
 * row first, so two devices acting on the same room at the same moment are
 * handled one after the other instead of creating two stays.
 */
import type { PoolClient } from "pg";
import { pool, query, transaction, Queryable } from "./db";
import { UserError } from "./errors";
import type { Package, RoomView, ScanResult, Settings, Stay, StayAction, Timestamp } from "./types";

// Readers sometimes register the same card twice in a row. A second read of
// the same room within this many seconds is ignored instead of undoing the
// check-in (or check-out) that just happened.
const DOUBLE_SCAN_SECONDS = 20;

// Workers can cancel a mistaken check-in only shortly after it was made.
// Admins can cancel at any time.
const WORKER_CANCEL_MINUTES = 10;


// -----------------------------------------------------------------------------
// Settings, packages and overtime
// -----------------------------------------------------------------------------

/**
 * Loads the settings row (time rules, overtime, timezone). Times are formatted
 * as "HH:MM" so they can go straight into <input type="time"> fields.
 */
export async function getSettings(db: Queryable = pool): Promise<Settings> {
  const rows = await query<Settings>(
    `select hotel_name, currency, timezone,
            to_char(night_start, 'HH24:MI')    as night_start,
            to_char(night_end, 'HH24:MI')      as night_end,
            to_char(night_checkout, 'HH24:MI') as night_checkout,
            extra_hour_price, grace_minutes, require_cleaning
       from settings
      where id = 1`,
    [],
    db
  );
  return rows[0];
}

/**
 * The packages in the order they are shown (2 hours first, night last).
 * Reception only sees the active ones; Administrimi sees all of them.
 */
export async function listPackages(onlyActive: boolean): Promise<Package[]> {
  return query<Package>(
    `select id, name, minutes, price, sort, active
       from packages
      where active or not $1
      order by sort, id`,
    [onlyActive]
  );
}

/** True when it is night time at the hotel now, to suggest the night package. */
export async function isNightNow(): Promise<boolean> {
  const rows = await query<{ night: boolean }>("select auto_stay_type(now()) = 'night' as night");
  return rows[0].night;
}

/**
 * How many minutes a stay is past its deadline at `now`, and the suggested
 * extra charge: per started hour, and only once the grace period is over.
 *
 * Example with grace 10 min and 10 EUR/hour:
 *   8 min late  -> 0 EUR (inside grace)
 *   25 min late -> 10 EUR (1 started hour)
 *   70 min late -> 20 EUR (2 started hours)
 */
function calculateOvertime(expectedOut: Timestamp, now: Date, settings: Settings) {
  const minutesLate = Math.floor((now.getTime() - new Date(expectedOut).getTime()) / 60000);

  if (minutesLate <= settings.grace_minutes) {
    return { minutes: Math.max(minutesLate, 0), charge: 0 };
  }

  const startedHours = Math.ceil(minutesLate / 60);
  return { minutes: minutesLate, charge: startedHours * settings.extra_hour_price };
}


// -----------------------------------------------------------------------------
// Internal helpers (always called inside a transaction)
// -----------------------------------------------------------------------------

/** Adds a row to the audit log. */
async function logEvent(
  client: PoolClient,
  stayId: number,
  kind: string,
  userId: number,
  amount = 0,
  note = ""
): Promise<void> {
  await client.query(
    "insert into stay_events (stay_id, kind, amount, user_id, note) values ($1, $2, $3, $4, $5)",
    [stayId, kind, amount, userId, note]
  );
}

/** Locks the room row until the transaction ends. */
async function lockRoom(client: PoolClient, roomId: number): Promise<void> {
  await client.query("select id from rooms where id = $1 for update", [roomId]);
}

/** Returns the open stay of a room, if there is one. */
async function findOpenStay(client: PoolClient, roomId: number): Promise<Stay | undefined> {
  const result = await client.query<Stay>("select * from stays where room_id = $1 and status = 'open'", [roomId]);
  return result.rows[0];
}

/** Seconds elapsed since the given moment. */
function secondsSince(moment: Date | string): number {
  return (Date.now() - new Date(moment).getTime()) / 1000;
}

/**
 * Creates a new stay with the chosen package: its name and price are copied
 * into the stay and the deadline is counted from now (stay_end in schema.sql).
 */
async function insertStay(
  client: PoolClient,
  roomId: number,
  cardId: number | null,
  userId: number,
  packageId: number
): Promise<Stay> {
  const result = await client.query<Stay>(
    `insert into stays (room_id, card_id, stay_type, package_name, expected_out, base_price, currency, checked_in_by)
     select $1, $2,
            case when p.minutes is null then 'night' else 'short' end,
            p.name, stay_end(p.minutes, now()), p.price, s.currency, $3
       from packages p, settings s
      where p.id = $4 and p.active and s.id = 1
     returning *`,
    [roomId, cardId, userId, packageId]
  );
  const stay = result.rows[0];
  if (!stay) throw new UserError("Kjo paketë nuk ekziston më. Rifreskoni faqen.");

  // A new guest means the room is in use, whatever its cleaning flag was.
  await client.query("update rooms set needs_cleaning = false where id = $1", [roomId]);
  await logEvent(client, stay.id, "check_in", userId, stay.base_price, stay.package_name);
  return stay;
}

/**
 * Closes a stay now, adding `extra` to its extra charge, and flags the room
 * for cleaning if that step is enabled.
 */
async function closeStay(client: PoolClient, stay: Stay, userId: number, extra: number): Promise<Stay> {
  const result = await client.query<Stay>(
    `update stays
        set status = 'closed',
            check_out = now(),
            checked_out_by = $2,
            extra_charge = extra_charge + $3
      where id = $1 and status = 'open'
     returning *`,
    [stay.id, userId, extra]
  );
  if (!result.rows[0]) throw new UserError("Ky qëndrim është mbyllur tashmë.");

  await client.query(
    "update rooms set needs_cleaning = (select require_cleaning from settings where id = 1) where id = $1",
    [stay.room_id]
  );
  await logEvent(client, stay.id, "check_out", userId, extra, extra > 0 ? "overtime" : "");
  return result.rows[0];
}


// -----------------------------------------------------------------------------
// Public functions (used by the API routes)
// -----------------------------------------------------------------------------

/**
 * Handles a card presented to the reader. The card works as a toggle:
 *   - its room is free     -> check-in, in two steps:
 *       1. scan without a package: answers "choose_package" (nothing saved yet)
 *       2. the worker picks the package and the browser sends the same code
 *          again with `packageId`: the stay starts now
 *   - its room is occupied -> check-out
 *
 * A late check-out (past the grace period) is not closed here: the result
 * asks the browser to let the worker decide about an extra charge first.
 *
 * `allowDirty` is set when the worker confirmed checking in to a room that
 * was not marked as cleaned.
 */
export async function scanCard(
  rawCode: string,
  userId: number,
  allowDirty = false,
  packageId: number | null = null
): Promise<ScanResult> {
  const code = rawCode.trim().toUpperCase();

  return transaction(async (client) => {
    // Find the card and its room
    const cardResult = await client.query(
      `select k.id, k.active, k.room_id, r.number, r.active as room_active, r.needs_cleaning
         from key_cards k
         join rooms r on r.id = k.room_id
        where k.code = $1`,
      [code]
    );
    const card = cardResult.rows[0];

    if (!card) return { result: "unknown_card", code };
    if (!card.active) return { result: "inactive_card", room: card.number };
    if (!card.room_active) return { result: "room_inactive", room: card.number };

    await lockRoom(client, card.room_id);
    const settings = await getSettings(client);
    const openStay = await findOpenStay(client, card.room_id);

    // --- Room is occupied: this is a check-out ---
    if (openStay) {
      // Step 2 of a check-in, but another device checked the room in meanwhile:
      // never turn the chosen package into a check-out of that guest
      if (packageId !== null) {
        throw new UserError(`Dhoma ${card.number} u regjistrua ndërkohë nga dikush tjetër.`);
      }

      if (secondsSince(openStay.check_in) < DOUBLE_SCAN_SECONDS) {
        return { result: "double_scan", room: card.number };
      }

      const overtime = calculateOvertime(openStay.expected_out, new Date(), settings);
      if (overtime.charge > 0) {
        return {
          result: "confirm_checkout",
          room: card.number,
          stay: openStay,
          overtimeMinutes: overtime.minutes,
          suggestedExtra: overtime.charge,
        };
      }

      const closedStay = await closeStay(client, openStay, userId, 0);
      return { result: "checked_out", room: card.number, stay: closedStay };
    }

    // --- Room is free: this is a check-in ---

    // Step 2: package chosen (the checks below were done in step 1)
    if (packageId !== null) {
      const newStay = await insertStay(client, card.room_id, card.id, userId, packageId);
      return { result: "checked_in", room: card.number, stay: newStay };
    }

    // Step 1. Ignore a second read right after a check-out of the same room
    const lastCheckout = await client.query(
      "select check_out from stays where room_id = $1 and status = 'closed' order by check_out desc limit 1",
      [card.room_id]
    );
    if (lastCheckout.rows[0] && secondsSince(lastCheckout.rows[0].check_out) < DOUBLE_SCAN_SECONDS) {
      return { result: "double_scan", room: card.number };
    }

    if (card.needs_cleaning && settings.require_cleaning && !allowDirty) {
      return { result: "needs_cleaning", room: card.number };
    }

    return { result: "choose_package", room: card.number, code };
  });
}

/**
 * Check-in from the room dialog, without a card (e.g. the card can't be read).
 */
export async function checkInWithoutCard(roomId: number, userId: number, packageId: number): Promise<Stay> {
  return transaction(async (client) => {
    await lockRoom(client, roomId);
    if (await findOpenStay(client, roomId)) {
      throw new UserError("Dhoma është e zënë.");
    }
    return insertStay(client, roomId, null, userId, packageId);
  });
}

/**
 * Applies a worker action to a stay:
 *   pay          - the guest paid everything still due (also after check-out)
 *   checkout     - close it now, optionally with an extra charge
 *   extend_hour  - guest stays one hour longer at the overtime price
 *   set_package  - switch to another package, e.g. 2 -> 3 hours (new price,
 *                  deadline counted from check-in; what was paid is kept)
 *   cancel       - undo a mistaken check-in
 */
export async function applyStayAction(
  stayId: number,
  userId: number,
  isAdmin: boolean,
  request: StayAction
): Promise<{ stay: Stay }> {
  return transaction(async (client) => {
    const stayResult = await client.query<Stay>("select * from stays where id = $1 for update", [stayId]);
    const stay = stayResult.rows[0];
    if (!stay) throw new UserError("Qëndrimi nuk u gjet.");

    // Payment is allowed on finished stays too: many guests pay when leaving
    if (request.action === "pay") {
      if (stay.status === "cancelled") throw new UserError("Ky qëndrim është anuluar.");
      const due = stay.base_price + stay.extra_charge - stay.paid_amount;
      if (due <= 0) return { stay };

      const result = await client.query<Stay>(
        `update stays
            set paid_amount = base_price + extra_charge, paid_at = now(), paid_by = $2
          where id = $1
         returning *`,
        [stayId, userId]
      );
      await logEvent(client, stayId, "payment", userId, due);
      return { stay: result.rows[0] };
    }

    // Every other action changes the stay itself, so it must still be open
    if (stay.status !== "open") throw new UserError("Ky qëndrim është mbyllur tashmë.");

    const settings = await getSettings(client);

    switch (request.action) {
      case "checkout": {
        const extra = Math.max(0, Number(request.extra) || 0);
        return { stay: await closeStay(client, stay, userId, extra) };
      }

      case "extend_hour": {
        const amount = settings.extra_hour_price;
        const result = await client.query<Stay>(
          `update stays
              set expected_out = expected_out + interval '1 hour',
                  extra_charge = extra_charge + $2
            where id = $1
           returning *`,
          [stayId, amount]
        );
        await logEvent(client, stayId, "extend_hour", userId, amount);
        return { stay: result.rows[0] };
      }

      case "set_package": {
        const result = await client.query<Stay>(
          `update stays s
              set stay_type = case when p.minutes is null then 'night' else 'short' end,
                  package_name = p.name,
                  base_price = p.price,
                  expected_out = stay_end(p.minutes, s.check_in)
             from packages p
            where s.id = $1 and p.id = $2 and p.active
           returning s.*`,
          [stayId, Number(request.packageId)]
        );
        if (!result.rows[0]) throw new UserError("Kjo paketë nuk ekziston më. Rifreskoni faqen.");
        await logEvent(client, stayId, "set_package", userId, result.rows[0].base_price, result.rows[0].package_name);
        return { stay: result.rows[0] };
      }

      case "cancel": {
        const minutesSinceCheckIn = secondsSince(stay.check_in) / 60;
        if (!isAdmin && minutesSinceCheckIn > WORKER_CANCEL_MINUTES) {
          throw new UserError(`Pas ${WORKER_CANCEL_MINUTES} minutash hyrjen mund ta anulojë vetëm administratori.`);
        }
        const result = await client.query<Stay>(
          `update stays
              set status = 'cancelled', check_out = now(), checked_out_by = $2
            where id = $1
           returning *`,
          [stayId, userId]
        );
        await logEvent(client, stayId, "cancel", userId);
        return { stay: result.rows[0] };
      }

      default:
        throw new UserError("Veprim i panjohur.");
    }
  });
}

/**
 * All active rooms with their open stay, in display order:
 * by floor, then by room number as a number (so 9 comes before 10).
 *
 * "unpaid" is the room's last finished stay when the guest still owes money,
 * so the worker is reminded to collect it (e.g. when the room is cleaned).
 */
export async function listRooms(): Promise<RoomView[]> {
  return query<RoomView>(
    `select r.id, r.number, r.floor, r.needs_cleaning,
            case when s.id is null then null else json_build_object(
              'id', s.id,
              'stay_type', s.stay_type,
              'package_name', s.package_name,
              'check_in', s.check_in,
              'expected_out', s.expected_out,
              'base_price', s.base_price,
              'extra_charge', s.extra_charge,
              'paid_amount', s.paid_amount,
              'currency', s.currency,
              'checked_in_by', coalesce(nullif(u.full_name, ''), u.username)
            ) end as stay,
            case when last.due > 0 then json_build_object('stay_id', last.id, 'amount', last.due, 'currency', last.currency) end as unpaid
       from rooms r
       left join stays s on s.room_id = r.id and s.status = 'open'
       left join users u on u.id = s.checked_in_by
       -- The room's most recent closed stay and how much of it is still unpaid
       left join lateral (
         select c.id, c.currency, c.base_price + c.extra_charge - c.paid_amount as due
           from stays c
          where c.room_id = r.id and c.status = 'closed'
          order by c.check_out desc
          limit 1
       ) last on true
      where r.active
      order by r.floor nulls last,
               nullif(regexp_replace(r.number, '\\D', '', 'g'), '')::bigint nulls last,
               r.number`
  );
}
