/**
 * Error handling for API routes.
 */
import { NextResponse } from "next/server";

/**
 * An error caused by the user's input or by the current state of the data
 * (e.g. "room already occupied"). Its message is safe to show in the browser.
 */
export class UserError extends Error {}

/**
 * Wraps a route handler so that:
 *   - UserError becomes a 400 response with the error message
 *   - a unique-constraint violation becomes a 409 response
 *   - anything else is logged and returned as a generic 500
 */
export function withErrorHandling<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof UserError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      // 23505 = unique_violation in PostgreSQL
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json({ error: "Ky regjistrim ekziston tashmë." }, { status: 409 });
      }

      console.error(error);
      return NextResponse.json({ error: "Gabim në server." }, { status: 500 });
    }
  };
}
