# Hotel Room Tracker

Internal web app for a hotel that rents rooms for 2 hours or for the night.

Every room key card has a barcode sticker on the back. Reception scans it with a
USB barcode scanner:

- **first scan** (room free): check-in. Room, date and time are saved automatically.
- **next scan** (room occupied): check-out. The leaving time is saved.

The room board shows every room live: **green** = free, **red** = occupied. When
a guest's time is up the room **pulses** until a worker deals with it.

Stack: Next.js 16, PostgreSQL, Docker. Interface language: Albanian.

---

## Daily workflow

1. A guest asks for a room. The worker takes the card of a green room and scans
   it before handing it over.
2. The app creates the stay: from 21:00 to 06:00 a **night** stay (40 €, leave
   by 12:00), otherwise **2 hours** (20 €). The message after the scan has
   "Ndrysho në natë" (switch to night) and "Anulo" (undo).
3. When the time is up, the room pulses and a red banner names it. The worker
   checks the room:
   - **room empty**: scan the card left in the room, or tap the room and
     "Klienti u largua". Check-out, no extra charge.
   - **guest still inside**: tap the room, then +1 hour / +2 hours / night.

Other rules:
- The same card scanned twice within 20 seconds is ignored (double read).
- A worker can cancel a mistaken check-in within 10 minutes; an admin any time.
- If a barcode can't be read, type its number in the field at the top + Enter.
- Several devices can have the board open; they refresh every 5 seconds.

## Pages

| Page | Who | What |
|---|---|---|
| `/` | everyone | Room board |
| `/history` | everyone | Stays and revenue per period, per worker; CSV export (admin) |
| `/admin` | admin | Key cards and labels, rooms, prices, users |

---

## Hardware

- **Barcode scanner:** any USB or Bluetooth scanner in keyboard (HID) mode, set
  to send Enter after the code (the usual default). No driver needed. A 2D model
  with a stand is the most convenient.
- **Labels:** Administrimi → "Printo etiketat" prints 50 × 25 mm Code 128 labels
  for the back of the cards. Use sticker paper and cover them with clear tape.

Card codes are 8 digits on purpose: a scanner types like a US keyboard, and on
an Albanian keyboard layout letters and symbols can come out wrong, digits can't.

---

## Run it on your PC

Requires Docker Desktop.

```bash
docker compose up -d --build
docker compose exec app node scripts/setup-db.mjs --demo
```

Open http://localhost:3000 and log in with admin / admin123. `--demo` adds rooms
1-22 with one card each; type a card's code + Enter on the board to simulate a
scan. Without a `.env` file Docker uses test passwords: fine on a PC only.

To start over with an empty database: `docker compose down -v` (deletes all data).

## Run it on a server (Amazon Lightsail)

1. Create a Lightsail instance: Linux/Unix → OS Only → **Ubuntu 24.04**, 2 GB plan.
2. In its **Networking** tab, attach a static IP and allow **HTTPS (443)**.
3. **Connect using SSH** and run:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/elio-fyshku1/hotel-rooms/main/scripts/install-server.sh -o install.sh
   sudo bash install.sh
   ```
4. It prints the address and a random admin password. Write the password down.

- **Update** after pushing new code: `sudo bash /opt/hotel-rooms/scripts/install-server.sh` (data is kept).
- **HTTPS**: point a domain to the static IP, then
  `sudo DOMAIN=dhomat.example.al bash /opt/hotel-rooms/scripts/install-server.sh`.
- **Backups**: turn on automatic snapshots for the instance in Lightsail.

### First setup in Administrimi
1. **Dhomat**: type `1-22`, click "Shto dhomat".
2. **Kartat e dhomave**: "Krijo kartë për çdo dhomë pa kartë", then "Printo etiketat".
3. **Çmimet dhe rregullat**: check prices and hours.
4. **Përdoruesit**: add the workers.

A lost card: "Çaktivizo" it, add a new card for the room, print its label.

---

## Project structure

```
db/schema.sql               tables + SQL functions for the time rules (night window, deadlines, prices)
scripts/setup-db.mjs        creates/updates the tables and the admin user; --demo adds test rooms
scripts/install-server.sh   installs or updates the app on an Ubuntu server

lib/                        server code
  db.ts                     connection pool, query(), transaction()
  auth.ts                   login sessions
  stays.ts                  check-in / check-out rules, settings, room list
  history.ts                stay history (History page and CSV)
  errors.ts                 UserError and the API error wrapper
  format.ts                 money and time formatting (also used in the browser)
  types.ts                  types shared by server and browser

app/                        pages and API routes
  page.tsx                  room board
  history/page.tsx          history
  admin/page.tsx            administration
  admin/labels/page.tsx     printable labels
  api/scan                  a scanned card code
  api/rooms, api/stays      board data, stay actions
  api/admin/*               settings, rooms, cards, users
  api/history/csv           CSV export

components/
  NavBar.tsx, apiClient.ts  navigation bar, fetch helper
  dashboard/                room board: RoomBoard, RoomTile, RoomDialog, LateCheckoutDialog, Notice, useCardReader
  admin/                    AdminPanel and its sections, LabelSheet
```
