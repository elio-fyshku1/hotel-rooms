/**
 * POST /api/auth/logout
 * Ends the session. A worker's logout closes their shift, is written to the
 * login history and emailed to the owner with the shift's cash (if login
 * alerts are on).
 */
import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { clientIp, getHotelRule, isHotelIp } from "@/lib/network";
import { alertLogin, logLogin } from "@/lib/notify";
import { closeShift } from "@/lib/shifts";

// Note the logout, then delete the session cookie
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user) {
    const ip = await clientIp();
    const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300);
    const fromHotel = isHotelIp(ip, await getHotelRule());
    await logLogin({ username: user.username, userId: user.id, result: "logout", ip, userAgent, fromHotel });
    if (user.role === "worker") {
      const shift = await closeShift(user.id);
      alertLogin({ name: user.full_name || user.username, kind: "logout", ip, userAgent, fromHotel, shift });
    }
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
