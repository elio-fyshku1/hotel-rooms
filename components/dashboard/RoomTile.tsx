"use client";
/**
 * One room on the board.
 *   free     green
 *   occupied red, with check-in time, deadline and a countdown
 *   overdue  red and pulsing (see .room.overdue in globals.css); the timer
 *            counts upwards from the deadline
 */
import type { RoomView, Settings } from "@/lib/types";
import { formatCountdown, formatTime, stayTypeLabel } from "@/lib/format";

export type RoomStatus = "free" | "occupied" | "overdue";

/** Status of a room at the given moment (milliseconds, already corrected to server time). */
export function getRoomStatus(room: RoomView, now: number): RoomStatus {
  if (!room.stay) return "free";
  return new Date(room.stay.expected_out).getTime() <= now ? "overdue" : "occupied";
}

// Text under the room number
const STATUS_TEXT: Record<RoomStatus, string> = {
  free: "E lirë",
  occupied: "E zënë",
  overdue: "Koha mbaroi",
};

interface RoomTileProps {
  room: RoomView;
  now: number;
  settings: Settings;
  onOpen: () => void;
}

/** Coloured tile; occupied tiles open the room dialog when tapped. */
export default function RoomTile({ room, now, settings, onOpen }: RoomTileProps) {
  const status = getRoomStatus(room, now);
  const stay = room.stay;

  // Free rooms have nothing to manage: they are checked in by scanning a card
  if (!stay) {
    return (
      <div className="room free">
        <span className="room-number">{room.number}</span>
        <span className="room-status">{STATUS_TEXT.free}</span>
      </div>
    );
  }

  // Time left until the deadline (negative once it has passed)
  const remaining = new Date(stay.expected_out).getTime() - now;

  return (
    <button type="button" className={`room ${status}`} onClick={onOpen}>
      <span className="room-number">{room.number}</span>
      <span className="room-status">{STATUS_TEXT[status]}</span>
      <span className={`badge room-type ${stay.stay_type}`}>{stayTypeLabel(stay.stay_type, settings.short_minutes)}</span>
      <span className="room-times">
        Hyrja {formatTime(stay.check_in, settings.timezone)} · deri {formatTime(stay.expected_out, settings.timezone)}
      </span>
      <span className="room-timer">{remaining > 0 ? formatCountdown(remaining) : `+${formatCountdown(-remaining)}`}</span>
    </button>
  );
}
