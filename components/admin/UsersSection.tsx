"use client";
/**
 * Workers and admins: add, reset password, enable/disable.
 * Users are never deleted so their name stays on the stays they recorded.
 */
import { useState } from "react";
import { sendJson } from "@/components/apiClient";
import type { AdminUser, RunChange } from "./AdminPanel";

interface UsersSectionProps {
  users: AdminUser[];
  currentUserId: number;
  runChange: RunChange;
}

const EMPTY_FORM = { username: "", full_name: "", password: "", role: "worker" };

/** Form to add a user and the list of users with their actions. */
export default function UsersSection({ users, currentUserId, runChange }: UsersSectionProps) {
  const [form, setForm] = useState(EMPTY_FORM);

  // Create the user from the form and clear it
  async function addUser() {
    const ok = await runChange(() => sendJson("/api/admin/users", form), "Përdoruesi u shtua.");
    if (ok) setForm(EMPTY_FORM);
  }

  // Ask for a new password and save it
  function resetPassword(user: AdminUser) {
    const password = prompt(`Fjalëkalimi i ri për ${user.username} (të paktën 6 karaktere)`);
    if (password) {
      runChange(() => sendJson("/api/admin/users", { id: user.id, password }, "PATCH"), "Fjalëkalimi u ndryshua.");
    }
  }

  // Disable a user (can no longer log in) or enable them again
  function toggleUser(user: AdminUser) {
    runChange(
      () => sendJson("/api/admin/users", { id: user.id, active: !user.active }, "PATCH"),
      user.active ? "Përdoruesi u çaktivizua." : "Përdoruesi u aktivizua."
    );
  }

  return (
    <section className="card">
      <h3>Përdoruesit</h3>

      {/* New user form */}
      <div className="row align-end" style={{ marginBottom: 12 }}>
        <div className="grow" style={{ minWidth: 140 }}>
          <label htmlFor="new-username">Përdoruesi</label>
          <input
            id="new-username"
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            autoCapitalize="none"
          />
        </div>
        <div className="grow" style={{ minWidth: 140 }}>
          <label htmlFor="new-name">Emri</label>
          <input id="new-name" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
        </div>
        <div className="grow" style={{ minWidth: 140 }}>
          <label htmlFor="new-password">Fjalëkalimi</label>
          <input
            id="new-password"
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </div>
        <div style={{ width: 130 }}>
          <label htmlFor="new-role">Roli</label>
          <select id="new-role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option value="worker">Punëtor</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <button className="btn green" onClick={addUser}>
          Shto
        </button>
      </div>

      {/* User list; you can't disable your own account */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Përdoruesi</th>
              <th>Emri</th>
              <th>Roli</th>
              <th>Statusi</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={user.active ? "" : "faded"}>
                <td><b>{user.username}</b></td>
                <td>{user.full_name}</td>
                <td>{user.role === "admin" ? "Administrator" : "Punëtor"}</td>
                <td>{user.active ? "aktiv" : "joaktiv"}</td>
                <td className="text-right">
                  <button className="btn sm" onClick={() => resetPassword(user)}>
                    Ndrysho fjalëkalimin
                  </button>{" "}
                  {user.id !== currentUserId && (
                    <button className={`btn sm ${user.active ? "red" : ""}`} onClick={() => toggleUser(user)}>
                      {user.active ? "Çaktivizo" : "Aktivizo"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
