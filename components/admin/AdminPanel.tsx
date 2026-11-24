"use client";
/**
 * Admin page layout: a result message at the top and one section per topic.
 * Owns the shared "run a change, show the result, reload" logic.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Settings } from "@/lib/types";
import type { AdminCard, AdminRoom, AdminUser, RunChange } from "./types";
import SettingsSection from "./SettingsSection";
import RoomsSection from "./RoomsSection";
import CardsSection from "./CardsSection";
import UsersSection from "./UsersSection";

interface AdminPanelProps {
  currentUserId: number;
  settings: Settings;
  rooms: AdminRoom[];
  cards: AdminCard[];
  users: AdminUser[];
}

export default function AdminPanel({ currentUserId, settings, rooms, cards, users }: AdminPanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

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
      {message && (
        <div className={`card message ${message.ok ? "ok" : "fail"}`} onClick={() => setMessage(null)}>
          {message.text}
        </div>
      )}

      <CardsSection rooms={rooms} cards={cards} runChange={runChange} />
      <RoomsSection rooms={rooms} runChange={runChange} />
      <SettingsSection settings={settings} runChange={runChange} />
      <UsersSection users={users} currentUserId={currentUserId} runChange={runChange} />
    </div>
  );
}
