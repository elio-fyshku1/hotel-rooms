/**
 * GET /api/rooms
 * Everything the room board needs: all rooms with their open stay, the
 * settings, the packages (and whether it is night now, to suggest the night
 * package), the worker's current shift with its cash, and the server's clock
 * (the browser uses it to correct its own clock so countdowns are right even
 * if the device time is off).
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getSettings, isNightNow, listPackages, listRooms } from "@/lib/stays";
import { withErrorHandling } from "@/lib/errors";
import { currentShift } from "@/lib/shifts";

// Rooms with their open stays, settings, packages, shift and the server time
export const GET = withErrorHandling(async () => {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const [rooms, settings, packages, nightNow, shift] = await Promise.all([
    listRooms(),
    getSettings(),
    listPackages(true),
    isNightNow(),
    user.role === "worker" ? currentShift(user.id) : null, // admins have no shift
  ]);
  return NextResponse.json({ serverTime: new Date().toISOString(), settings, packages, nightNow, shift, rooms });
});
