"use client";
/**
 * The room board (home page).
 *
 * - Loads all rooms from /api/rooms and refreshes every few seconds, so
 *   several devices at reception stay in sync.
 * - Ticks every second to update the countdowns.
 * - Listens for the barcode scanner (useCardReader) and sends each scanned
 *   code to /api/scan, which checks the room in or out.
 * - Shows the dialogs and messages that follow from a scan or a tap on a room.
 */
import { useCallback, useEffect, useState } from "react";
import type { RoomView, ScanResult, Settings, Stay, StayAction, StayType } from "@/lib/types";
import { formatDuration, formatMoney, formatTime, stayTypeLabel } from "@/lib/format";
import { sendJson } from "@/components/apiClient";
import { useCardReader } from "@/components/useCardReader";
import { useWakeLock } from "@/components/useWakeLock";
import { getRoomStatus } from "./roomStatus";
import RoomTile from "./RoomTile";
import RoomDialog from "./RoomDialog";
import LateCheckoutDialog, { LateCheckout } from "./LateCheckoutDialog";
import ConfirmDialog from "./ConfirmDialog";
import Notice, { NoticeData } from "./Notice";

const REFRESH_INTERVAL_MS = 5000;
const NOTICE_DURATION_MS = 9000;

interface BoardData {
  serverTime: string;
  settings: Settings;
  rooms: RoomView[];
}

export default function RoomBoard() {
  // --- Data from the server ---
  const [data, setData] = useState<BoardData | null>(null);
  const [connectionError, setConnectionError] = useState(false);

  // Difference between the server clock and this device's clock, in ms.
  // Countdowns use server time so a wrong device clock doesn't matter.
  const [clockOffset, setClockOffset] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  const now = tick + clockOffset;

  // --- UI state ---
  const [openRoomId, setOpenRoomId] = useState<number | null>(null);
  const [lateCheckout, setLateCheckout] = useState<LateCheckout | null>(null);
  const [dirtyRoomScan, setDirtyRoomScan] = useState<{ code: string; room: string } | null>(null);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);

  useWakeLock();

  // ---------------------------------------------------------------------------
  // Loading and refreshing
  // ---------------------------------------------------------------------------

  /** Fetches the rooms and settings from the server. */
  const loadRooms = useCallback(async () => {
    try {
      const response = await fetch("/api/rooms", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      const board: BoardData = await response.json();
      setClockOffset(new Date(board.serverTime).getTime() - Date.now());
      setData(board);
      setConnectionError(false);
    } catch {
      setConnectionError(true);
    }
  }, []);

  // Initial load, periodic refresh and the one-second clock
  useEffect(() => {
    loadRooms();
    const refreshTimer = setInterval(loadRooms, REFRESH_INTERVAL_MS);
    const clockTimer = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      clearInterval(refreshTimer);
      clearInterval(clockTimer);
    };
  }, [loadRooms]);

  // Esc closes the room dialog
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenRoomId(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Messages disappear by themselves after a few seconds
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // ---------------------------------------------------------------------------
  // Messages after check-in / check-out
  // ---------------------------------------------------------------------------

  const settings = data?.settings;
  const timezone = settings?.timezone ?? "Europe/Tirane";
  const shortMinutes = settings?.short_minutes ?? 120;

  /** Shows the check-in message, with buttons to switch the stay type or undo. */
  function showCheckedIn(room: string, stay: Stay) {
    const otherType: StayType = stay.stay_type === "short" ? "night" : "short";

    setNotice({
      kind: "checkin",
      title: `Dhoma ${room} - HYRJE`,
      text:
        `${stayTypeLabel(stay.stay_type, shortMinutes)} · ` +
        `${formatTime(stay.check_in, timezone)} deri ${formatTime(stay.expected_out, timezone)} · ` +
        `Merr ${formatMoney(stay.base_price, stay.currency)}`,
      actions: [
        {
          label: otherType === "night" ? "Ndrysho në natë" : `Ndrysho në ${stayTypeLabel("short", shortMinutes)}`,
          run: async () => {
            const result = await runStayAction(stay.id, { action: "set_type", type: otherType });
            if (result) showCheckedIn(room, result.stay);
          },
        },
        {
          label: "Anulo",
          run: async () => {
            const result = await runStayAction(stay.id, { action: "cancel" });
            if (result) setNotice({ kind: "warning", title: `Dhoma ${room} - hyrja u anulua` });
          },
        },
      ],
    });
  }

  /** Shows the check-out message with the length of the stay and the total. */
  function showCheckedOut(room: string, stay: Stay) {
    const minutes = (new Date(stay.check_out!).getTime() - new Date(stay.check_in).getTime()) / 60000;
    const total = stay.base_price + stay.extra_charge;

    let text = `Qëndroi ${formatDuration(minutes)} · Totali ${formatMoney(total, stay.currency)}`;
    if (stay.extra_charge > 0) text += ` (shtesë ${formatMoney(stay.extra_charge, stay.currency)})`;

    setNotice({ kind: "checkout", title: `Dhoma ${room} - DALJE`, text });
  }

  /** Shows an error message. */
  function showError(title: string, text?: string) {
    setNotice({ kind: "error", title, text });
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Sends a scanned code to the server and reacts to the result.
   * `allowDirty` confirms a check-in to a room not marked as cleaned.
   */
  async function handleScan(code: string, allowDirty = false) {
    if (!code.trim() || busy) return;
    setBusy(true);

    try {
      const scan = await sendJson<ScanResult>("/api/scan", { code, allowDirty });

      switch (scan.result) {
        case "checked_in":
          showCheckedIn(scan.room, scan.stay);
          break;
        case "checked_out":
          showCheckedOut(scan.room, scan.stay);
          break;
        case "confirm_checkout":
          setLateCheckout({
            room: scan.room,
            stayId: scan.stay.id,
            overtimeMinutes: scan.overtimeMinutes,
            suggestedExtra: scan.suggestedExtra,
          });
          break;
        case "needs_cleaning":
          setDirtyRoomScan({ code, room: scan.room });
          break;
        case "double_scan":
          setNotice({ kind: "warning", title: `Dhoma ${scan.room}`, text: "Karta sapo u lexua. Leximi i dytë u injorua." });
          break;
        case "unknown_card":
          showError("Kartë e panjohur", `Kodi "${scan.code}" nuk është i regjistruar. Shtojeni te Administrimi.`);
          break;
        case "inactive_card":
          showError("Kartë e çaktivizuar", `Kjo kartë e dhomës ${scan.room} është çaktivizuar (e humbur/zëvendësuar).`);
          break;
        case "room_inactive":
          showError(`Dhoma ${scan.room} është e çaktivizuar`, "Aktivizojeni te Administrimi.");
          break;
      }

      await loadRooms();
    } catch (error) {
      showError("Leximi dështoi", (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Runs an action on an open stay and reloads the board. Returns null on error. */
  async function runStayAction(stayId: number, action: StayAction): Promise<{ stay: Stay } | null> {
    setBusy(true);
    try {
      const result = await sendJson<{ stay: Stay }>(`/api/stays/${stayId}`, action);
      await loadRooms();
      return result;
    } catch (error) {
      showError("Gabim", (error as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** Check-out from the late-checkout dialog. */
  async function confirmLateCheckout(extra: number) {
    if (!lateCheckout) return;
    const result = await runStayAction(lateCheckout.stayId, { action: "checkout", extra });
    if (result) {
      showCheckedOut(lateCheckout.room, result.stay);
      setLateCheckout(null);
    }
  }

  /** An action chosen in the room dialog. */
  async function handleRoomDialogAction(room: RoomView, action: StayAction) {
    if (!room.stay) return;
    const result = await runStayAction(room.stay.id, action);
    if (!result) return;

    if (action.action === "checkout") {
      showCheckedOut(room.number, result.stay);
      setOpenRoomId(null);
    } else if (action.action === "cancel") {
      setNotice({ kind: "warning", title: `Dhoma ${room.number} - hyrja u anulua` });
      setOpenRoomId(null);
    }
  }

  /** Check-in from the room dialog without a card. */
  async function handleCheckInWithoutCard(room: RoomView, type: StayType) {
    setBusy(true);
    try {
      const result = await sendJson<{ stay: Stay }>(`/api/rooms/${room.id}/checkin`, { type });
      setOpenRoomId(null);
      await loadRooms();
      showCheckedIn(room.number, result.stay);
    } catch (error) {
      showError("Gabim", (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Marks a room as cleaned. */
  async function handleMarkCleaned(room: RoomView) {
    try {
      await sendJson(`/api/rooms/${room.id}/clean`);
      setOpenRoomId(null);
      await loadRooms();
    } catch (error) {
      showError("Gabim", (error as Error).message);
    }
  }

  // Scanner input anywhere on the page (ignored while a dialog needs an answer)
  useCardReader((code) => {
    if (!lateCheckout && !dirtyRoomScan) handleScan(code);
  });

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  if (!data || !settings) {
    return <div className="container muted">{connectionError ? "Problem me lidhjen, po riprovoj..." : "Duke ngarkuar..."}</div>;
  }

  // Count rooms per status for the summary at the top
  const counts = { free: 0, occupied: 0, overdue: 0, cleaning: 0 };
  for (const room of data.rooms) {
    const status = getRoomStatus(room, now);
    if (status === "free") counts.free++;
    else if (status === "cleaning") counts.cleaning++;
    else if (status === "overdue") counts.overdue++;
    else counts.occupied++;
  }

  const overdueRooms = data.rooms.filter((room) => getRoomStatus(room, now) === "overdue");

  // Group rooms by floor (rooms without a floor go in one group)
  const floors = new Map<string, RoomView[]>();
  for (const room of data.rooms) {
    const key = room.floor == null ? "Dhomat" : `Kati ${room.floor}`;
    floors.set(key, [...(floors.get(key) ?? []), room]);
  }

  const openRoom = data.rooms.find((room) => room.id === openRoomId) ?? null;

  return (
    <div className="container">
      {/* Summary and clock */}
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="stats">
          <span className="stat free">Të lira {counts.free}</span>
          <span className="stat occupied">Të zëna {counts.occupied + counts.overdue}</span>
          {counts.overdue > 0 && <span className="stat overdue">Kohë e kaluar {counts.overdue}</span>}
          {counts.cleaning > 0 && <span className="stat cleaning">Për pastrim {counts.cleaning}</span>}
        </div>
        <span className="spacer" />
        <span className="clock">{new Date(now).toLocaleTimeString("sq-AL", { timeZone: timezone, hourCycle: "h23" })}</span>
      </div>

      {/* Manual entry: the scanner works without clicking here, this is for typing a code by hand */}
      <form
        className="card scan-bar"
        onSubmit={(event) => {
          event.preventDefault();
          handleScan(manualCode);
          setManualCode("");
        }}
      >
        <span className="scan-ready" title="Gati për skanim" />
        <input
          value={manualCode}
          onChange={(event) => setManualCode(event.target.value)}
          placeholder="Skanoni kartën"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn blue" disabled={busy}>
          OK
        </button>
      </form>

      {connectionError && <div className="muted small">Problem me lidhjen, po riprovoj...</div>}

      {/* Banner while any room is over its time */}
      {overdueRooms.length > 0 && (
        <button type="button" className="alert alert-pulse" onClick={() => setOpenRoomId(overdueRooms[0].id)}>
          Koha mbaroi: dhoma {overdueRooms.map((room) => room.number).join(", ")}. Kontrolloni dhomën.
        </button>
      )}

      {/* Room grid */}
      {[...floors.entries()].map(([floorName, rooms]) => (
        <section key={floorName}>
          {floors.size > 1 && <div className="floor-title">{floorName}</div>}
          <div className="rooms" style={{ marginTop: floors.size > 1 ? 0 : 16 }}>
            {rooms.map((room) => (
              <RoomTile
                key={room.id}
                room={room}
                status={getRoomStatus(room, now)}
                now={now}
                settings={settings}
                onOpen={() => setOpenRoomId(room.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {data.rooms.length === 0 && (
        <div className="card muted" style={{ marginTop: 16 }}>
          Nuk ka ende dhoma. Administratori mund t&apos;i shtojë te <a href="/admin">Administrimi</a>.
        </div>
      )}

      {/* Dialogs */}
      {openRoom && (
        <RoomDialog
          room={openRoom}
          status={getRoomStatus(openRoom, now)}
          now={now}
          settings={settings}
          busy={busy}
          onClose={() => setOpenRoomId(null)}
          onCheckIn={(type) => handleCheckInWithoutCard(openRoom, type)}
          onMarkCleaned={() => handleMarkCleaned(openRoom)}
          onStayAction={(action) => handleRoomDialogAction(openRoom, action)}
        />
      )}

      {lateCheckout && (
        <LateCheckoutDialog
          checkout={lateCheckout}
          currency={settings.currency}
          busy={busy}
          onConfirm={confirmLateCheckout}
          onCancel={() => setLateCheckout(null)}
        />
      )}

      {dirtyRoomScan && (
        <ConfirmDialog
          title={`Dhoma ${dirtyRoomScan.room} nuk është pastruar`}
          message="Klienti i fundit u largua dhe dhoma nuk është shënuar si e pastruar. Të regjistrohet hyrja gjithsesi?"
          confirmLabel="Po, regjistro hyrjen"
          cancelLabel="Jo, jep një dhomë tjetër"
          onConfirm={() => {
            const code = dirtyRoomScan.code;
            setDirtyRoomScan(null);
            handleScan(code, true);
          }}
          onCancel={() => setDirtyRoomScan(null)}
        />
      )}

      {notice && <Notice notice={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
