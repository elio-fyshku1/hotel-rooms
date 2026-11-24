/**
 * Display formatting (money, times, durations). Used on the server and in the
 * browser. Times are always shown in the hotel's timezone, not the device's.
 */

// Symbols for the currencies a hotel in Albania is likely to use.
// Any other code is shown as is (e.g. "20 GBP").
const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", ALL: "Lekë" };

/**
 * 20 -> "20 €", 12.5 -> "12,50 €"
 * Formatted by hand instead of Intl.NumberFormat because browsers and Node
 * format the Albanian locale differently, and the same amount should look
 * the same on every page.
 */
export function formatMoney(amount: number, currency: string): string {
  const number = Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(".", ",");
  return `${number} ${CURRENCY_SYMBOLS[currency] ?? currency}`;
}

/** Date -> "14:05" */
export function formatTime(value: string | Date, timezone: string): string {
  return new Date(value).toLocaleTimeString("sq-AL", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** Date -> "22.11, 14:05" (or "-" when empty) */
export function formatDateTime(value: string | Date | null, timezone: string): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("sq-AL", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** Milliseconds -> "1:23:45" (for countdowns) */
export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Minutes -> "1 orë 52 min" / "35 min" */
export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return hours > 0 ? `${hours} orë ${minutes} min` : `${minutes} min`;
}

/** Stay type as shown to the worker: "Natë" or e.g. "2 orë" (from the short stay length). */
export function stayTypeLabel(type: "short" | "night", shortMinutes = 120): string {
  if (type === "night") return "Natë";
  return shortMinutes % 60 === 0 ? `${shortMinutes / 60} orë` : `${shortMinutes} min`;
}

/** What a guest still has to pay for a stay (never negative). */
export function amountDue(stay: { base_price: number; extra_charge: number; paid_amount: number }): number {
  return Math.max(stay.base_price + stay.extra_charge - stay.paid_amount, 0);
}
