/**
 * Generates the codes printed as barcodes on the back of the key cards.
 *
 * Codes are 8 random digits. Digits only, on purpose: a USB barcode scanner
 * "types" the code like a US keyboard, and on a PC set to another layout
 * (the Albanian layout swaps Y and Z, and moves - and other symbols) letters
 * and symbols can come out wrong. Digits are in the same place on every
 * layout. Random (not the room number) so a lost card can be replaced with a
 * new code without changing the other cards of that room.
 */
import { randomInt } from "node:crypto";
import { query } from "./db";

const CODE_LENGTH = 8;

/** One random code, e.g. "40817263". The first digit is never 0. */
function randomCode(): string {
  let code = String(randomInt(1, 10));
  for (let i = 1; i < CODE_LENGTH; i++) code += String(randomInt(0, 10));
  return code;
}

/** A random code that no existing card uses yet. */
export async function generateUniqueCardCode(): Promise<string> {
  // With 90 million possible codes a collision is very unlikely; retry anyway.
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const existing = await query("select 1 from key_cards where code = $1", [code]);
    if (existing.length === 0) return code;
  }
  throw new Error("Could not generate a unique card code");
}
