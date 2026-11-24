/**
 * POST /api/admin/settings
 * Saves the hotel name, currency, prices and time rules. Admins only.
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { withErrorHandling, UserError } from "@/lib/errors";

const TIME_FORMAT = /^\d{2}:\d{2}$/;

/** Throws if the value is not a number >= 0. */
function nonNegative(value: unknown, fieldName: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new UserError(`Vlerë e pavlefshme për "${fieldName}".`);
  }
  return number;
}

// Validate the form values and save them in the settings row
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser(true);
  if (user instanceof NextResponse) return user;

  const body = await request.json();

  // Validate the time fields ("21:00")
  for (const field of ["night_start", "night_end", "night_checkout"]) {
    if (!TIME_FORMAT.test(String(body[field]))) {
      throw new UserError("Orët duhet të jenë në formatin 21:00.");
    }
  }

  const shortMinutes = Math.round(nonNegative(body.short_minutes, "Kohëzgjatja"));
  if (shortMinutes < 1) throw new UserError("Kohëzgjatja duhet të jetë të paktën 1 minutë.");

  await query(
    `update settings
        set hotel_name = $1, currency = $2,
            short_price = $3, short_minutes = $4, night_price = $5,
            night_start = $6, night_end = $7, night_checkout = $8,
            extra_hour_price = $9, grace_minutes = $10
      where id = 1`,
    [
      String(body.hotel_name || "Hotel").trim(),
      String(body.currency || "EUR").trim().toUpperCase(),
      nonNegative(body.short_price, "Çmimi 2 orë"),
      shortMinutes,
      nonNegative(body.night_price, "Çmimi natë"),
      body.night_start,
      body.night_end,
      body.night_checkout,
      nonNegative(body.extra_hour_price, "Shtesa për orë"),
      Math.round(nonNegative(body.grace_minutes, "Minuta tolerancë")),
    ]
  );

  return NextResponse.json({ ok: true });
});
