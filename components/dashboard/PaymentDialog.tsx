"use client";
/**
 * Asks whether the guest pays now.
 *
 *   at check-in:  "Dëshironi të paguani tani?"  Po -> paid, Jo -> pays when leaving
 *   at check-out: the guest hasn't paid yet       -> collect the amount, or leave it unpaid
 *
 * Unpaid stays stay visible (tile label, room dialog, History page), so the
 * money can still be collected later.
 */
import { formatMoney } from "@/lib/format";

export interface PaymentRequest {
  stayId: number;
  room: string;
  amount: number;
  moment: "checkin" | "checkout";
}

interface PaymentDialogProps {
  request: PaymentRequest;
  currency: string;
  busy: boolean;
  onPay: () => void;
  onLater: () => void;
}

/** Question with the amount and two answers. */
export default function PaymentDialog({ request, currency, busy, onPay, onLater }: PaymentDialogProps) {
  const amount = formatMoney(request.amount, currency);
  const isCheckIn = request.moment === "checkin";

  return (
    <div className="overlay">
      <div className="modal">
        <h2>
          Dhoma {request.room} - {isCheckIn ? "hyrje" : "dalje"}
        </h2>
        <p className="payment-amount">{amount}</p>
        <p>{isCheckIn ? "Dëshironi të paguani tani?" : "Klienti nuk ka paguar ende. Merrni pagesën."}</p>

        <div className="stack">
          <button className="btn green big" disabled={busy} onClick={onPay}>
            {isCheckIn ? `Po, pagoi ${amount}` : `U pagua ${amount}`}
          </button>
          <button className="btn big" disabled={busy} onClick={onLater}>
            {isCheckIn ? "Jo, paguan në dalje" : "Nuk pagoi (mbetet pa paguar)"}
          </button>
        </div>
      </div>
    </div>
  );
}
