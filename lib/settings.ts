/**
 * Reading the hotel settings (prices, time rules, timezone).
 */
import { pool, query, Queryable } from "./db";
import type { Settings } from "./types";

/**
 * Loads the settings row. Times are formatted as "HH:MM" so they can go
 * straight into <input type="time"> fields.
 */
export async function getSettings(db: Queryable = pool): Promise<Settings> {
  const rows = await query<Settings>(
    `select hotel_name, currency, timezone,
            short_price, short_minutes, night_price,
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
