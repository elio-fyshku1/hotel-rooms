/**
 * Key card management. Admins only.
 *
 *   POST  { room_id }               new card with a generated code (print its label)
 *   POST  { room_id, code }         register a card whose barcode already exists
 *                                   (scan the sticker into the code field)
 *   POST  { allRoomsWithoutCard }   one new card for every active room that has none
 *   PATCH { id, active }            enable / disable a card (e.g. lost card)
 */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { generateUniqueCardCode } from "@/lib/cardCodes";
import { withErrorHandling, UserError } from "@/lib/errors";

/** Inserts a card for a room, naming it "Karta 1", "Karta 2", ... within that room. */
async function addCard(roomId: number, code: string): Promise<{ code: string; label: string }> {
  const countRows = await query<{ count: number }>(
    "select count(*)::int as count from key_cards where room_id = $1",
    [roomId]
  );
  const label = `Karta ${countRows[0].count + 1}`;
  await query("insert into key_cards (code, room_id, label) values ($1, $2, $3)", [code, roomId, label]);
  return { code, label };
}

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser(true);
  if (user instanceof NextResponse) return user;

  const body = await request.json();

  // --- Bulk: one card for every room that doesn't have an active one ---
  if (body.allRoomsWithoutCard) {
    const rooms = await query<{ id: number }>(
      `select r.id from rooms r
        where r.active
          and not exists (select 1 from key_cards k where k.room_id = r.id and k.active)`
    );
    for (const room of rooms) {
      await addCard(room.id, await generateUniqueCardCode());
    }
    return NextResponse.json({ ok: true, added: rooms.length });
  }

  // --- Single card ---
  const roomId = Number(body.room_id);
  if (!roomId) throw new UserError("Zgjidhni dhomën.");

  const scannedCode = String(body.code ?? "").trim().toUpperCase();
  if (!scannedCode) {
    return NextResponse.json({ ok: true, ...(await addCard(roomId, await generateUniqueCardCode())) });
  }

  if (scannedCode.length < 4) throw new UserError("Kodi i kartës është shumë i shkurtër.");

  // Clear message if this code is already in use (and by which room)
  const existing = await query<{ number: string }>(
    "select r.number from key_cards k join rooms r on r.id = k.room_id where k.code = $1",
    [scannedCode]
  );
  if (existing[0]) {
    throw new UserError(`Ky kod është regjistruar tashmë për dhomën ${existing[0].number}.`);
  }

  return NextResponse.json({ ok: true, ...(await addCard(roomId, scannedCode)) });
});

export const PATCH = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser(true);
  if (user instanceof NextResponse) return user;

  const { id, active } = await request.json();
  await query("update key_cards set active = $2 where id = $1", [id, Boolean(active)]);
  return NextResponse.json({ ok: true });
});
