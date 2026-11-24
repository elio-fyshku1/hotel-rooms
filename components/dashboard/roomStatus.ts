/**
 * Decides which colour/state a room tile shows.
 */
import type { RoomView } from "@/lib/types";

export type RoomStatus =
  | "free"      // green: no guest, ready
  | "cleaning"  // yellow: guest left, not cleaned yet
  | "occupied"  // red: guest inside, time remaining
  | "ending"    // red with orange border: less than 10 minutes left
  | "overdue";  // red, pulsing: time is up

const ENDING_SOON_MS = 10 * 60 * 1000;

/** Status of a room at the given moment (milliseconds, server-corrected). */
export function getRoomStatus(room: RoomView, now: number): RoomStatus {
  if (!room.stay) {
    return room.needs_cleaning ? "cleaning" : "free";
  }

  const remaining = new Date(room.stay.expected_out).getTime() - now;
  if (remaining <= 0) return "overdue";
  if (remaining <= ENDING_SOON_MS) return "ending";
  return "occupied";
}
