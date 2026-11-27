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
 * Starts the shift of a worker who just logged in. Open shifts of other
 * workers end here (they forgot to log out). If this worker already has an
 * open shift (second device, or logging in again), it simply continues.
 */
export async function openShift(userId: number): Promise<void> {
  await query(
    `update shifts set ended_at = now(), ended_by = 'next_login'
      where ended_at is null and user_id <> $1`,
    [userId]
  );
  await query(
    `insert into shifts (user_id)
     select $1 where not exists (select 1 from shifts where user_id = $1 and ended_at is null)`,
    [userId]
  );
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
