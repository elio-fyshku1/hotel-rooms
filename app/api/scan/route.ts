/**
 * POST /api/scan
 * Body: { code }
 * Called for every scanned card. Checks the card's room in or out, depending
 * on whether it has a guest (see scanCard in lib/stays.ts).
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { scanCard } from "@/lib/stays";
import { withErrorHandling, UserError } from "@/lib/errors";

// Check in or check out the room of the scanned card
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const { code } = await request.json();
  if (typeof code !== "string" || !code.trim()) {
    throw new UserError("Kodi i kartës mungon.");
  }

  const result = await scanCard(code, user.id);
  return NextResponse.json(result);
});
