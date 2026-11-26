/**
 * Admin page: key cards, rooms, packages and prices, settings, users, security. Admins only.
 * Data is loaded here on the server and passed to the client components;
 * after every change they call router.refresh() to reload it.
 */
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings, listPackages } from "@/lib/stays";
import NavBar from "@/components/NavBar";
import AdminPanel from "@/components/admin/AdminPanel";
import type { AdminCard, AdminRoom, AdminUser } from "@/components/admin/AdminPanel";
import type { LoginRow, SecuritySettings } from "@/components/admin/SecuritySection";
import { clientIp } from "@/lib/network";

// Sorts room numbers as numbers (9 before 10), then as text
const ROOM_ORDER = "nullif(regexp_replace(r.number, '\\D', '', 'g'), '')::bigint nulls last, r.number";

/** Loads rooms, cards, packages, users, settings and security data, then hands them to the admin panel. */
export default async function AdminPage() {
  const user = await requireUser(true);
  const settings = await getSettings();
  const packages = await listPackages(false);

  const rooms = await query<AdminRoom>(
    `select r.id, r.number, r.floor, r.active,
            (select count(*)::int from key_cards k where k.room_id = r.id and k.active) as card_count
       from rooms r
      order by r.floor nulls last, ${ROOM_ORDER}`
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

  // Security: the Gmail password itself never goes to the browser
  const [security] = await query<SecuritySettings>(
    `select notify_email, smtp_user, smtp_password <> '' as smtp_password_set,
            notify_logins, hotel_ips, workers_only_from_hotel
       from settings where id = 1`
  );
  const logins = await query<LoginRow>(
    `select l.id, l.at, l.username, u.full_name, l.result, l.ip, l.from_hotel
       from login_log l
       left join users u on u.id = l.user_id
      order by l.at desc
      limit 50`
  );

  return (
    <>
      <NavBar user={user} hotelName={settings.hotel_name} />
      <AdminPanel
        currentUserId={user.id}
        settings={settings}
        packages={packages}
        rooms={rooms}
        cards={cards}
        users={users}
        security={security}
        myIp={await clientIp()}
        logins={logins}
      />
    </>
  );
}
