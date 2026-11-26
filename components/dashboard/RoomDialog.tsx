"use client";
/**
 * Dialog opened by tapping a room. What it offers depends on the room:
 *
 *   free             -> collect an unpaid last stay, or check in without a
 *                       card (one button per package)
 *   cleaning         -> collect an unpaid last stay, mark as cleaned
 *                       (no check-in: the room can't be given before it is cleaned)
 *   occupied         -> take payment, check out, +1 hour, change package, cancel
 *   overdue          -> "guest left" (check out, no extra) or charge extra
 *
 * The dialog only reports what the worker chose; RoomBoard does the API calls.
 */
import type { Package, RoomView, Settings, StayAction } from "@/lib/types";
import { amountDue, formatCountdown, formatMoney, formatTime } from "@/lib/format";
import type { RoomStatus } from "./RoomTile";

interface RoomDialogProps {
  room: RoomView;
  status: RoomStatus;
  now: number;
  settings: Settings;
  packages: Package[];
  nightNow: boolean;
  busy: boolean;
  onClose: () => void;
  onCheckIn: (pkg: Package) => void;
  onChangePackage: () => void;
  onMarkCleaned: () => void;
  onStayAction: (action: StayAction) => void;
  onPayLastStay: () => void;
}

/** Dialog frame; the content depends on whether the room has a guest. */
export default function RoomDialog(props: RoomDialogProps) {
  const { room, onClose } = props;

  return (
    <div className="overlay" onClick={onClose}>
      {/* Clicks inside the dialog must not close it */}
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>
          Dhoma {room.number}
          {room.stay && <span className={`badge ${room.stay.stay_type}`}>{room.stay.package_name}</span>}
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
function FreeRoomContent(props: RoomDialogProps) {
  const { room, status, busy, onMarkCleaned, onPayLastStay } = props;
  return (
    <div className="stack">
      {/* The last guest left without paying: ask for the money first */}
      {room.unpaid && (
        <>
          <div className="alert">
            Klienti i fundit nuk ka paguar {formatMoney(room.unpaid.amount, room.unpaid.currency)}.
          </div>
          <button className="btn green big" disabled={busy} onClick={onPayLastStay}>
            U pagua {formatMoney(room.unpaid.amount, room.unpaid.currency)}
          </button>
        </>
      )}

      {/* Waiting for cleaning: that is the only thing to do with the room now */}
      {status === "cleaning" && (
        <button className="btn amber big" disabled={busy} onClick={onMarkCleaned}>
          Shëno si të pastruar
        </button>
      )}

      {/* Check-in without a card, only once the room is clean */}
      {status === "free" && <CheckInButtons {...props} />}
    </div>
  );
}

/** One button per package, for when the card can't be read. */
function CheckInButtons({ settings, packages, nightNow, busy, onCheckIn }: RoomDialogProps) {
  return (
    <>
      <p className="muted small no-margin">
        Zakonisht mjafton të afrosh kartën te lexuesi. Përdori butonat më poshtë vetëm kur karta nuk lexohet.
      </p>
      {/* Same packages as after a scan; the night one is highlighted in the evening */}
      <div className="package-grid" style={{ marginTop: 0 }}>
        {packages.map((pkg) => (
          <button
            key={pkg.id}
            className={`btn package ${nightNow && pkg.minutes === null ? "blue" : ""}`}
            disabled={busy}
            onClick={() => onCheckIn(pkg)}
          >
            <span className="package-name">{pkg.name}</span>
            <span className="package-price">{formatMoney(pkg.price, settings.currency)}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** Room with a guest: stay details plus the actions for normal or overdue time. */
function OccupiedRoomContent({ room, status, now, settings, busy, onStayAction, onChangePackage }: RoomDialogProps) {
  const stay = room.stay!;
  const tz = settings.timezone;
  // Shortcut for amounts in the currency of this stay
  const money = (amount: number) => formatMoney(amount, stay.currency);

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
            <button className="btn amber grow" disabled={busy} onClick={() => onStayAction({ action: "extend_hour" })}>
              +1 orë ({money(settings.extra_hour_price)})
            </button>
            {/* e.g. 2 hours -> 4 hours or night: new price, time from check-in */}
            <button className="btn amber grow" disabled={busy} onClick={onChangePackage}>
              Kalo në paketë tjetër
            </button>
          </div>
        </div>
      ) : (
        // Time not up yet
        <div className="stack">
          <button className="btn green big" disabled={busy} onClick={() => onStayAction({ action: "checkout", extra: 0 })}>
            Regjistro daljen tani
          </button>
          <div className="row">
            <button className="btn grow" disabled={busy} onClick={() => onStayAction({ action: "extend_hour" })}>
              +1 orë ({money(settings.extra_hour_price)})
            </button>
            <button className="btn grow" disabled={busy} onClick={onChangePackage}>
              Ndrysho paketën
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
