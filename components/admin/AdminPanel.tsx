"use client";
/**
 * Admin page layout: a result message at the top and one section per topic.
 * Owns the shared "run a change, show the result, reload" logic.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Settings } from "@/lib/types";
import SettingsSection from "./SettingsSection";
import RoomsSection from "./RoomsSection";
import CardsSection from "./CardsSection";
import UsersSection from "./UsersSection";

// Row types loaded by app/admin/page.tsx and passed to the sections
export interface AdminRoom {
  id: number;
  number: string;
  floor: number | null;
  active: boolean;
  card_count: number;
}

export interface AdminCard {
  id: number;
  code: string;
  label: string;
  active: boolean;
  room: string;
}

export interface AdminUser {
  id: number;
  username: string;
  full_name: string;
  role: "admin" | "worker";
  active: boolean;
}

/**
 * Runs a change against the API, shows the result message and reloads the
 * page data. Returns true on success. Provided by AdminPanel to each section.
 */
export type RunChange = (change: () => Promise<unknown>, successMessage: string) => Promise<boolean>;

interface AdminPanelProps {
  currentUserId: number;
  settings: Settings;
  rooms: AdminRoom[];
  cards: AdminCard[];
  users: AdminUser[];
}

/** Message area plus the four admin sections. */
export default function AdminPanel({ currentUserId, settings, rooms, cards, users }: AdminPanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Shared by all sections: run the API call, show the result, reload the data
  const runChange: RunChange = async (change, successMessage) => {
    try {
      await change();
      setMessage({ ok: true, text: successMessage });
      router.refresh();
      return true;
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message });
      return false;
    }
  };

  return (
    <div className="container admin">
      {/* Result of the last change (green = done, red = error); tap to hide */}
      {message && (
        <div className={`card message ${message.ok ? "ok" : "fail"}`} onClick={() => setMessage(null)}>
          {message.text}
        </div>
      )}

      {/* Cards first: printing labels is the most common admin task */}
      <CardsSection rooms={rooms} cards={cards} runChange={runChange} />
      <RoomsSection rooms={rooms} runChange={runChange} />
      <SettingsSection settings={settings} runChange={runChange} />
      <UsersSection users={users} currentUserId={currentUserId} runChange={runChange} />
    </div>
  );
}
