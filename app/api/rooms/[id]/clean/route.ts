/**
 * POST /api/rooms/:id/clean
 * Marks a room as cleaned so it shows as free again.
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { withErrorHandling } from "@/lib/errors";

// Clear the needs_cleaning flag of a room
export const POST = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;

    const { id } = await context.params;
    await query("update rooms set needs_cleaning = false where id = $1", [Number(id)]);
    return NextResponse.json({ ok: true });
  }
);
