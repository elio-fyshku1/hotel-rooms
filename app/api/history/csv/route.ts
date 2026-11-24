/**
 * GET /api/history/csv?from=YYYY-MM-DD&to=YYYY-MM-DD&room=101
 * Downloads the stays of a period as a CSV file (opens in Excel). Admins only.
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getHistory } from "@/lib/history";
import { getSettings } from "@/lib/stays";
import { withErrorHandling } from "@/lib/errors";

/** Date -> "2026-11-22 14:05:00" in the hotel's timezone ("" when empty). */
function csvDate(value: string | Date | null, timezone: string): string {
  if (!value) return "";
  return new Date(value).toLocaleString("sv-SE", { timeZone: timezone });
}

/** Quotes a value if it contains a comma, quote or line break. */
function csvField(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Build the CSV for the requested period and send it as a download
export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser(true);
  if (user instanceof NextResponse) return user;

  const settings = await getSettings();
  const tz = settings.timezone;

  // Period from the URL; default is today in the hotel's timezone
  // ("sv-SE" happens to format dates as YYYY-MM-DD)
  const params = new URL(request.url).searchParams;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: tz });
  const from = params.get("from") || today;
  const to = params.get("to") || from;
  const rows = await getHistory(from, to, params.get("room") || undefined);

  // One line per stay

  const header = [
    "id", "dhoma", "lloji", "statusi", "hyrja", "afati", "dalja", "minuta",
    "cmimi", "shtese", "totali", "monedha", "hyrja_nga", "dalja_nga",
  ];
  const lines = rows.map((r) =>
    [
      r.id, r.room, r.stay_type, r.status,
      csvDate(r.check_in, tz), csvDate(r.expected_out, tz), csvDate(r.check_out, tz),
      r.minutes, r.base_price, r.extra_charge, r.total, r.currency,
      r.checked_in_by, r.checked_out_by,
    ]
      .map(csvField)
      .join(",")
  );

  // The BOM at the start makes Excel read the file as UTF-8 (ë, ç)
  const csv = "\uFEFF" + [header.join(","), ...lines].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="qendrimet_${from}_${to}.csv"`,
    },
  });
});
