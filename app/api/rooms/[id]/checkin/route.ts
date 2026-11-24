/**
 * POST /api/rooms/:id/checkin
 * Body: { type?: "short" | "night" }
 * Check-in from the room dialog, for when a card can't be read.
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { checkInWithoutCard } from "@/lib/stays";
import { withErrorHandling } from "@/lib/errors";

// Check a room in without a card (type chosen by the worker)
export const POST = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const type = body.type === "short" || body.type === "night" ? body.type : null;

    const stay = await checkInWithoutCard(Number(id), user.id, type);
    return NextResponse.json({ stay });
  }
);
