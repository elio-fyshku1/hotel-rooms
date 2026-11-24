/**
 * User management. Admins only.
 *   POST  { username, full_name, password, role }   add a user
 *   PATCH { id, active?, role?, password? }         change a user
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { withErrorHandling, UserError } from "@/lib/errors";

const MIN_PASSWORD_LENGTH = 6;

/** Throws if the password is too short. */
function checkPassword(password: unknown): string {
  const value = String(password ?? "");
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new UserError(`Fjalëkalimi duhet të ketë të paktën ${MIN_PASSWORD_LENGTH} karaktere.`);
  }
  return value;
}

export const POST = withErrorHandling(async (request: Request) => {
  const admin = await requireApiUser(true);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json();
  const username = String(body.username ?? "").trim();
  if (!username) throw new UserError("Përdoruesi është i detyrueshëm.");

  const password = checkPassword(body.password);
  const role = body.role === "admin" ? "admin" : "worker";

  await query(
    "insert into users (username, full_name, password_hash, role) values ($1, $2, $3, $4)",
    [username, String(body.full_name ?? "").trim(), await bcrypt.hash(password, 10), role]
  );
  return NextResponse.json({ ok: true });
});

export const PATCH = withErrorHandling(async (request: Request) => {
  const admin = await requireApiUser(true);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json();

  // Stop an admin from locking themselves out
  if (body.id === admin.id && (body.active === false || body.role === "worker")) {
    throw new UserError("Nuk mund ta çaktivizoni ose ulni veten.");
  }

  if (body.password != null) {
    const password = checkPassword(body.password);
    await query("update users set password_hash = $2 where id = $1", [body.id, await bcrypt.hash(password, 10)]);
  }
  if (body.active != null) {
    await query("update users set active = $2 where id = $1", [body.id, Boolean(body.active)]);
  }
  if (body.role === "admin" || body.role === "worker") {
    await query("update users set role = $2 where id = $1", [body.id, body.role]);
  }

  return NextResponse.json({ ok: true });
});
