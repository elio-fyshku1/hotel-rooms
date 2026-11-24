/**
 * Overtime calculation. Pure functions with no database access, so the same
 * rule is used by the server (when a late card is scanned) and the browser
 * (when the room dialog is opened).
 */
import type { Settings, Timestamp } from "./types";

export interface Overtime {
  /** Minutes past the expected checkout time (0 if not late). */
  minutes: number;
  /** Suggested extra charge: per started hour, only after the grace period. */
  charge: number;
}

/**
 * How late a stay is at `now` and what the suggested extra charge would be.
 *
 * Example with grace 10 min and 10 EUR/hour:
 *   8 min late  -> 0 EUR (inside grace)
 *   25 min late -> 10 EUR (1 started hour)
 *   70 min late -> 20 EUR (2 started hours)
 */
export function calculateOvertime(expectedOut: Timestamp, now: Date, settings: Settings): Overtime {
  const minutesLate = Math.floor((now.getTime() - new Date(expectedOut).getTime()) / 60000);

  if (minutesLate <= settings.grace_minutes) {
    return { minutes: Math.max(minutesLate, 0), charge: 0 };
  }

  const startedHours = Math.ceil(minutesLate / 60);
  return { minutes: minutesLate, charge: startedHours * settings.extra_hour_price };
}
