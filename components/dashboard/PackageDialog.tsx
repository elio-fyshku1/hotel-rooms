"use client";
/**
 * Chooses the package when a room is given (2, 3, 4, 5 hours, 24 hours or the
 * night), and when a guest switches to another package later.
 *
 * In the evening (night window in settings) the night package is highlighted
 * as a suggestion; the worker can still pick any other one.
 */
import type { Package, Settings } from "@/lib/types";
import { formatMoney, formatTime } from "@/lib/format";

export interface PackageRequest {
  room: string;
  mode: "checkin" | "change";
  currentPackage?: string; // when changing: the package the guest has now
  startsAt: number;        // ms; now for a check-in, the check-in time when changing
}

interface PackageDialogProps {
  request: PackageRequest;
  packages: Package[];
  settings: Settings;
  nightNow: boolean;
  busy: boolean;
  onChoose: (pkg: Package) => void;
  onCancel: () => void;
}

/**
 * When a package started at `startsAt` ends, as "deri në 19:45".
 * The night package always ends at the night check-out time.
 */
function endTimeText(pkg: Package, startsAt: number, settings: Settings): string {
  if (pkg.minutes === null) return `deri në ${settings.night_checkout}`;
  return `deri në ${formatTime(new Date(startsAt + pkg.minutes * 60000), settings.timezone)}`;
}

/** One big button per package, with its price and end time. */
export default function PackageDialog({ request, packages, settings, nightNow, busy, onChoose, onCancel }: PackageDialogProps) {
  return (
    <div className="overlay">
      <div className="modal">
        <h2>
          Dhoma {request.room} - {request.mode === "checkin" ? "hyrje" : "ndrysho paketën"}
        </h2>
        <p className="muted small no-margin">
          {request.mode === "checkin"
            ? "Zgjidhni sa do qëndrojë klienti. Koha fillon nga tani."
            : `Paketa e tanishme: ${request.currentPackage}. Koha llogaritet nga ora e hyrjes.`}
        </p>

        <div className="package-grid">
          {packages.map((pkg) => {
            const suggested = request.mode === "checkin" && nightNow && pkg.minutes === null;
            const current = request.mode === "change" && pkg.name === request.currentPackage;
            return (
              <button
                key={pkg.id}
                className={`btn package ${suggested ? "blue" : ""}`}
                disabled={busy || current}
                onClick={() => onChoose(pkg)}
              >
                <span className="package-name">{pkg.name}</span>
                <span className="package-price">{formatMoney(pkg.price, settings.currency)}</span>
                <span className="package-detail">
                  {current ? "paketa e tanishme" : endTimeText(pkg, request.startsAt, settings)}
                </span>
              </button>
            );
          })}
        </div>

        {packages.length === 0 && (
          <div className="alert">Nuk ka paketa aktive. Administratori i shton te Administrimi.</div>
        )}

        <button className="btn big" style={{ marginTop: 12 }} disabled={busy} onClick={onCancel}>
          Anulo
        </button>
      </div>
    </div>
  );
}
