"use client";
/**
 * Dialog opened by tapping a room. What it offers depends on the room:
 *
 *   free / cleaning  -> collect an unpaid last stay, mark as cleaned,
 *                       or check in without a card
 *   occupied         -> take payment, check out, +1 hour, switch 2 hours/night, cancel
 *   overdue          -> "guest left" (check out, no extra) or charge extra
 *
 * The dialog only reports what the worker chose; RoomBoard does the API calls.
 */
import type { RoomView, Settings, StayAction, StayType } from "@/lib/types";
import { amountDue, formatCountdown, formatMoney, formatTime, stayTypeLabel } from "@/lib/format";
import type { RoomStatus } from "./RoomTile";

interface RoomDialogProps {
  room: RoomView;
  status: RoomStatus;
  now: number;
  settings: Settings;
  busy: boolean;
  onClose: () => void;
  onCheckIn: (type: StayType) => void;
  onMarkCleaned: () => void;
  onStayAction: (action: StayAction) => void;
  onPayLastStay: () => void;
}

/** Dialog frame; the content depends on whether the room has a guest. */
export default function RoomDialog(props: RoomDialogProps) {
  const { room, settings, onClose } = props;

  return (
    <div className="overlay" onClick={onClose}>
      {/* Clicks inside the dialog must not close it */}
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>
          Dhoma {room.number}
          {room.stay && (
            <span className={`badge ${room.stay.stay_type}`}>
              {stayTypeLabel(room.stay.stay_type, settings.short_minutes)}
            </span>
          )}
        </h2>

        {room.stay ? <OccupiedRoomContent {...props} /> : <FreeRoomContent {...props} />}

        <button className="btn big" style={{ marginTop: 12 }} onClick={onClose}>
          Mbyll
        </button>
      </div>
    </div>
  );
}

/** Free or waiting-for-cleaning room. */
function FreeRoomContent({ room, status, settings, busy, onCheckIn, onMarkCleaned, onPayLastStay }: RoomDialogProps) {
  return (
    <div className="stack">
      {/* The last guest left without paying: ask for the money first */}
      {room.unpaid && (
        <>
          <div className="alert">
            Klienti i fundit nuk ka paguar {formatMoney(room.unpaid.amount, settings.currency)}.
          </div>
          <button className="btn green big" disabled={busy} onClick={onPayLastStay}>
            U pagua {formatMoney(room.unpaid.amount, settings.currency)}
          </button>
        </>
      )}

      {status === "cleaning" && (
        <button className="btn amber big" disabled={busy} onClick={onMarkCleaned}>
          Shëno si të pastruar
        </button>
      )}

      <p className="muted small no-margin">
        Zakonisht mjafton të afrosh kartën te lexuesi. Përdori butonat më poshtë vetëm kur karta nuk lexohet.
      </p>
      <button className="btn red big" disabled={busy} onClick={() => onCheckIn("short")}>
        Hyrje · {stayTypeLabel("short", settings.short_minutes)} · {formatMoney(settings.short_price, settings.currency)}
      </button>
      <button className="btn big" disabled={busy} onClick={() => onCheckIn("night")}>
        Hyrje · natë · {formatMoney(settings.night_price, settings.currency)}
      </button>
    </div>
  );
}

/** Room with a guest: stay details plus the actions for normal or overdue time. */
function OccupiedRoomContent({ room, status, now, settings, busy, onStayAction }: RoomDialogProps) {
  const stay = room.stay!;
  const tz = settings.timezone;
  // Shortcut for amounts in the hotel currency
  const money = (amount: number) => formatMoney(amount, settings.currency);

  const remaining = new Date(stay.expected_out).getTime() - now;
  const minutesOver = Math.floor(-remaining / 60000);
  const due = amountDue(stay);

  return (
    <>
      <dl className="details">
        <dt>Hyrja</dt>
        <dd>{formatTime(stay.check_in, tz)}</dd>

        <dt>Duhet të dalë</dt>
        <dd>{formatTime(stay.expected_out, tz)}</dd>

        <dt>{remaining > 0 ? "Koha e mbetur" : "Kohë e kaluar"}</dt>
        <dd className={remaining > 0 ? "" : "text-red"}>
          {remaining > 0 ? formatCountdown(remaining) : `+${formatCountdown(-remaining)}`}
        </dd>

        <dt>Çmimi</dt>
        <dd>
          {money(stay.base_price)}
          {stay.extra_charge > 0 && ` + ${money(stay.extra_charge)} shtesë`}
        </dd>

        <dt>Pagesa</dt>
        <dd className={due > 0 ? "text-red" : ""}>{due > 0 ? `Pa paguar ${money(due)}` : "Paguar"}</dd>

        <dt>Regjistroi</dt>
        <dd>{stay.checked_in_by}</dd>
      </dl>

      {/* The guest can pay at any moment during the stay */}
      {due > 0 && (
        <button className="btn blue big" style={{ marginTop: 14 }} disabled={busy} onClick={() => onStayAction({ action: "pay" })}>
          Merr pagesën {money(due)}
        </button>
      )}

      {status === "overdue" ? (
        // Time is up: the worker checks the room and picks one of two outcomes
        <div className="stack">
          <div className="alert">
            Koha mbaroi {minutesOver > 0 ? `para ${minutesOver} min` : "tani"}. Kontrolloni dhomën.
          </div>

          <button className="btn green big" disabled={busy} onClick={() => onStayAction({ action: "checkout", extra: 0 })}>
            Klienti u largua - dhoma e lirë
          </button>

          <div className="muted small">Klienti është ende brenda? Paguan shtesë:</div>
          <div className="row">
            <button className="btn amber grow" disabled={busy} onClick={() => onStayAction({ action: "extend", kind: "hour" })}>
              +1 orë ({money(settings.extra_hour_price)})
            </button>
            <button className="btn amber grow" disabled={busy} onClick={() => onStayAction({ action: "extend", kind: "block" })}>
              +{stayTypeLabel("short", settings.short_minutes)} ({money(settings.short_price)})
            </button>
          </div>
          {stay.stay_type === "short" && (
            <button className="btn" disabled={busy} onClick={() => onStayAction({ action: "set_type", type: "night" })}>
              Qëndron natën (gjithsej {money(settings.night_price)})
            </button>
          )}
        </div>
      ) : (
        // Time not up yet
        <div className="stack">
          <button className="btn green big" disabled={busy} onClick={() => onStayAction({ action: "checkout", extra: 0 })}>
            Regjistro daljen tani
          </button>
          <div className="row">
            <button className="btn grow" disabled={busy} onClick={() => onStayAction({ action: "extend", kind: "hour" })}>
              +1 orë ({money(settings.extra_hour_price)})
            </button>
            <button
              className="btn grow"
              disabled={busy}
              onClick={() => onStayAction({ action: "set_type", type: stay.stay_type === "short" ? "night" : "short" })}
            >
              {stay.stay_type === "short" ? "Ndrysho në natë" : `Ndrysho në ${stayTypeLabel("short", settings.short_minutes)}`}
            </button>
          </div>
          <button className="btn sm" disabled={busy} onClick={() => onStayAction({ action: "cancel" })}>
            Anulo hyrjen (gabim)
          </button>
        </div>
      )}
    </>
  );
}
