/**
 * Packages (what the guest chooses at check-in) and their prices. Admins only.
 *   POST   { name, hours, price }                 add a package
 *   PATCH  { id, name, hours, price, active }     change a package
 *   DELETE { id }                                 remove a package
 *
 * hours empty = night package (ends at the night check-out time).
 * Stays keep their own copy of name and price, so none of these changes
 * touch past or current stays.
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { withErrorHandling, UserError } from "@/lib/errors";

/** Checks the form values and turns hours into minutes (null for the night). */
function readPackage(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  if (!name) throw new UserError("Shkruani emrin e paketës (p.sh. 3 orë).");

  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) throw new UserError("Çmim i pavlefshëm.");

  let minutes: number | null = null;
  if (body.hours !== "" && body.hours != null) {
    const hours = Number(body.hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 72) {
      throw new UserError("Orët duhet të jenë midis 0 dhe 72 (bosh = natë).");
    }
    minutes = Math.round(hours * 60);
  }

  return { name, price, minutes };
}

// Add a package at the end of the list
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser(true);
  if (user instanceof NextResponse) return user;

  const { name, price, minutes } = readPackage(await request.json());
  await query(
    `insert into packages (name, minutes, price, sort)
     values ($1, $2, $3, (select coalesce(max(sort), 0) + 1 from packages))`,
    [name, minutes, price]
  );
  return NextResponse.json({ ok: true });
});

// Change name, length, price or active flag of a package
export const PATCH = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser(true);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const { name, price, minutes } = readPackage(body);
  await query("update packages set name = $2, minutes = $3, price = $4, active = $5 where id = $1", [
    Number(body.id),
    name,
    minutes,
    price,
    body.active !== false,
  ]);
  return NextResponse.json({ ok: true });
});

// Remove a package (stays that used it keep its name and price)
export const DELETE = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser(true);
  if (user instanceof NextResponse) return user;

  const { id } = await request.json();
  await query("delete from packages where id = $1", [Number(id)]);
  return NextResponse.json({ ok: true });
});
