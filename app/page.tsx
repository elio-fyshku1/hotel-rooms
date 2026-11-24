/**
 * Home page: the live room board. Requires login.
 */
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/stays";
import NavBar from "@/components/NavBar";
import RoomBoard from "@/components/dashboard/RoomBoard";

/** Checks the login, then shows the navigation bar and the room board. */
export default async function HomePage() {
  const user = await requireUser();
  const settings = await getSettings();

  return (
    <>
      <NavBar user={user} hotelName={settings.hotel_name} />
      <RoomBoard />
    </>
  );
}
