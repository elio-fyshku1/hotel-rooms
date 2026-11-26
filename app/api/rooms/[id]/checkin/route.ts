/**
 * POST /api/rooms/:id/checkin
 * Body: { packageId }
 * Check-in from the room dialog, for when a card can't be read.
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { checkInWithoutCard } from "@/lib/stays";
import { withErrorHandling, UserError } from "@/lib/errors";

// Check a room in without a card, with the package chosen by the worker
export const POST = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    if (!Number.isInteger(body.packageId)) throw new UserError("Zgjidhni paketën.");

    const stay = await checkInWithoutCard(Number(id), user.id, body.packageId);
    return NextResponse.json({ stay });
  }
);
