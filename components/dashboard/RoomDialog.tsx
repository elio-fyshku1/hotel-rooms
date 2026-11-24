"use client";
/**
 * Dialog opened by tapping an occupied room. Shows the stay and the actions:
 *
 *   time not up yet -> check out now, +1 hour, switch 2 hours / night, cancel
 *   time is up      -> "guest left" (check out, no extra) or charge extra
 *
 * The dialog only reports what the worker chose; RoomBoard calls the API.
 */
import type { RoomView, Settings, StayAction } from "@/lib/types";
import { formatCountdown, formatMoney, formatTime, stayTypeLabel } from "@/lib/format";

interface RoomDialogProps {
  room: RoomView;
  now: number;
  settings: Settings;
  busy: boolean;
  onClose: () => void;
  onStayAction: (action: StayAction) => void;
}

/** Stay details plus the buttons that fit the current situation. */
export default function RoomDialog({ room, now, settings, busy, onClose, onStayAction }: RoomDialogProps) {
  const stay = room.stay!;
  const tz = settings.timezone;
  const money = (amount: number) => formatMoney(amount, settings.currency);
  const shortLabel = stayTypeLabel("short", settings.short_minutes);

  // Time left until the deadline; negative once the time is up
  const remaining = new Date(stay.expected_out).getTime() - now;
  const minutesOver = Math.floor(-remaining / 60000);

  return (
    // Clicking the dark background closes the dialog; clicks inside it don't
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>
          Dhoma {room.number}
          <span className={`badge ${stay.stay_type}`}>{stayTypeLabel(stay.stay_type, settings.short_minutes)}</span>
        </h2>

        {/* Stay details */}
        <dl className="details">
          <dt>Hyrja</dt>
          <dd>{formatTime(stay.check_in, tz)}</dd>

          <dt>Duhet të dalë</dt>
          <dd>{formatTime(stay.expected_out, tz)}</dd>

          <dt>{remaining > 0 ? "Koha e mbetur" : "Kohë e kaluar"}</dt>
          <dd className={remaining > 0 ? "" : "text-red"}>
            {remaining > 0 ? formatCountdown(remaining) : `+${formatCountdown(-remaining)}`}
          </dd>

          <dt>Paguar</dt>
          <dd>
            {money(stay.base_price)}
            {stay.extra_charge > 0 && ` + ${money(stay.extra_charge)} shtesë`}
          </dd>

          <dt>Regjistroi</dt>
          <dd>{stay.checked_in_by}</dd>
        </dl>

        {remaining <= 0 ? (
          // Time is up: the worker checks the room, then picks one of two outcomes
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
                +{shortLabel} ({money(settings.short_price)})
              </button>
            </div>
            {stay.stay_type === "short" && (
              <button className="btn" disabled={busy} onClick={() => onStayAction({ action: "set_type", type: "night" })}>
                Qëndron natën (gjithsej {money(settings.night_price)})
              </button>
            )}
          </div>
        ) : (
          // Time not up yet: early check-out, more time, or a correction
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
                {stay.stay_type === "short" ? "Ndrysho në natë" : `Ndrysho në ${shortLabel}`}
              </button>
            </div>
            <button className="btn sm" disabled={busy} onClick={() => onStayAction({ action: "cancel" })}>
              Anulo hyrjen (gabim)
            </button>
          </div>
        )}

        <button className="btn big" style={{ marginTop: 12 }} onClick={onClose}>
          Mbyll
        </button>
      </div>
    </div>
  );
}
