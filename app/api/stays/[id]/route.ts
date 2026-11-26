/**
 * POST /api/stays/:id
 * Body: one of the StayAction objects (pay, checkout, extend_hour, set_package, cancel).
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { applyStayAction } from "@/lib/stays";
import { withErrorHandling } from "@/lib/errors";

// Apply a worker action (pay, checkout, extend_hour, set_package, cancel) to a stay
export const POST = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireApiUser();
    if (user instanceof NextResponse) return user;

    const { id } = await context.params;
    const action = await request.json();

    const result = await applyStayAction(Number(id), user.id, action);
    return NextResponse.json(result);
  }
);
