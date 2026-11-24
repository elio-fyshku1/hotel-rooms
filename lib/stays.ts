/**
 * Hotel logic: settings, check-in, check-out and changes to an open stay.
 *
 * Everything that changes data runs inside a transaction and first locks the
 * room's row. If two devices act on the same room at the same moment, the
 * second one waits for the first, so a room can't end up with two stays.
 */
import type { PoolClient } from "pg";
import { pool, query, transaction, Queryable } from "./db";
import { UserError } from "./errors";
import type { RoomView, ScanResult, Settings, Stay, StayAction, Timestamp } from "./types";

// Scanners sometimes read the same card twice in a row. A second scan of the
// same room within this many seconds is ignored, instead of undoing the
// check-in or check-out that just happened.
const DOUBLE_SCAN_SECONDS = 20;

// A worker can cancel a mistaken check-in only within this many minutes.
// Admins can cancel at any time.
const WORKER_CANCEL_MINUTES = 10;


// -----------------------------------------------------------------------------
// Settings and overtime
// -----------------------------------------------------------------------------

/**
 * Loads the settings row (prices, time rules, timezone). Times come back as
 * "HH:MM", the format <input type="time"> expects.
 */
export async function getSettings(db: Queryable = pool): Promise<Settings> {
  const rows = await query<Settings>(
    `select hotel_name, currency, timezone,
            short_price, short_minutes, night_price,
            to_char(night_start, 'HH24:MI')    as night_start,
            to_char(night_end, 'HH24:MI')      as night_end,
            to_char(night_checkout, 'HH24:MI') as night_checkout,
            extra_hour_price, grace_minutes
       from settings
      where id = 1`,
    [],
    db
  );
  return rows[0];
}

/**
 * How many minutes a stay is past its deadline, and the suggested extra charge:
 * one extra_hour_price per started hour, but only after the grace period.
 *
 * With 10 minutes grace and 10 EUR per hour:
 *   8 min late  ->  0 EUR (within grace)
 *   25 min late -> 10 EUR (1 started hour)
 *   70 min late -> 20 EUR (2 started hours)
 */
function calculateOvertime(expectedOut: Timestamp, settings: Settings) {
  const minutesLate = Math.floor((Date.now() - new Date(expectedOut).getTime()) / 60000);

  if (minutesLate <= settings.grace_minutes) {
    return { minutes: Math.max(minutesLate, 0), charge: 0 };
  }

  const startedHours = Math.ceil(minutesLate / 60);
  return { minutes: minutesLate, charge: startedHours * settings.extra_hour_price };
}

/** Seconds since the given moment. */
function secondsSince(moment: Timestamp): number {
  return (Date.now() - new Date(moment).getTime()) / 1000;
}


// -----------------------------------------------------------------------------
// Check-in / check-out (only called inside a transaction)
// -----------------------------------------------------------------------------

/**
 * Creates the stay for a new guest. The type (2 hours or night) is chosen from
 * the clock; deadline and price come from the SQL functions in schema.sql.
 */
async function checkIn(client: PoolClient, roomId: number, userId: number): Promise<Stay> {
  const result = await client.query<Stay>(
    `insert into stays (room_id, stay_type, expected_out, base_price, checked_in_by)
     select $1, t.stay_type, stay_expected_out(t.stay_type, now()), stay_price(t.stay_type), $2
       from (select auto_stay_type(now()) as stay_type) t
     returning *`,
    [roomId, userId]
  );
  return result.rows[0];
}

/** Closes a stay now, adding `extra` (overtime) to what the guest pays. */
async function checkOut(client: PoolClient, stayId: number, userId: number, extra: number): Promise<Stay> {
  const result = await client.query<Stay>(
    `update stays
        set status = 'closed', check_out = now(), checked_out_by = $2, extra_charge = extra_charge + $3
      where id = $1 and status = 'open'
     returning *`,
    [stayId, userId, extra]
  );
  if (!result.rows[0]) throw new UserError("Ky qëndrim është mbyllur tashmë.");
  return result.rows[0];
}


// -----------------------------------------------------------------------------
// Public functions (used by the API routes)
// -----------------------------------------------------------------------------

/**
 * Handles a scanned card. The card works as a switch for its room:
 *   room free     -> check-in
 *   room occupied -> check-out
 *
 * A late check-out (past the grace period) is not closed here. The result
 * asks the worker to decide about the extra charge first; the browser then
 * closes the stay with applyStayAction("checkout").
 */
export async function scanCard(rawCode: string, userId: number): Promise<ScanResult> {
  // Codes are stored in upper case (see the admin cards route)
  const code = rawCode.trim().toUpperCase();

  return transaction(async (client) => {
    // Which room does this card open?
    const cardResult = await client.query(
      `select k.active, k.room_id, r.number, r.active as room_active
         from key_cards k
         join rooms r on r.id = k.room_id
        where k.code = $1`,
      [code]
    );
    const card = cardResult.rows[0];

    if (!card) return { result: "unknown_card", code };
    if (!card.active) return { result: "inactive_card", room: card.number };
    if (!card.room_active) return { result: "room_inactive", room: card.number };

    // From here on, no other request can change this room until we're done
    await client.query("select id from rooms where id = $1 for update", [card.room_id]);

    const openStay = (
      await client.query<Stay>("select * from stays where room_id = $1 and status = 'open'", [card.room_id])
    ).rows[0];

    // --- The room has a guest: check-out ---
    if (openStay) {
      if (secondsSince(openStay.check_in) < DOUBLE_SCAN_SECONDS) {
        return { result: "double_scan", room: card.number };
      }

      const overtime = calculateOvertime(openStay.expected_out, await getSettings(client));
      if (overtime.charge > 0) {
        return {
          result: "confirm_checkout",
          room: card.number,
          stay: openStay,
          overtimeMinutes: overtime.minutes,
          suggestedExtra: overtime.charge,
        };
      }

      const closedStay = await checkOut(client, openStay.id, userId, 0);
      return { result: "checked_out", room: card.number, stay: closedStay };
    }

    // --- The room is free: check-in ---

    // Ignore the card if this room was checked out a few seconds ago
    const lastCheckout = await client.query(
      "select check_out from stays where room_id = $1 and status = 'closed' order by check_out desc limit 1",
      [card.room_id]
    );
    if (lastCheckout.rows[0] && secondsSince(lastCheckout.rows[0].check_out) < DOUBLE_SCAN_SECONDS) {
      return { result: "double_scan", room: card.number };
    }

    const newStay = await checkIn(client, card.room_id, userId);
    return { result: "checked_in", room: card.number, stay: newStay };
  });
}

/**
 * Applies a worker action to an open stay:
 *   checkout - close it now, with an optional extra charge
 *   extend   - the guest stays longer: charge now and move the deadline
 *   set_type - switch between 2 hours and night (deadline counted from check-in)
 *   cancel   - undo a check-in made by mistake
 */
export async function applyStayAction(
  stayId: number,
  userId: number,
  isAdmin: boolean,
  request: StayAction
): Promise<{ stay: Stay }> {
  return transaction(async (client) => {
    // Lock the stay so two devices can't change it at the same time
    const stay = (await client.query<Stay>("select * from stays where id = $1 for update", [stayId])).rows[0];
    if (!stay) throw new UserError("Qëndrimi nuk u gjet.");
    if (stay.status !== "open") throw new UserError("Ky qëndrim është mbyllur tashmë.");

    switch (request.action) {
      case "checkout": {
        const extra = Math.max(0, Number(request.extra) || 0);
        return { stay: await checkOut(client, stayId, userId, extra) };
      }

      case "extend": {
        // +1 hour at the overtime price, or one more short stay at the short price
        const settings = await getSettings(client);
        const minutes = request.kind === "hour" ? 60 : settings.short_minutes;
        const amount = request.kind === "hour" ? settings.extra_hour_price : settings.short_price;

        const result = await client.query<Stay>(
          `update stays
              set expected_out = expected_out + make_interval(mins => $2), extra_charge = extra_charge + $3
            where id = $1
           returning *`,
          [stayId, minutes, amount]
        );
        return { stay: result.rows[0] };
      }

      case "set_type": {
        if (request.type !== "short" && request.type !== "night") {
          throw new UserError("Lloj i panjohur qëndrimi.");
        }
        // New price, and a deadline counted from the original check-in time
        const result = await client.query<Stay>(
          `update stays
              set stay_type = $2, base_price = stay_price($2), expected_out = stay_expected_out($2, check_in)
            where id = $1
           returning *`,
          [stayId, request.type]
        );
        return { stay: result.rows[0] };
      }

      case "cancel": {
        if (!isAdmin && secondsSince(stay.check_in) / 60 > WORKER_CANCEL_MINUTES) {
          throw new UserError(`Pas ${WORKER_CANCEL_MINUTES} minutash hyrjen mund ta anulojë vetëm administratori.`);
        }
        const result = await client.query<Stay>(
          "update stays set status = 'cancelled', check_out = now(), checked_out_by = $2 where id = $1 returning *",
          [stayId, userId]
        );
        return { stay: result.rows[0] };
      }

      default:
        throw new UserError("Veprim i panjohur.");
    }
  });
}

/**
 * All active rooms with their open stay (if any), sorted by room number as a
 * number, so room 9 comes before room 10.
 */
export async function listRooms(): Promise<RoomView[]> {
  return query<RoomView>(
    `select r.id, r.number,
            case when s.id is null then null else json_build_object(
              'id', s.id,
              'stay_type', s.stay_type,
              'check_in', s.check_in,
              'expected_out', s.expected_out,
              'base_price', s.base_price,
              'extra_charge', s.extra_charge,
              'checked_in_by', coalesce(nullif(u.full_name, ''), u.username)
            ) end as stay
       from rooms r
       left join stays s on s.room_id = r.id and s.status = 'open'
       left join users u on u.id = s.checked_in_by
      where r.active
      order by nullif(regexp_replace(r.number, '\\D', '', 'g'), '')::bigint nulls last, r.number`
  );
}
