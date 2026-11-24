"use client";
/**
 * Shown when a card is presented after the stay's time (plus grace) is up.
 *
 * Most guests pay up front and leave the card in the room, so the usual case
 * is "guest already left": check out with no extra charge. If the guest
 * really stayed longer, the worker can check out with an extra amount
 * (pre-filled with the suggested overtime charge).
 */
import { useState } from "react";
import { formatDuration, formatMoney } from "@/lib/format";

export interface LateCheckout {
  room: string;
  stayId: number;
  overtimeMinutes: number;
  suggestedExtra: number;
}

interface LateCheckoutDialogProps {
  checkout: LateCheckout;
  currency: string;
  busy: boolean;
  onConfirm: (extra: number) => void;
  onCancel: () => void;
}

/** Two choices: check out without extra, or with the amount in the field. */
export default function LateCheckoutDialog({ checkout, currency, busy, onConfirm, onCancel }: LateCheckoutDialogProps) {
  const [extra, setExtra] = useState(String(checkout.suggestedExtra));
  const extraAmount = Number(extra) || 0;

  return (
    <div className="overlay">
      <div className="modal">
        <h2>Dhoma {checkout.room} - dalje</h2>
        <p className="muted">Koha mbaroi para {formatDuration(checkout.overtimeMinutes)}.</p>

        <div className="stack">
          <button className="btn green big" disabled={busy} onClick={() => onConfirm(0)}>
            Klienti ishte larguar - pa pagesë shtesë
          </button>

          <div className="panel">
            <label htmlFor="extra-amount">Klienti qëndroi më gjatë dhe paguan shtesë ({currency})</label>
            <div className="row nowrap">
              <input
                id="extra-amount"
                type="number"
                min="0"
                step="1"
                value={extra}
                onChange={(event) => setExtra(event.target.value)}
              />
              <button className="btn amber" disabled={busy} onClick={() => onConfirm(extraAmount)}>
                Dalje + {formatMoney(extraAmount, currency)}
              </button>
            </div>
          </div>

          <button className="btn sm" onClick={onCancel}>
            Kthehu (klienti është ende brenda)
          </button>
        </div>
      </div>
    </div>
  );
}
