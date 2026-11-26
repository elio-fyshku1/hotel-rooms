"use client";
/**
 * Time rules and overtime form (package prices are in PackagesSection).
 */
import { useState } from "react";
import type { Settings } from "@/lib/types";
import { sendJson } from "@/components/apiClient";
import type { RunChange } from "./AdminPanel";

interface SettingsSectionProps {
  settings: Settings;
  runChange: RunChange;
}

/** Form with all settings; saved together with one button. */
export default function SettingsSection({ settings, runChange }: SettingsSectionProps) {
  const [form, setForm] = useState<Settings>(settings);

  /** A labelled input bound to one settings field. */
  function field(key: keyof Settings, label: string, type: "text" | "number" | "time" = "text") {
    return (
      <div>
        <label htmlFor={key}>{label}</label>
        <input
          id={key}
          type={type}
          value={String(form[key])}
          onChange={(event) =>
            setForm({ ...form, [key]: type === "number" ? Number(event.target.value) : event.target.value })
          }
        />
      </div>
    );
  }

  return (
    <section className="card">
      <h3>Rregullat</h3>
      <div className="grid">
        {field("hotel_name", "Emri i hotelit")}
        {field("currency", "Monedha (EUR, ALL...)")}
        {field("timezone", "Zona kohore")}
        {field("night_start", "Nga kjo orë sugjerohet paketa e natës", "time")}
        {field("night_end", "Nata mbaron në", "time")}
        {field("night_checkout", "Klientët e natës dalin deri në", "time")}
        {field("extra_hour_price", "Shtesa për çdo orë të filluar", "number")}
        {field("grace_minutes", "Minuta tolerancë para shtesës", "number")}
        <div>
          <label htmlFor="require_cleaning">Pastrimi</label>
          <select
            id="require_cleaning"
            value={form.require_cleaning ? "yes" : "no"}
            onChange={(event) => setForm({ ...form, require_cleaning: event.target.value === "yes" })}
          >
            <option value="yes">Pas daljes dhoma pret të shënohet si e pastruar</option>
            <option value="no">Pas daljes dhoma është menjëherë e lirë</option>
          </select>
        </div>
      </div>
      <button
        className="btn blue"
        style={{ marginTop: 12 }}
        onClick={() => runChange(() => sendJson("/api/admin/settings", form), "Cilësimet u ruajtën.")}
      >
        Ruaj cilësimet
      </button>
    </section>
  );
}
