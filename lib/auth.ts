/**
 * Login sessions.
 *
 * After a successful login the server puts a signed token (JWT) in an
 * HTTP-only cookie. The token only holds the user id; on every request the
 * user is loaded from the database again, so a deactivated worker is locked
 * out immediately instead of when the token expires. The same check applies
 * "workers only from the hotel" (lib/network.ts) on every request.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { query } from "./db";
import { clientIp, getHotelRule, isHotelIp } from "./network";
import type { SessionUser } from "./types";

const COOKIE_NAME = "hotel_session";
const SESSION_SECONDS = 14 * 60 * 60; // one long shift

/** Key used to sign and verify tokens, from SESSION_SECRET. */
function signingKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret || "development-only-secret");
}

/** Creates a session for the given user and sets the cookie. */
export async function createSession(userId: number): Promise<void> {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(signingKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true, // not readable from JavaScript in the page
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true", // enable once the app runs on HTTPS
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

/** Removes the session cookie (logout). */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Returns the logged-in user, or null if there is no valid session.
 * A worker outside the hotel's network (while that rule is on) counts as
 * logged out.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, signingKey());
    const rows = await query<SessionUser>(
      "select id, username, full_name, role from users where id = $1 and active",
      [payload.uid]
    );
    const user = rows[0];
    if (!user) return null;

    if (user.role === "worker") {
      const rule = await getHotelRule();
      if (rule.on && !isHotelIp(await clientIp(), rule)) return null;
    }
    return user;
  } catch {
    // Expired or tampered token
    return null;
  }
}

/**
 * For pages: returns the user or sends the browser to the login page.
 * With adminOnly = true, workers are sent back to the room board.
 */
export async function requireUser(adminOnly = false): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (adminOnly && user.role !== "admin") redirect("/");
  return user;
}

/**
 * For API routes: returns the user, or a JSON error response that the route
 * should return as-is.
 *
 *   const user = await requireApiUser();
 *   if (user instanceof NextResponse) return user;
 */
export async function requireApiUser(adminOnly = false): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Nuk jeni i identifikuar." }, { status: 401 });
  }
  if (adminOnly && user.role !== "admin") {
    return NextResponse.json({ error: "Vetëm për administratorët." }, { status: 403 });
  }
  return user;
}
