/**
 * POST /api/auth/login
 * Body: { username, password }
 * Checks the password and starts a session (cookie).
 *
 * Every attempt goes into login_log. Workers:
 *   - are refused outside the hotel's network when that rule is on
 *     (the owner gets an email with the address they tried from),
 *   - trigger an email to the owner on every successful login (if enabled),
 *   - start a shift (lib/shifts.ts): the shift cash on the board starts at 0,
 *     unless they log back in within the same shift time and it continues.
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { clientIp, getHotelRule, isHotelIp } from "@/lib/network";
import { alertLogin, logLogin } from "@/lib/notify";
import { openShift } from "@/lib/shifts";
import { withErrorHandling } from "@/lib/errors";

// Compared against when the username doesn't exist, so the response time is
// the same for "wrong user" and "wrong password" and doesn't reveal which
// usernames exist.
const DUMMY_HASH = bcrypt.hashSync("dummy-password", 10);

interface LoginUser {
  id: number;
  password_hash: string;
  full_name: string;
  username: string;
  role: "admin" | "worker";
}

// Check username/password and the hotel network rule, then start a session
export const POST = withErrorHandling(async (request: Request) => {
  const { username, password } = await request.json();
  const typedName = String(username ?? "").trim();
  const ip = await clientIp();
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300);
  const rule = await getHotelRule();
  const fromHotel = isHotelIp(ip, rule);

  const rows = await query<LoginUser>(
    `select id, password_hash, full_name, username, role
       from users where lower(username) = lower($1) and active`,
    [typedName]
  );
  const user = rows[0];
  const entry = { username: user?.username ?? typedName.slice(0, 100), userId: user?.id ?? null, ip, userAgent, fromHotel };

  const passwordOk = await bcrypt.compare(String(password ?? ""), user?.password_hash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    await logLogin({ ...entry, result: "wrong_password" });
    return NextResponse.json({ error: "Përdorues ose fjalëkalim i gabuar." }, { status: 401 });
  }

  const name = user.full_name || user.username;

  if (user.role === "worker" && rule.on && !fromHotel) {
    await logLogin({ ...entry, result: "outside_hotel" });
    alertLogin({ name, kind: "blocked", ip, userAgent, fromHotel });
    return NextResponse.json(
      { error: "Punonjësit mund të hyjnë në sistem vetëm nga interneti i hotelit." },
      { status: 403 }
    );
  }

  await createSession(user.id);
  await logLogin({ ...entry, result: "ok" });
  if (user.role === "worker") {
    const continued = await openShift(user.id);
    alertLogin({ name, kind: "login", ip, userAgent, fromHotel, shift: continued });
  }
  return NextResponse.json({ ok: true });
});
