/**
 * POST /api/auth/logout
 * Ends the session.
 */
import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
