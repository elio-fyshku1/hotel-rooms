"use client";
/**
 * Packages and prices: one editable row per package (name, hours, price,
 * shown or hidden at reception) and a row to add a new one.
 * Empty hours = night package, which ends at the night check-out time.
 */
import { useState } from "react";
import type { Package, Settings } from "@/lib/types";
import { sendJson } from "@/components/apiClient";
import { currencySymbol } from "@/lib/format";
import type { RunChange } from "./AdminPanel";

interface PackagesSectionProps {
  packages: Package[];
  settings: Settings;
  runChange: RunChange;
}

/** Form values of a package; hours as text so the field can be empty. */
interface PackageForm {
  name: string;
  hours: string;
  price: string;
  active: boolean;
}

/** Minutes from the database -> hours for the form ("" for the night package). */
function toForm(pkg: Package): PackageForm {
  return {
    name: pkg.name,
    hours: pkg.minutes === null ? "" : String(pkg.minutes / 60),
    price: String(pkg.price),
    active: pkg.active,
  };
}

const EMPTY_FORM: PackageForm = { name: "", hours: "", price: "", active: true };

/** Table of packages plus the "add" row. */
export default function PackagesSection({ packages, settings, runChange }: PackagesSectionProps) {
  const [newPackage, setNewPackage] = useState<PackageForm>(EMPTY_FORM);

  // Add the package typed in the last row and clear it
  async function addPackage() {
    const ok = await runChange(() => sendJson("/api/admin/packages", newPackage), "Paketa u shtua.");
    if (ok) setNewPackage(EMPTY_FORM);
  }

  return (
    <section className="card">
      <h3>Paketat dhe çmimet</h3>
      <p className="muted small">
        Këto zgjidhen kur jepet dhoma. Orët bosh = paketë nate (dalja deri në {settings.night_checkout}).
        Çmimet në {currencySymbol(settings.currency)}. Ndryshimet vlejnë për hyrjet e reja.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Emri</th>
              <th>Orë</th>
              <th>Çmimi</th>
              <th>Në recepsion</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {packages.map((pkg) => (
              <PackageRow key={`${pkg.id}-${pkg.name}-${pkg.price}-${pkg.minutes}-${pkg.active}`} pkg={pkg} runChange={runChange} />
            ))}
            <tr>
              <td>
                <input placeholder="p.sh. 6 orë" value={newPackage.name} onChange={(e) => setNewPackage({ ...newPackage, name: e.target.value })} />
              </td>
              <td>
                <input type="number" min="0" step="0.5" placeholder="bosh = natë" value={newPackage.hours} onChange={(e) => setNewPackage({ ...newPackage, hours: e.target.value })} />
              </td>
              <td>
                <input type="number" min="0" value={newPackage.price} onChange={(e) => setNewPackage({ ...newPackage, price: e.target.value })} />
              </td>
              <td />
              <td>
                <button className="btn green sm" onClick={addPackage}>
                  Shto
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** One package with its own fields and Save / Delete buttons. */
function PackageRow({ pkg, runChange }: { pkg: Package; runChange: RunChange }) {
  const [form, setForm] = useState<PackageForm>(() => toForm(pkg));

  // Save the changed fields of this package
  function save() {
    runChange(() => sendJson("/api/admin/packages", { id: pkg.id, ...form }, "PATCH"), `Paketa "${form.name}" u ruajt.`);
  }

  // Delete after confirmation (past stays keep their package name and price)
  function remove() {
    if (!confirm(`Të fshihet paketa "${pkg.name}"?`)) return;
    runChange(() => sendJson("/api/admin/packages", { id: pkg.id }, "DELETE"), `Paketa "${pkg.name}" u fshi.`);
  }

  return (
    <tr className={form.active ? "" : "faded"}>
      <td>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </td>
      <td>
        <input type="number" min="0" step="0.5" placeholder="natë" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
      </td>
      <td>
        <input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
      </td>
      <td>
        <select value={form.active ? "yes" : "no"} onChange={(e) => setForm({ ...form, active: e.target.value === "yes" })}>
          <option value="yes">Po</option>
          <option value="no">Jo (e fshehur)</option>
        </select>
      </td>
      <td className="row" style={{ flexWrap: "nowrap" }}>
        <button className="btn blue sm" onClick={save}>
          Ruaj
        </button>
        <button className="btn red sm" onClick={remove}>
          Fshi
        </button>
      </td>
    </tr>
  );
}
