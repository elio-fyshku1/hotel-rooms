/**
 * Types shared by the server code and the browser components.
 *
 * Timestamps come out of PostgreSQL as Date objects but reach the browser as
 * ISO strings (after JSON), so they are typed as `string | Date` and always
 * passed through `new Date(...)` before use.
 */

export type Timestamp = string | Date;

export type StayType = "short" | "night";
export type StayStatus = "open" | "closed" | "cancelled";

/** The single row of the `settings` table. Times are "HH:MM" strings. */
export interface Settings {
  hotel_name: string;
  currency: string;
  timezone: string;
  short_price: number;
  short_minutes: number;
  night_price: number;
  night_start: string;
  night_end: string;
  night_checkout: string;
  extra_hour_price: number;
  grace_minutes: number;
}

/** A row of the `stays` table. */
export interface Stay {
  id: number;
  room_id: number;
  stay_type: StayType;
  status: StayStatus;
  check_in: Timestamp;
  expected_out: Timestamp;
  check_out: Timestamp | null;
  base_price: number;
  extra_charge: number;
}

/** A room as shown on the board, with its open stay if it has a guest. */
export interface RoomView {
  id: number;
  number: string;
  stay: null | {
    id: number;
    stay_type: StayType;
    check_in: Timestamp;
    expected_out: Timestamp;
    base_price: number;
    extra_charge: number;
    checked_in_by: string;
  };
}

/** The logged-in user. */
export interface SessionUser {
  id: number;
  username: string;
  full_name: string;
  role: "admin" | "worker";
}

/**
 * What happened when a card was scanned. The board shows a different message
 * or dialog for each result.
 */
export type ScanResult =
  | { result: "unknown_card"; code: string }
  | { result: "inactive_card"; room: string }
  | { result: "room_inactive"; room: string }
  | { result: "double_scan"; room: string }
  | { result: "checked_in"; room: string; stay: Stay }
  | { result: "checked_out"; room: string; stay: Stay }
  | { result: "confirm_checkout"; room: string; stay: Stay; overtimeMinutes: number; suggestedExtra: number };

/** Actions a worker can take on an open stay. */
export type StayAction =
  | { action: "checkout"; extra?: number }
  | { action: "extend"; kind: "hour" | "block" }
  | { action: "set_type"; type: StayType }
  | { action: "cancel" };
