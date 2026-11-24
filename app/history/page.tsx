/**
 * History page: stays in a date range, with totals.
 * The filter is a plain GET form, so the period is kept in the URL.
 */
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/stays";
import { getHistory, HistoryRow } from "@/lib/history";
import { formatDateTime, formatDuration, formatMoney, stayTypeLabel } from "@/lib/format";
import NavBar from "@/components/NavBar";

const STATUS_LABELS: Record<HistoryRow["status"], string> = {
  open: "brenda",
  closed: "mbyllur",
  cancelled: "anuluar",
};

interface HistoryPageProps {
  searchParams: Promise<{ from?: string; to?: string; room?: string }>;
}

/** Reads the filter from the URL, loads the stays and works out the totals. */
export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const user = await requireUser();
  const settings = await getSettings();
  const params = await searchParams;

  // Default period: today in the hotel's timezone ("sv-SE" formats as YYYY-MM-DD)
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: settings.timezone });
  const from = params.from || today;
  const to = params.to || from;
  const room = params.room || "";

  const rows = await getHistory(from, to, room || undefined);
  // Shortcut for amounts in the hotel currency
  const money = (amount: number) => formatMoney(amount, settings.currency);

  // Totals (cancelled stays don't count)
  const validRows = rows.filter((row) => row.status !== "cancelled");
  const revenue = validRows.reduce((sum, row) => sum + row.total, 0);
  const extras = validRows.reduce((sum, row) => sum + row.extra_charge, 0);
  const shortCount = validRows.filter((row) => row.stay_type === "short").length;
  const nightCount = validRows.length - shortCount;
  const cancelledCount = rows.length - validRows.length;

  // Check-ins and revenue per worker, for checking the cash at the end of a shift
  const perWorker = new Map<string, { count: number; total: number }>();
  for (const row of validRows) {
    const name = row.checked_in_by || "-";
    const current = perWorker.get(name) ?? { count: 0, total: 0 };
    perWorker.set(name, { count: current.count + 1, total: current.total + row.total });
  }

  const csvQuery = new URLSearchParams({ from, to, ...(room ? { room } : {}) }).toString();

  return (
    <>
      <NavBar user={user} hotelName={settings.hotel_name} />
      <div className="container">
        {/* Filter */}
        <form className="card row align-end" style={{ marginBottom: 12 }}>
          <div>
            <label htmlFor="from">Nga</label>
            <input id="from" type="date" name="from" defaultValue={from} />
          </div>
          <div>
            <label htmlFor="to">Deri</label>
            <input id="to" type="date" name="to" defaultValue={to} />
          </div>
          <div style={{ width: 120 }}>
            <label htmlFor="room">Dhoma</label>
            <input id="room" name="room" defaultValue={room} placeholder="të gjitha" />
          </div>
          <button className="btn blue">Shfaq</button>
          <span className="spacer" />
          {user.role === "admin" && (
            <a className="btn" href={`/api/history/csv?${csvQuery}`}>
              Shkarko CSV
            </a>
          )}
        </form>

        {/* Totals */}
        <div className="grid" style={{ marginBottom: 12 }}>
          <div className="card">
            <div className="muted small">Qëndrime</div>
            <h2>{validRows.length}</h2>
            <div className="muted small">
              {shortCount} × {stayTypeLabel("short", settings.short_minutes)} · {nightCount} × natë
              {cancelledCount > 0 && ` · ${cancelledCount} të anuluara`}
            </div>
          </div>
          <div className="card">
            <div className="muted small">Të ardhura</div>
            <h2>{money(revenue)}</h2>
            <div className="muted small">nga të cilat shtesa {money(extras)}</div>
          </div>
          <div className="card">
            <div className="muted small">Sipas punëtorit (hyrje)</div>
            {[...perWorker.entries()].map(([name, values]) => (
              <div key={name} className="row small space-between">
                <span>{name}</span>
                <span>
                  {values.count} · {money(values.total)}
                </span>
              </div>
            ))}
            {perWorker.size === 0 && <div className="muted small">-</div>}
          </div>
        </div>

        {/* Stay list */}
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dhoma</th>
                <th>Lloji</th>
                <th>Hyrja</th>
                <th>Dalja</th>
                <th>Kohëzgjatja</th>
                <th>Çmimi</th>
                <th>Shtesë</th>
                <th>Totali</th>
                <th>Statusi</th>
                <th>Punëtori</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.status === "cancelled" ? "faded" : ""}>
                  <td><b>{row.room}</b></td>
                  <td><span className={`badge ${row.stay_type}`}>{stayTypeLabel(row.stay_type, settings.short_minutes)}</span></td>
                  <td>{formatDateTime(row.check_in, settings.timezone)}</td>
                  <td>{formatDateTime(row.check_out, settings.timezone)}</td>
                  <td>{formatDuration(row.minutes)}</td>
                  <td>{money(row.base_price)}</td>
                  <td>{row.extra_charge > 0 ? money(row.extra_charge) : "-"}</td>
                  <td><b>{money(row.total)}</b></td>
                  <td><span className={`badge ${row.status}`}>{STATUS_LABELS[row.status]}</span></td>
                  <td className="small">
                    {row.checked_in_by}
                    {row.checked_out_by && row.checked_out_by !== row.checked_in_by && ` / ${row.checked_out_by}`}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted">Nuk ka qëndrime në këtë periudhë.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
