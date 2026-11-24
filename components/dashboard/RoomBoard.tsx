"use client";
/**
 * The room board (home page).
 *
 * - Loads the rooms from /api/rooms and reloads them every few seconds, so
 *   several devices at reception always show the same state.
 * - Ticks every second to update the countdowns.
 * - Sends every scanned card code to /api/scan, which checks the room in or out,
 *   and shows the result as a message at the bottom of the screen.
 * - Opens the room dialog and the late check-out dialog.
 */
import { useCallback, useEffect, useState } from "react";
import type { RoomView, ScanResult, Settings, Stay, StayAction } from "@/lib/types";
import { formatDuration, formatMoney, formatTime, stayTypeLabel } from "@/lib/format";
import { sendJson } from "@/components/apiClient";
import { useCardReader } from "./useCardReader";
import RoomTile, { getRoomStatus } from "./RoomTile";
import RoomDialog from "./RoomDialog";
import LateCheckoutDialog, { LateCheckout } from "./LateCheckoutDialog";
import Notice, { NoticeData } from "./Notice";

const REFRESH_INTERVAL_MS = 5000;
const NOTICE_DURATION_MS = 9000;

/** Response of GET /api/rooms */
interface BoardData {
  serverTime: string;
  settings: Settings;
  rooms: RoomView[];
}

/** Room board with its data, timers, scanner handling and dialogs. */
export default function RoomBoard() {
  // --- Data from the server ---
  const [data, setData] = useState<BoardData | null>(null);
  const [connectionError, setConnectionError] = useState(false);

  // Countdowns use the server's clock, so a device with the wrong time still
  // shows the right numbers. clockOffset = server time - device time (ms).
  const [clockOffset, setClockOffset] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  const now = tick + clockOffset;

  // --- UI state ---
  const [openRoomId, setOpenRoomId] = useState<number | null>(null);
  const [lateCheckout, setLateCheckout] = useState<LateCheckout | null>(null);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);

  // ---------------------------------------------------------------------------
  // Loading and timers
  // ---------------------------------------------------------------------------

  // Fetch rooms and settings; go to the login page if the session has expired
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

  // First load, then reload every few seconds, and a one-second clock tick
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
    // Called for every key press on the page
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
  // Messages
  // ---------------------------------------------------------------------------

  const timezone = data?.settings.timezone ?? "Europe/Tirane";
  const currency = data?.settings.currency ?? "EUR";
  const shortMinutes = data?.settings.short_minutes ?? 120;

  /** Check-in message, with buttons to switch 2 hours / night or undo it. */
  function showCheckedIn(room: string, stay: Stay) {
    const otherType = stay.stay_type === "short" ? "night" : "short";

    setNotice({
      kind: "checkin",
      title: `Dhoma ${room} - HYRJE`,
      text:
        `${stayTypeLabel(stay.stay_type, shortMinutes)} · ` +
        `${formatTime(stay.check_in, timezone)} deri ${formatTime(stay.expected_out, timezone)} · ` +
        `Merr ${formatMoney(stay.base_price, currency)}`,
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

  /** Check-out message with the length of the stay and the total paid. */
  function showCheckedOut(room: string, stay: Stay) {
    const minutes = (new Date(stay.check_out!).getTime() - new Date(stay.check_in).getTime()) / 60000;
    const total = stay.base_price + stay.extra_charge;

    let text = `Qëndroi ${formatDuration(minutes)} · Totali ${formatMoney(total, currency)}`;
    if (stay.extra_charge > 0) text += ` (shtesë ${formatMoney(stay.extra_charge, currency)})`;

    setNotice({ kind: "checkout", title: `Dhoma ${room} - DALJE`, text });
  }

  /** Error message. */
  function showError(title: string, text?: string) {
    setNotice({ kind: "error", title, text });
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /** Sends a scanned (or typed) card code to the server and shows the result. */
  async function handleScan(code: string) {
    if (!code.trim() || busy) return;
    setBusy(true);

    try {
      const scan = await sendJson<ScanResult>("/api/scan", { code });

      switch (scan.result) {
        case "checked_in":
          showCheckedIn(scan.room, scan.stay);
          break;
        case "checked_out":
          showCheckedOut(scan.room, scan.stay);
          break;
        case "confirm_checkout":
          // Late: the worker decides about the extra charge in a dialog
          setLateCheckout({
            room: scan.room,
            stayId: scan.stay.id,
            overtimeMinutes: scan.overtimeMinutes,
            suggestedExtra: scan.suggestedExtra,
          });
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

  /** Check-out chosen in the late check-out dialog, with the extra amount. */
  async function confirmLateCheckout(extra: number) {
    if (!lateCheckout) return;
    const result = await runStayAction(lateCheckout.stayId, { action: "checkout", extra });
    if (result) {
      showCheckedOut(lateCheckout.room, result.stay);
      setLateCheckout(null);
    }
  }

  /** Action chosen in the room dialog. Check-out and cancel also close the dialog. */
  async function handleRoomAction(room: RoomView, action: StayAction) {
    const result = await runStayAction(room.stay!.id, action);
    if (!result) return;

    if (action.action === "checkout") {
      showCheckedOut(room.number, result.stay);
      setOpenRoomId(null);
    } else if (action.action === "cancel") {
      setNotice({ kind: "warning", title: `Dhoma ${room.number} - hyrja u anulua` });
      setOpenRoomId(null);
    }
  }

  // The scanner works anywhere on the page; ignored while the late check-out
  // dialog waits for an answer
  useCardReader((code) => {
    if (!lateCheckout) handleScan(code);
  });

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  if (!data) {
    return <div className="container muted">{connectionError ? "Problem me lidhjen, po riprovoj..." : "Duke ngarkuar..."}</div>;
  }

  // Numbers for the summary at the top
  const statuses = data.rooms.map((room) => getRoomStatus(room, now));
  const freeCount = statuses.filter((status) => status === "free").length;
  const overdueRooms = data.rooms.filter((_, index) => statuses[index] === "overdue");

  // The room whose dialog is open (looked up again after every reload)
  const openRoom = data.rooms.find((room) => room.id === openRoomId && room.stay) ?? null;

  return (
    <div className="container">
      {/* Summary and clock */}
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="stat free">Të lira {freeCount}</span>
        <span className="stat occupied">Të zëna {data.rooms.length - freeCount}</span>
        {overdueRooms.length > 0 && <span className="stat overdue">Kohë e kaluar {overdueRooms.length}</span>}
        <span className="spacer" />
        <span className="clock">{new Date(now).toLocaleTimeString("sq-AL", { timeZone: timezone, hourCycle: "h23" })}</span>
      </div>

      {/* Typing a code by hand, for a damaged barcode. The scanner itself works without clicking here. */}
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

      {/* Banner while any room is over its time; tapping it opens the first one */}
      {overdueRooms.length > 0 && (
        <button type="button" className="alert alert-pulse" onClick={() => setOpenRoomId(overdueRooms[0].id)}>
          Koha mbaroi: dhoma {overdueRooms.map((room) => room.number).join(", ")}. Kontrolloni dhomën.
        </button>
      )}

      {/* Room grid */}
      <div className="rooms">
        {data.rooms.map((room) => (
          <RoomTile key={room.id} room={room} now={now} settings={data.settings} onOpen={() => setOpenRoomId(room.id)} />
        ))}
      </div>

      {data.rooms.length === 0 && (
        <div className="card muted">
          Nuk ka ende dhoma. Administratori mund t&apos;i shtojë te <a href="/admin">Administrimi</a>.
        </div>
      )}

      {/* Dialogs and the message at the bottom */}
      {openRoom && (
        <RoomDialog
          room={openRoom}
          now={now}
          settings={data.settings}
          busy={busy}
          onClose={() => setOpenRoomId(null)}
          onStayAction={(action) => handleRoomAction(openRoom, action)}
        />
      )}

      {lateCheckout && (
        <LateCheckoutDialog
          checkout={lateCheckout}
          currency={currency}
          busy={busy}
          onConfirm={confirmLateCheckout}
          onCancel={() => setLateCheckout(null)}
        />
      )}

      {notice && <Notice notice={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
