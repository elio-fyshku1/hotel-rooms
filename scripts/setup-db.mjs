/**
 * Database setup script.
 *
 * Applies db/schema.sql and creates the first admin account.
 *
 *   npm run db:setup              schema + admin user
 *   npm run db:setup -- --demo    also creates rooms 1-22, each with one card
 *                                 (codes are listed in Administrimi; type a code +
 *                                 Enter on the room board to simulate a scan)
 *
 * Reads DATABASE_URL, ADMIN_USERNAME and ADMIN_PASSWORD from the environment / .env.
 */
import { readFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

// 1. Tables and functions
const schemaSql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
await client.query(schemaSql);
console.log("Schema applied.");

// 2. First admin account (only if it doesn't exist yet)
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

const existingAdmin = await client.query("select id from users where username = $1", [adminUsername]);
if (existingAdmin.rowCount === 0) {
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await client.query(
    "insert into users (username, full_name, password_hash, role) values ($1, 'Administrator', $2, 'admin')",
    [adminUsername, passwordHash]
  );
  console.log(`Admin user created: ${adminUsername} / ${adminPassword} (change the password after the first login).`);
} else {
  console.log(`Admin user "${adminUsername}" already exists, left unchanged.`);
}

/** 8 random digits, same format as the codes made in Administrimi. */
function randomCardCode() {
  return String(randomInt(10_000_000, 100_000_000));
}

// 3. Optional demo data
if (process.argv.includes("--demo")) {
  for (let roomNumber = 1; roomNumber <= 22; roomNumber++) {
    const room = await client.query(
      `insert into rooms (number) values ($1)
       on conflict (number) do update set number = excluded.number
       returning id`,
      [String(roomNumber)]
    );
    const roomId = room.rows[0].id;

    // Only add a card if the room doesn't have one yet (script can be re-run)
    const cards = await client.query("select 1 from key_cards where room_id = $1", [roomId]);
    if (cards.rowCount === 0) {
      await client.query("insert into key_cards (code, room_id, label) values ($1, $2, 'Karta 1')", [
        randomCardCode(),
        roomId,
      ]);
    }
  }
  console.log("Demo rooms 1-22 created, one card each.");
}

await client.end();
