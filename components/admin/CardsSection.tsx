"use client";
/**
 * Key cards: each physical room card gets a code, printed as a barcode
 * sticker for the back of the card.
 *
 * Two ways to add a card:
 *   1. Leave the code empty -> the app generates one; print its label.
 *   2. Scan an existing sticker into the code field -> that code is used.
 * After each card the room selection moves to the next room, so all cards can
 * be registered one after the other.
 */
import { useRef, useState } from "react";
import { sendJson } from "@/components/apiClient";
import type { AdminCard, AdminRoom, RunChange } from "./AdminPanel";

interface CardsSectionProps {
  rooms: AdminRoom[];
  cards: AdminCard[];
  runChange: RunChange;
}

/** Card list, bulk creation, single card form and label printing link. */
export default function CardsSection({ rooms, cards, runChange }: CardsSectionProps) {
  const activeRooms = rooms.filter((room) => room.active);
  const [roomId, setRoomId] = useState("");
  const [code, setCode] = useState("");
  const codeInputRef = useRef<HTMLInputElement>(null);

  const roomsWithoutCard = activeRooms.filter((room) => room.card_count === 0).length;

  /** Adds one card, then selects the next room and puts the cursor back in the code field. */
  async function addCard(event: React.FormEvent) {
    event.preventDefault();
    const selectedRoom = activeRooms.find((room) => String(room.id) === roomId);

    const ok = await runChange(
      () => sendJson("/api/admin/cards", { room_id: Number(roomId), code }),
      selectedRoom ? `Karta u shtua për dhomën ${selectedRoom.number}.` : "Karta u shtua."
    );
    if (!ok) return;

    const index = activeRooms.findIndex((room) => String(room.id) === roomId);
    const nextRoom = activeRooms[index + 1];
    setRoomId(nextRoom ? String(nextRoom.id) : "");
    setCode("");
    codeInputRef.current?.focus();
  }

  // Generate a card for every active room that has none yet
  function addCardsForAllRooms() {
    runChange(
      () => sendJson("/api/admin/cards", { allRoomsWithoutCard: true }),
      "U krijua një kartë për çdo dhomë pa kartë. Printoni etiketat."
    );
  }

  // Disable a lost card, or enable it again
  function toggleCard(card: AdminCard) {
    runChange(
      () => sendJson("/api/admin/cards", { id: card.id, active: !card.active }, "PATCH"),
      card.active ? `Karta e dhomës ${card.room} u çaktivizua.` : `Karta e dhomës ${card.room} u aktivizua.`
    );
  }

  return (
    <section className="card">
      <h3>Kartat e dhomave</h3>
      <p className="muted small">
        Çdo kartë ka një kod që printohet si barkod dhe ngjitet pas kartës. Nëse humbet një kartë, çaktivizojeni dhe
        shtoni një të re për atë dhomë.
      </p>

      {/* Bulk creation and printing */}
      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn green" disabled={roomsWithoutCard === 0} onClick={addCardsForAllRooms}>
          Krijo kartë për çdo dhomë pa kartë ({roomsWithoutCard})
        </button>
        <a className="btn blue" href="/admin/labels">
          Printo etiketat
        </a>
      </div>

      {/* Single card */}
      <form className="row align-end" style={{ marginBottom: 16 }} onSubmit={addCard}>
        <div style={{ width: 140 }}>
          <label htmlFor="card-room">Dhoma</label>
          <select id="card-room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            <option value="">Zgjidh...</option>
            {activeRooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.number} ({room.card_count} karta)
              </option>
            ))}
          </select>
        </div>
        <div className="grow" style={{ minWidth: 220 }}>
          <label htmlFor="card-code">Kodi (bosh = kod i ri, ose skanoni një etiketë ekzistuese)</label>
          <input
            id="card-code"
            ref={codeInputRef}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <button className="btn green" disabled={!roomId}>
          Shto kartë
        </button>
      </form>

      {/* Card list */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dhoma</th>
              <th>Karta</th>
              <th>Kodi</th>
              <th>Statusi</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => (
              <tr key={card.id} className={card.active ? "" : "faded"}>
                <td><b>{card.room}</b></td>
                <td>{card.label}</td>
                <td className="mono">{card.code}</td>
                <td>{card.active ? "aktive" : "joaktive"}</td>
                <td className="text-right">
                  {card.active && (
                    <a className="btn sm" href={`/admin/labels?card=${card.id}`}>
                      Etiketa
                    </a>
                  )}{" "}
                  <button className={`btn sm ${card.active ? "red" : ""}`} onClick={() => toggleCard(card)}>
                    {card.active ? "Çaktivizo (e humbur)" : "Aktivizo"}
                  </button>
                </td>
              </tr>
            ))}
            {cards.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">Nuk ka ende karta.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
