"use client";
/**
 * Security: email alerts to the owner, the hotel's internet address (workers
 * can use the app only from it when the rule is on) and the login history.
 */
import { useState } from "react";
import { sendJson } from "@/components/apiClient";
import { formatDateTime } from "@/lib/format";
import type { RunChange } from "./AdminPanel";

export interface SecuritySettings {
  notify_email: string;
  smtp_user: string;
  smtp_password_set: boolean;
  notify_logins: boolean;
  hotel_ips: string;
  workers_only_from_hotel: boolean;
}

export interface LoginRow {
  id: number;
  at: string;
  username: string;
  full_name: string | null;
  result: "ok" | "logout" | "wrong_password" | "outside_hotel";
  ip: string;
  from_hotel: boolean;
}

interface SecuritySectionProps {
  security: SecuritySettings;
  myIp: string;
  logins: LoginRow[];
  timezone: string;
  runChange: RunChange;
}

const RESULT_LABELS: Record<LoginRow["result"], string> = {
  ok: "Hyri",
  logout: "Doli",
  wrong_password: "Fjalëkalim i gabuar",
  outside_hotel: "Bllokuar: jashtë hotelit",
};

/** The three security blocks, one card each. */
export default function SecuritySection(props: SecuritySectionProps) {
  return (
    <>
      <EmailAlerts {...props} />
      <HotelNetwork {...props} />
      <LoginHistory {...props} />
    </>
  );
}

/** Where alerts go, the Gmail account that sends them, and a test button. */
function EmailAlerts({ security, runChange }: SecuritySectionProps) {
  const [form, setForm] = useState({ ...security, smtp_password: "" });

  // Saves everything in this card (password only if a new one was typed)
  async function save() {
    const ok = await runChange(
      () =>
        sendJson(
          "/api/admin/security",
          { ...form, hotel_ips: security.hotel_ips, workers_only_from_hotel: security.workers_only_from_hotel },
          "PATCH"
        ),
      "Njoftimet u ruajtën."
    );
    if (ok) setForm({ ...form, smtp_password: "" });
  }

  return (
    <section className="card">
      <h3>Njoftimet me email</h3>
      <p className="muted small">
        Pronari merr email kur një punonjës hyn ose del, dhe kur provon të hyjë jashtë hotelit. Email-i dërgohet
        nga një llogari Gmail me &quot;fjalëkalim aplikacioni&quot; (Google Account → Security → App passwords).
      </p>
      <div className="grid">
        <div>
          <label htmlFor="notify_email">Email-i ku vijnë njoftimet</label>
          <input id="notify_email" type="email" value={form.notify_email} onChange={(e) => setForm({ ...form, notify_email: e.target.value })} />
        </div>
        <div>
          <label htmlFor="smtp_user">Gmail-i që i dërgon</label>
          <input id="smtp_user" type="email" value={form.smtp_user} onChange={(e) => setForm({ ...form, smtp_user: e.target.value })} />
        </div>
        <div>
          <label htmlFor="smtp_password">Fjalëkalimi i aplikacionit (16 shkronja)</label>
          <input
            id="smtp_password"
            type="password"
            autoComplete="new-password"
            placeholder={security.smtp_password_set ? "i ruajtur (shkruani vetëm për ta ndryshuar)" : ""}
            value={form.smtp_password}
            onChange={(e) => setForm({ ...form, smtp_password: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="notify_logins">Email për çdo hyrje dhe dalje të punonjësve</label>
          <select id="notify_logins" value={form.notify_logins ? "yes" : "no"} onChange={(e) => setForm({ ...form, notify_logins: e.target.value === "yes" })}>
            <option value="yes">Po</option>
            <option value="no">Jo (vetëm për hyrjet e bllokuara)</option>
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn blue" onClick={save}>
          Ruaj
        </button>
        <button className="btn" onClick={() => runChange(() => sendJson("/api/admin/security", {}), "Email-i provë u dërgua. Kontrolloni postën.")}>
          Dërgo email provë
        </button>
      </div>
    </section>
  );
}

/** The hotel's internet address(es) and the "workers only from the hotel" rule. */
function HotelNetwork({ security, myIp, runChange }: SecuritySectionProps) {
  const [ips, setIps] = useState(security.hotel_ips);
  const myIpSaved = security.hotel_ips.split("\n").includes(myIp);

  // Saves the addresses and the rule; the email settings stay as saved
  function save(nextIps: string, rule: boolean, message: string) {
    runChange(
      () =>
        sendJson(
          "/api/admin/security",
          { ...security, smtp_password: "", hotel_ips: nextIps, workers_only_from_hotel: rule },
          "PATCH"
        ),
      message
    );
  }

  return (
    <section className="card">
      <h3>Interneti i hotelit</h3>
      <p className="muted small">
        Kur rregulli është i ndezur, punonjësit përdorin sistemin vetëm nga këto adresa IP (interneti i hotelit).
        Administratori hyn nga kudo. Nëse operatori ia ndryshon IP-në hotelit, punonjësit bllokohen: email-i i
        bllokimit tregon IP-në e re, që e shtoni këtu edhe nga telefoni.
      </p>

      <div className={`alert ${security.workers_only_from_hotel ? "on" : "warn"}`} style={{ marginBottom: 12 }}>
        {security.workers_only_from_hotel
          ? "I ndezur: punonjësit hyjnë vetëm nga interneti i hotelit."
          : "I fikur: punonjësit mund të hyjnë nga kudo."}
      </div>

      <label htmlFor="hotel_ips">IP-të e hotelit (një për rresht)</label>
      <textarea id="hotel_ips" rows={3} value={ips} placeholder="p.sh. 80.90.92.91" onChange={(e) => setIps(e.target.value)} />
      <p className="muted small">
        IP-ja juaj tani: <strong>{myIp || "e panjohur"}</strong>
        {myIp && !myIpSaved && (
          <button
            className="btn sm"
            style={{ marginLeft: 8 }}
            onClick={() => setIps(ips.trim() ? `${ips.trim()}\n${myIp}` : myIp)}
          >
            Shto IP-në ku jam tani
          </button>
        )}
      </p>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn blue" onClick={() => save(ips, security.workers_only_from_hotel, "IP-të e hotelit u ruajtën.")}>
          Ruaj IP-të
        </button>
        <button
          className={`btn ${security.workers_only_from_hotel ? "" : "green"}`}
          onClick={() =>
            save(
              ips,
              !security.workers_only_from_hotel,
              security.workers_only_from_hotel
                ? "Punonjësit mund të hyjnë nga kudo."
                : "Punonjësit tani hyjnë vetëm nga interneti i hotelit."
            )
          }
        >
          {security.workers_only_from_hotel ? "Lejoji punonjësit nga kudo" : "Punonjësit vetëm nga hoteli"}
        </button>
      </div>
    </section>
  );
}

/** The last login attempts: who, when, from which computer, result. */
function LoginHistory({ logins, timezone }: SecuritySectionProps) {
  return (
    <section className="card">
      <h3>Hyrjet e fundit në sistem</h3>
      {logins.length === 0 ? (
        <p className="muted">Asnjë hyrje ende.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ora</th>
                <th>Përdoruesi</th>
                <th>Rezultati</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logins.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.at, timezone)}</td>
                  <td>{row.full_name || row.username}</td>
                  <td>
                    <span className={`badge ${row.result === "ok" || row.result === "logout" ? "closed" : "open"}`}>
                      {RESULT_LABELS[row.result]}
                    </span>
                  </td>
                  <td>
                    {row.ip || "-"} <span className="muted small">{row.from_hotel ? "(hoteli)" : "(jashtë)"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
