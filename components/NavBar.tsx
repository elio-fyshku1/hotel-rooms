"use client";
/**
 * Top navigation bar: hotel name, page links, current user and logout.
 * The Admin link is only shown to admins.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/types";

interface NavBarProps {
  user: SessionUser;
  hotelName: string;
}

/** Navigation bar shown at the top of every page after login. */
export default function NavBar({ user, hotelName }: NavBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // End the session and go to the login page
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  /** A nav link, highlighted when it's the current page. */
  function navLink(href: string, label: string) {
    return (
      <Link href={href} className={pathname === href ? "active" : ""}>
        {label}
      </Link>
    );
  }

  return (
    <nav className="nav">
      <span className="brand">{hotelName}</span>
      {navLink("/", "Dhomat")}
      {navLink("/history", "Historiku")}
      {user.role === "admin" && navLink("/admin", "Administrimi")}
      <span className="spacer" />
      <span className="muted small">{user.full_name || user.username}</span>
      <button className="btn sm" onClick={logout}>
        Dil
      </button>
    </nav>
  );
}
