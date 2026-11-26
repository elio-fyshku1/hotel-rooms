/**
 * GET /api/rooms
 * Everything the room board needs: all rooms with their open stay, the
 * settings, the packages (and whether it is night now, to suggest the night
 * package), and the server's clock (the browser uses it to correct its own
 * clock so countdowns are right even if the device time is off).
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getSettings, isNightNow, listPackages, listRooms } from "@/lib/stays";
import { withErrorHandling } from "@/lib/errors";

// Rooms with their open stays, settings, packages and the server time
export const GET = withErrorHandling(async () => {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const [rooms, settings, packages, nightNow] = await Promise.all([
    listRooms(),
    getSettings(),
    listPackages(true),
    isNightNow(),
  ]);
  return NextResponse.json({ serverTime: new Date().toISOString(), settings, packages, nightNow, rooms });
});
