/**
 * Worker shifts and the cash taken in each one.
 *
 * Opening and closing happen at login and logout. The cash of a shift is
 * worked out from the payment events of that worker between the start and
 * the end of the shift; payments of stays that were later cancelled don't
 * count (the money went back to the guest). Admins don't have shifts.
 */
import { query } from "./db";

export interface ShiftSummary {
  id: number;
  user_name: string;
  started_at: string;
  ended_at: string | null;
  ended_by: "" | "logout" | "next_login";
  cash: number;
  payments: number;
}

// One row per shift with its cash, used by every query below
const SHIFT_SUMMARY = `
  select sh.id,
         coalesce(nullif(u.full_name, ''), u.username) as user_name,
         sh.started_at, sh.ended_at, sh.ended_by,
         coalesce(sum(e.amount) filter (where st.status <> 'cancelled'), 0) as cash,
         count(e.id) filter (where st.status <> 'cancelled')::int as payments
    from shifts sh
    join users u on u.id = sh.user_id
    left join stay_events e
           on e.kind = 'payment' and e.user_id = sh.user_id
          and e.at >= sh.started_at and e.at < coalesce(sh.ended_at, now())
    left join stays st on st.id = e.stay_id`;

/**
 * The hotel's shift times: hour (hotel time) at which each shift starts.
 * 08:00-16:00 shift 1, 16:00-23:00 shift 2, 23:00-08:00 shift 3.
 */
export const SHIFT_START_HOURS = [8, 16, 23];

/** Minutes after a shift time ends during which its worker still continues it. */
export const SHIFT_GRACE_MINUTES = 10;

/**
 * Starts the shift of a worker who just logged in. Open shifts of other
 * workers end here (they forgot to log out). If this worker already has an
 * open shift (second device), it simply continues.
 *
 * Logging out and back in within the same shift time (e.g. both between
 * 08:00 and 16:00) doesn't start over: the worker's last shift opens again
 * with its cash. This still holds up to SHIFT_GRACE_MINUTES after the shift
 * time ends (until 16:10 for the 08:00-16:00 shift). Later, a new shift
 * starts at 0.
 *
 * Returns the shift when an earlier one was continued, for the owner's email.
 */
export async function openShift(userId: number): Promise<ShiftSummary | null> {
  await query(
    `update shifts set ended_at = now(), ended_by = 'next_login'
      where ended_at is null and user_id <> $1`,
    [userId]
  );
  const open = await query(`select 1 from shifts where user_id = $1 and ended_at is null`, [userId]);
  if (open.length > 0) return null;

  // Start of the shift time we were in SHIFT_GRACE_MINUTES ago, as a local
  // hotel time: the latest of yesterday's and today's start hours that had
  // passed by then. The last shift continues if it ended after that.
  const reopened = await query<{ id: number }>(
    `with st as (select timezone as tz from settings where id = 1),
     window_start as (
       select max(b) as at
         from st,
              unnest($2::int[]) as h,
              unnest(array[-1, 0]) as d,
              lateral (select (now() at time zone st.tz)::date + d + make_interval(hours => h) as b) x
        where b <= (now() - make_interval(mins => $3)) at time zone st.tz
     ),
     last as (
       select id, ended_at from shifts
        where user_id = $1 order by started_at desc limit 1
     )
     update shifts sh set ended_at = null, ended_by = ''
       from last, st, window_start w
      where sh.id = last.id
        and last.ended_at at time zone st.tz >= w.at
     returning sh.id`,
    [userId, SHIFT_START_HOURS, SHIFT_GRACE_MINUTES]
  );
  if (reopened.length > 0) {
    const rows = await query<ShiftSummary>(`${SHIFT_SUMMARY} where sh.id = $1 group by sh.id, u.id`, [reopened[0].id]);
    return rows[0];
  }

  await query(`insert into shifts (user_id) values ($1)`, [userId]);
  return null;
}

/** Ends the worker's open shift (logout) and returns its summary, if there was one. */
export async function closeShift(userId: number): Promise<ShiftSummary | null> {
  const closed = await query<{ id: number }>(
    `update shifts set ended_at = now(), ended_by = 'logout'
      where user_id = $1 and ended_at is null
     returning id`,
    [userId]
  );
  if (closed.length === 0) return null;
  const rows = await query<ShiftSummary>(`${SHIFT_SUMMARY} where sh.id = $1 group by sh.id, u.id`, [closed[0].id]);
  return rows[0];
}

/** The worker's open shift with the cash so far, or null (no shift open). */
export async function currentShift(userId: number): Promise<ShiftSummary | null> {
  const rows = await query<ShiftSummary>(
    `${SHIFT_SUMMARY} where sh.user_id = $1 and sh.ended_at is null group by sh.id, u.id`,
    [userId]
  );
  return rows[0] ?? null;
}

/** Shifts started in the last `hours` hours, newest first (History page). */
export async function recentShifts(hours: number): Promise<ShiftSummary[]> {
  return query<ShiftSummary>(
    `${SHIFT_SUMMARY} where sh.started_at >= now() - make_interval(hours => $1)
      group by sh.id, u.id order by sh.started_at desc`,
    [hours]
  );
}
