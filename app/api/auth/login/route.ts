/**
 * POST /api/auth/login
 * Body: { username, password }
 * Checks the password and starts a session (cookie).
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { withErrorHandling } from "@/lib/errors";

// Compared against when the username doesn't exist, so the response time is
// the same for "wrong user" and "wrong password" and doesn't reveal which
// usernames exist.
const DUMMY_HASH = bcrypt.hashSync("dummy-password", 10);

// Check username/password and start a session
export const POST = withErrorHandling(async (request: Request) => {
  const { username, password } = await request.json();

  const rows = await query<{ id: number; password_hash: string }>(
    "select id, password_hash from users where lower(username) = lower($1) and active",
    [String(username ?? "").trim()]
  );
  const user = rows[0];

  const passwordOk = await bcrypt.compare(String(password ?? ""), user?.password_hash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    return NextResponse.json({ error: "Përdorues ose fjalëkalim i gabuar." }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
});
