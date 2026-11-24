"use client";
/**
 * Adding rooms (several at once, e.g. "101-110") and enabling/disabling them.
 * A disabled room (e.g. under repair) disappears from the room board.
 */
import { useState } from "react";
import { sendJson } from "@/components/apiClient";
import type { AdminRoom, RunChange } from "./AdminPanel";

interface RoomsSectionProps {
  rooms: AdminRoom[];
  runChange: RunChange;
}

/** Form to add rooms and a button per room to enable/disable it. */
export default function RoomsSection({ rooms, runChange }: RoomsSectionProps) {
  const [numbers, setNumbers] = useState("");
  const [floor, setFloor] = useState("");

  // Add the rooms typed in the field (e.g. "1-22") and clear it
  async function addRooms() {
    const ok = await runChange(() => sendJson("/api/admin/rooms", { numbers, floor }), "Dhomat u shtuan.");
    if (ok) setNumbers("");
  }

  // Disable a room (e.g. under repair) or enable it again
  function toggleRoom(room: AdminRoom) {
    runChange(
      () => sendJson("/api/admin/rooms", { id: room.id, active: !room.active }, "PATCH"),
      `Dhoma ${room.number} u ${room.active ? "çaktivizua" : "aktivizua"}.`
    );
  }

  return (
    <section className="card">
      <h3>Dhomat</h3>

      {/* Add rooms: a list and/or ranges, optionally with a floor */}
      <div className="row align-end" style={{ marginBottom: 12 }}>
        <div className="grow" style={{ minWidth: 200 }}>
          <label htmlFor="room-numbers">Numrat e dhomave (p.sh. 101-110, 201, 202)</label>
          <input id="room-numbers" value={numbers} onChange={(event) => setNumbers(event.target.value)} />
        </div>
        <div style={{ width: 100 }}>
          <label htmlFor="room-floor">Kati</label>
          <input id="room-floor" type="number" value={floor} onChange={(event) => setFloor(event.target.value)} />
        </div>
        <button className="btn green" onClick={addRooms}>
          Shto dhomat
        </button>
      </div>

      {/* One button per room; red = disabled */}
      <p className="muted small">Kliko një dhomë për ta çaktivizuar (p.sh. në riparim) ose aktivizuar.</p>
      <div className="row">
        {rooms.map((room) => (
          <button key={room.id} className={`btn sm ${room.active ? "" : "red"}`} onClick={() => toggleRoom(room)}>
            {room.number}
            {room.floor != null && <span className="muted"> · K{room.floor}</span>}
            {!room.active && " (joaktive)"}
          </button>
        ))}
        {rooms.length === 0 && <span className="muted">Nuk ka ende dhoma.</span>}
      </div>
    </section>
  );
}
