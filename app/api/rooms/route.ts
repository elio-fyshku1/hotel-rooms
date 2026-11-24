/**
 * GET /api/rooms
 * Everything the room board needs: all rooms with their open stay, the
 * settings, and the server's clock (the browser uses it to correct its own
 * clock so countdowns are right even if the device time is off).
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { listRooms } from "@/lib/stays";
import { getSettings } from "@/lib/settings";
import { withErrorHandling } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const [rooms, settings] = await Promise.all([listRooms(), getSettings()]);
  return NextResponse.json({ serverTime: new Date().toISOString(), settings, rooms });
});
