/**
 * Types shared between the server code and the browser components.
 *
 * Timestamps come out of PostgreSQL as Date objects but reach the browser as
 * ISO strings (after JSON), so they are typed as `string | Date` and always
 * wrapped in `new Date(...)` before use.
 */

export type Timestamp = string | Date;

/**
 * Workers can cancel a mistaken check-in only this many minutes after it was
 * made; admins at any time. Shared so the room dialog can show the time left.
 */
export const WORKER_CANCEL_MINUTES = 10;

export type StayType = "short" | "night";
export type StayStatus = "open" | "closed" | "cancelled";
export type UserRole = "admin" | "worker";

/** The single row of the `settings` table. Times are "HH:MM" strings. */
export interface Settings {
  hotel_name: string;
  currency: string;
  timezone: string;
  night_start: string;
  night_end: string;
  night_checkout: string;
  extra_hour_price: number;
  grace_minutes: number;
  require_cleaning: boolean;
}

/**
 * A row of the `packages` table: what the guest chooses when the room is given.
 * minutes = null is the night package (ends at settings.night_checkout).
 */
export interface Package {
  id: number;
  name: string;
  minutes: number | null;
  price: number;
  sort: number;
  active: boolean;
}

/** A row of the `stays` table. */
export interface Stay {
  id: number;
  room_id: number;
  card_id: number | null;
  stay_type: StayType;
  package_name: string;
  status: StayStatus;
  check_in: Timestamp;
  expected_out: Timestamp;
  check_out: Timestamp | null;
  base_price: number;
  extra_charge: number;
  currency: string;
  paid_amount: number;
  paid_at: Timestamp | null;
}

/** A room as shown on the dashboard, with its open stay (if any). */
export interface RoomView {
  id: number;
  number: string;
  floor: number | null;
  needs_cleaning: boolean;
  stay: null | {
    id: number;
    stay_type: StayType;
    package_name: string;
    check_in: Timestamp;
    expected_out: Timestamp;
    base_price: number;
    extra_charge: number;
    paid_amount: number;
    currency: string; // copied at check-in (stays from before the switch to lekë are in euro)
    checked_in_by: string;
  };
  // The room's last finished stay, if the guest left without paying all of it
  unpaid: null | {
    stay_id: number;
    amount: number;
    currency: string;
  };
}

/** Logged-in user, as stored in the session. */
export interface SessionUser {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
}

/**
 * Result of presenting a card to the reader.
 * The browser shows a different message / dialog for each case.
 * "choose_package": the room is free; the worker picks the package, then the
 * code is sent again with the package id to check the room in.
 */
export type ScanResult =
  | { result: "unknown_card"; code: string }
  | { result: "inactive_card"; room: string }
  | { result: "room_inactive"; room: string }
  | { result: "double_scan"; room: string }
  | { result: "needs_cleaning"; room: string }
  | { result: "choose_package"; room: string; code: string }
  | { result: "checked_in"; room: string; stay: Stay }
  | { result: "checked_out"; room: string; stay: Stay }
  | { result: "confirm_checkout"; room: string; stay: Stay; overtimeMinutes: number; suggestedExtra: number };

/**
 * Actions a worker can take on a stay ("pay" also works after check-out).
 * set_package switches to another package (e.g. from 2 to 3 hours): new price,
 * deadline counted again from the check-in time.
 */
export type StayAction =
  | { action: "pay" }
  | { action: "checkout"; extra?: number }
  | { action: "extend_hour" }
  | { action: "set_package"; packageId: number }
  | { action: "cancel" };
