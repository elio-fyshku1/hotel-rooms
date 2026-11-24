/**
 * Stay history for the History page and the CSV export.
 */
import { query } from "./db";
import type { StayStatus, StayType, Timestamp } from "./types";

export interface HistoryRow {
  id: number;
  room: string;
  stay_type: StayType;
  status: StayStatus;
  check_in: Timestamp;
  expected_out: Timestamp;
  check_out: Timestamp | null;
  minutes: number;
  base_price: number;
  extra_charge: number;
  total: number;
  paid_amount: number;
  due: number;
  currency: string;
  checked_in_by: string;
  checked_out_by: string | null;
}

/**
 * Stays whose check-in date (in the hotel's timezone) is between `from` and
 * `to`, both inclusive, newest first. Optionally only one room.
 *
 * `minutes` is the length of the stay so far for open stays.
 * `total` is 0 for cancelled stays so they don't count as revenue.
 * `due` is what the guest still owes (0 when fully paid or cancelled).
 */
export async function getHistory(from: string, to: string, room?: string): Promise<HistoryRow[]> {
  return query<HistoryRow>(
    `select s.id,
            r.number as room,
            s.stay_type,
            s.status,
            s.check_in,
            s.expected_out,
            s.check_out,
            round(extract(epoch from (coalesce(s.check_out, now()) - s.check_in)) / 60)::int as minutes,
            s.base_price,
            s.extra_charge,
            case when s.status = 'cancelled' then 0 else s.base_price + s.extra_charge end as total,
            s.paid_amount,
            case when s.status = 'cancelled' then 0
                 else greatest(s.base_price + s.extra_charge - s.paid_amount, 0) end as due,
            s.currency,
            coalesce(nullif(user_in.full_name, ''), user_in.username)   as checked_in_by,
            coalesce(nullif(user_out.full_name, ''), user_out.username) as checked_out_by
       from stays s
       join rooms r on r.id = s.room_id
       join settings st on st.id = 1
       left join users user_in  on user_in.id  = s.checked_in_by
       left join users user_out on user_out.id = s.checked_out_by
      where (s.check_in at time zone st.timezone)::date between $1::date and $2::date
        and ($3::text is null or r.number = $3)
      order by s.check_in desc`,
    [from, to, room || null]
  );
}
