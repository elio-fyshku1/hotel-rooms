# Hotel Room Tracker

Internal web app for a hotel/motel that rents rooms by the hour (2, 3, 4, 5 hours), for 24 hours or for the night.

Each room key card has a barcode sticker on the back. Reception scans the card with a USB barcode scanner:

- **first scan** (room free) → the worker picks the package, then check-in: room, date and entry time are saved automatically
- **next scan** (room occupied) → check-out: leaving time is saved

The room board shows every room live: **green** = free, **red** = occupied, **yellow** = waiting for cleaning. When a guest's time is up, the room **pulses and shakes** until a worker deals with it.

Stack: Next.js 16 (App Router), PostgreSQL (`pg`), cookie sessions (`jose`), `bcryptjs`, `jsbarcode`.
Interface language: Albanian.

---

## Daily workflow

1. A guest asks for a room. The worker takes the card of a **green** room and scans the barcode before handing it over.
2. The app asks for the package, each button showing its price and when the time ends:

   | Package | Price | Countdown |
   |---|---|---|
   | 2 orë | 2000 Lekë | 2 hours from check-in |
   | 3 orë | 2500 Lekë | 3 hours |
   | 4 orë | 3000 Lekë | 4 hours |
   | 5 orë | 3500 Lekë | 5 hours |
   | 24 orë | 4000 Lekë | 24 hours |
   | Natë | 3500 Lekë | until 12:00 the next morning |

   From 21:00 to 06:00 the night package is highlighted. The stay starts when the package is chosen,
   then the app asks **"Dëshironi të paguani tani?"**. Prices, names and packages are changed in Administrimi → Paketat dhe çmimet.
3. When the time is up, the room pulses on the board and a red banner names it. The worker goes to check the room.
4. Guests usually pay up front and often leave the card in the room:
   - **room empty** → take the card and scan it (or tap the room → "Klienti u largua"): check-out, **no extra charge** by default;
   - **guest still inside** → tap the room → +1 hour (500 Lekë), switch to another package (e.g. 2 → 4 hours: new price, time counted from check-in), or check out with an extra amount.
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
| `/admin` | admin | Key cards, rooms, packages and prices, rules, users |
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

### Docker on your PC

```bash
docker compose up -d --build
docker compose exec app node scripts/setup-db.mjs --demo
```

Then open http://localhost:3000 (admin / admin123). Without a `.env` file the
compose file uses test passwords, which is fine on your own PC only.

### Server (Amazon Lightsail)

1. Create a Lightsail instance: **Linux/Unix → OS Only → Ubuntu 24.04**, 2 GB plan.
2. In the instance's **Networking** tab: attach a **static IP**, and add a firewall rule for **HTTPS (443)**.
3. Click **Connect using SSH** and run:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/elio-fyshku1/hotel-rooms/main/scripts/install-server.sh -o install.sh
   sudo bash install.sh
   ```
4. The script prints the address and the admin password (random, write it down).

`scripts/install-server.sh` installs Docker and Caddy, downloads the code to
`/opt/hotel-rooms`, writes `/opt/hotel-rooms/.env` with random passwords, starts
everything and creates the tables.

- **Update** after new commits on GitHub: `sudo bash /opt/hotel-rooms/scripts/install-server.sh` (data is kept).
- **HTTPS**: point a domain (A record) to the static IP, then run
  `sudo DOMAIN=dhomat.example.al bash /opt/hotel-rooms/scripts/install-server.sh`.
  Caddy gets the certificate by itself. HTTPS also lets the browser keep the
  reception screen on (Screen Wake Lock).
- **Backups**: enable automatic snapshots for the instance in the Lightsail console.

---

## Settings (Administrimi → Çmimet dhe rregullat)

| Setting | Default |
|---|---|
| Packages and prices | see the table in "Daily workflow" (Administrimi → Paketat dhe çmimet) |
| Night window (night package suggested) | 21:00 - 06:00 |
| Night guests leave by | 12:00 |
| Extra per started overtime hour | 500 Lekë |
| Grace period before an extra is suggested | 10 min |
| Cleaning step after check-out | on |
| Currency / timezone | ALL (Lekë) / Europe/Tirane |

---

## Shifts

- A worker's **shift** starts at login and ends at logout ("Dil"). If they forget, it ends when the
  next worker logs in.
- At the top of the room board the worker sees **Arka e turnit**: the money they took since their login
  (starts at 0). The rooms themselves don't change between shifts.
- The logout email to the owner includes the shift's cash. **Historiku → Turnet** lists the shifts of the
  last 72 hours with each one's cash, to compare with the money handed over.
- The cash is worked out from the payments each worker recorded, so it always matches the stays.

## Security (Administrimi)

- **Njoftimet me email**: the owner gets an email when a worker logs in or out, and when a worker
  is refused outside the hotel. Mail is sent from a Gmail account with an *app password*
  (Google Account → Security → 2-Step Verification → App passwords). "Dërgo email provë" checks it.
- **Interneti i hotelit**: the hotel's public IP address(es). With "Punonjësit vetëm nga hoteli" on,
  workers can log in and use the app only from those addresses; admins from anywhere. A worker
  already logged in elsewhere is logged out on the next click. If the provider changes the hotel's IP,
  the "blocked" email shows the new one, so it can be added from the owner's phone.
- **Hyrjet e fundit në sistem**: every login, logout, wrong password and blocked attempt, with IP.

The IP comes from Caddy (`X-Forwarded-For`); the app port is bound to 127.0.0.1 on the server, so it
can't be reached around Caddy. Optional `SMTP_HOST` / `SMTP_PORT` in `.env` use another mail server
instead of Gmail.

## Project structure

```
db/schema.sql                 tables, indexes and the SQL functions for the time rules
scripts/setup-db.mjs          applies the schema, creates the admin user, optional demo data
scripts/install-server.sh     installs / updates the app on an Ubuntu server

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
