/**
 * Rooms management. Admins only.
 *   POST  { numbers: "1-22, 30" }   add one or more rooms
 *   PATCH { id, active }            enable / disable a room
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { withErrorHandling, UserError } from "@/lib/errors";

/**
 * Turns "1-4, 10 12" into ["1","2","3","4","10","12"].
 * A range can have at most 500 rooms, to catch typos like "1-2200".
 */
function parseRoomNumbers(input: string): string[] {
  const numbers: string[] = [];

  for (const part of input.split(/[,\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (!range) {
      numbers.push(part);
      continue;
    }
    const first = Number(range[1]);
    const last = Number(range[2]);
    if (last < first || last - first > 500) {
      throw new UserError(`Interval i gabuar: ${part}`);
    }
    for (let n = first; n <= last; n++) numbers.push(String(n));
  }

  return numbers;
}

// Add rooms from a list/range; an existing room number is just re-enabled
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser(true);
  if (user instanceof NextResponse) return user;

  const { numbers } = await request.json();
  const roomNumbers = parseRoomNumbers(String(numbers ?? ""));
  if (roomNumbers.length === 0) throw new UserError("Shkruani të paktën një numër dhome.");

  // Adding a room that already exists just re-enables it
  for (const number of roomNumbers) {
    await query("insert into rooms (number) values ($1) on conflict (number) do update set active = true", [number]);
  }

  return NextResponse.json({ ok: true, added: roomNumbers.length });
});

// Enable or disable a room
export const PATCH = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser(true);
  if (user instanceof NextResponse) return user;

  const { id, active } = await request.json();
  await query("update rooms set active = $2 where id = $1", [id, Boolean(active)]);
  return NextResponse.json({ ok: true });
});
