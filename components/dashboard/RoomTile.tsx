"use client";
/**
 * One room on the board. Colour comes from its status (getRoomStatus below and
 * the .room.* classes in globals.css). Occupied rooms show the check-in time,
 * the deadline and a live countdown; once the time is up it counts upwards.
 */
import type { RoomView, Settings } from "@/lib/types";
import { formatCountdown, formatTime, stayTypeLabel } from "@/lib/format";

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

// Text under the room number for each status

const STATUS_TEXT: Record<RoomStatus, string> = {
  free: "E lirë",
  cleaning: "Për pastrim",
  occupied: "E zënë",
  ending: "E zënë",
  overdue: "Koha mbaroi",
};

interface RoomTileProps {
  room: RoomView;
  status: RoomStatus;
  now: number;
  settings: Settings;
  onOpen: () => void;
}

/** Coloured tile with number, status and, if occupied, times and countdown. */
export default function RoomTile({ room, status, now, settings, onOpen }: RoomTileProps) {
  const stay = room.stay;
  const remaining = stay ? new Date(stay.expected_out).getTime() - now : 0;

  return (
    <button type="button" className={`room ${status}`} onClick={onOpen}>
      <span className="room-number">{room.number}</span>
      <span className="room-status">{STATUS_TEXT[status]}</span>

      {stay && (
        <>
          <span className={`badge room-type ${stay.stay_type}`}>
            {stayTypeLabel(stay.stay_type, settings.short_minutes)}
          </span>
          <span className="room-times">
            Hyrja {formatTime(stay.check_in, settings.timezone)} · deri {formatTime(stay.expected_out, settings.timezone)}
          </span>
          <span className="room-timer">
            {remaining > 0 ? formatCountdown(remaining) : `+${formatCountdown(-remaining)}`}
          </span>
        </>
      )}
    </button>
  );
}
