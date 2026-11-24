# Hotel Room Tracker

Internal web app for a hotel/motel that rents rooms for short stays (2 hours) and for the night.

Each room key card has a barcode sticker on the back. Reception scans the card with a USB barcode scanner:

- **first scan** (room free) → check-in: room, date and entry time are saved automatically
- **next scan** (room occupied) → check-out: leaving time is saved

The room board shows every room live: **green** = free, **red** = occupied, **yellow** = waiting for cleaning. When a guest's time is up, the room **pulses and shakes** until a worker deals with it.

Stack: Next.js 16 (App Router), PostgreSQL (`pg`), cookie sessions (`jose`), `bcryptjs`, `jsbarcode`.
Interface language: Albanian.

---

## Daily workflow

1. A guest asks for a room. The worker takes the card of a **green** room and scans the barcode before handing it over.
2. The app creates the stay:
   - from 21:00 to 06:00 → **night** stay (40 €, leave by 12:00)
   - otherwise → **2 hours** (20 €)

   A message confirms the room, times and price, with **"Ndrysho në natë"** (switch to night) and **"Anulo"** (undo) buttons.
3. When the time is up, the room pulses on the board and a red banner names it. The worker goes to check the room.
4. Guests usually pay up front and often leave the card in the room:
   - **room empty** → take the card and scan it (or tap the room → "Klienti u largua"): check-out, **no extra charge** by default;
   - **guest still inside** → tap the room → +1 hour / +2 hours / night, or check out with an extra amount.
5. After check-out the room turns yellow until someone taps "Shëno si të pastruar" (this step can be turned off).

Other rules:
- The same card scanned twice within 20 seconds is ignored (scanners sometimes read twice).
- A worker can cancel a mistaken check-in within 10 minutes; an admin at any time.
- Every action is stored in `stay_events` with the user who did it. The History page shows revenue and check-ins per worker.
- Several devices can have the board open; they refresh every 5 seconds and the database never allows two open stays for one room.

## Pages

| Page | Access | Content |
|---|---|---|
| `/` | everyone | Room board, scan field, room dialogs |
| `/history` | everyone | Stays by period/room, totals, per worker; CSV export for admins |
| `/admin` | admin | Key cards, rooms, prices and rules, users |
| `/admin/labels` | admin | Printable barcode labels |

---

## Hardware

### Barcode scanner
Any USB (or Bluetooth) barcode scanner in **keyboard (HID) mode**, which is how almost all of them ship. No driver or extra software is needed: the scanner "types" the code and presses Enter, and the room board listens for that on the whole page.

- A **2D imager** scanner is recommended over a laser one. It reads from any angle and copes with scratched labels.
- A model with a **stand** ("presentation mode") lets the worker just hold the card under it.
- Check the scanner is set to add **Enter** (CR) after the code. This is usually the default; it can be changed by scanning a setup barcode from its manual.

Card codes are **digits only** because a scanner types like a US keyboard. On a PC with the Albanian layout (QWERTZ), letters such as Y/Z and symbols such as `-` would come out wrong, but digits are the same on every layout.

### Labels
`/admin/labels` prints 50 × 25 mm labels (Code 128) to fit the back of a standard 85 × 54 mm card. Print on sticker paper with a laser printer, stick them on, and cover each with clear tape so they survive daily use.

---

## Installation

Requirements: Node.js 20+ and PostgreSQL 13+.

```bash
cp .env.example .env          # set DATABASE_URL and SESSION_SECRET
npm install
npm run db:setup              # creates the tables and the admin user
npm run build
npm start                     # http://localhost:3000, login admin / admin123
```

`npm run db:setup -- --demo` also adds rooms 1-22 with one card each, for testing. Type a card code from Administrimi + Enter on the board to simulate a scan.

### First setup in Administrimi
1. **Dhomat**: add the rooms: type `1-22` and click "Shto dhomat" (leave Kati empty to show all rooms in one group).
2. **Kartat e dhomave**: click "Krijo kartë për çdo dhomë pa kartë", then **Printo etiketat** and stick each label on the card of that room.
   To register stickers that already have a barcode, choose the room, put the cursor in the code field and scan; the room selection moves to the next room by itself.
3. **Çmimet dhe rregullat**: check prices, night hours and currency.
4. **Përdoruesit**: change the admin password and add the workers.

A lost card: click "Çaktivizo" on it, then add a new card for that room and print its label.

### Docker

```bash
# change the passwords and SESSION_SECRET in docker-compose.yml first
docker compose up -d --build
docker compose exec app node scripts/setup-db.mjs
```

### HTTPS
Put Caddy or Nginx in front, then set `COOKIE_SECURE=true`. Example `Caddyfile`:

```
rooms.example.al {
  reverse_proxy localhost:3000
}
```

HTTPS also lets the browser keep the screen on while the board is open (Screen Wake Lock).

---

## Settings (Administrimi → Çmimet dhe rregullat)

| Setting | Default |
|---|---|
| Short stay price / length | 20 € / 120 min |
| Night price | 40 € |
| Night window (check-ins become "night") | 21:00 - 06:00 |
| Night guests leave by | 12:00 |
| Extra per started overtime hour | 10 € |
| Grace period before an extra is suggested | 10 min |
| Cleaning step after check-out | on |
| Currency / timezone | EUR / Europe/Tirane |

---

## Project structure

```
db/schema.sql                 tables, indexes and the SQL functions for the time rules
scripts/setup-db.mjs          applies the schema, creates the admin user, optional demo data

lib/
  db.ts                       connection pool, query() and transaction()
  auth.ts                     login sessions
  stays.ts                    settings, overtime, check-in / check-out (scanCard, applyStayAction, listRooms)
  history.ts                  history query (History page and CSV)
  format.ts                   money / time formatting (server and browser)
  errors.ts                   UserError and the API error wrapper
  types.ts                    types shared by server and browser

app/                          pages and API routes (Next.js App Router)
  page.tsx                    room board
  history/page.tsx            history
  admin/page.tsx              administration
  admin/labels/page.tsx       printable labels
  api/scan                    POST a scanned code
  api/rooms, api/stays        room board data and stay actions
  api/admin/*                 settings, rooms, cards (incl. code generation), users
  api/history/csv             CSV export

components/
  NavBar.tsx                  top navigation
  apiClient.ts                fetch wrapper for the API
  dashboard/                  room board: RoomBoard, RoomTile, RoomDialog, LateCheckoutDialog, Notice, hooks
  admin/                      AdminPanel and its sections, LabelSheet
```

## Planned for a later phase
- Notifying the worker (phone/bell) when a room's time is up
- Payment tracking per shift (cash / card)
