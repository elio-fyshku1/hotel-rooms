/**
 * Admin page: settings, rooms, key cards and users. Admins only.
 * Data is loaded here on the server and passed to the client components;
 * after every change they call router.refresh() to reload it.
 */
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/stays";
import NavBar from "@/components/NavBar";
import AdminPanel from "@/components/admin/AdminPanel";
import type { AdminCard, AdminRoom, AdminUser } from "@/components/admin/AdminPanel";

// Sorts room numbers as numbers (9 before 10), then as text
const ROOM_ORDER = "nullif(regexp_replace(r.number, '\\D', '', 'g'), '')::bigint nulls last, r.number";

/** Loads rooms, cards, users and settings, then hands them to the admin panel. */
export default async function AdminPage() {
  const user = await requireUser(true);
  const settings = await getSettings();

  const rooms = await query<AdminRoom>(
    `select r.id, r.number, r.active,
            (select count(*)::int from key_cards k where k.room_id = r.id and k.active) as card_count
       from rooms r
      order by ${ROOM_ORDER}`
  );

  const cards = await query<AdminCard>(
    `select k.id, k.code, k.label, k.active, r.number as room
       from key_cards k
       join rooms r on r.id = k.room_id
      order by ${ROOM_ORDER}, k.id`
  );

  const users = await query<AdminUser>(
    "select id, username, full_name, role, active from users order by role, username"
  );

  return (
    <>
      <NavBar user={user} hotelName={settings.hotel_name} />
      <AdminPanel currentUserId={user.id} settings={settings} rooms={rooms} cards={cards} users={users} />
    </>
  );
}
