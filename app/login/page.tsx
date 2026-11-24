"use client";
/**
 * Login page.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setSubmitting(false);
    if (response.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "Hyrja dështoi.");
    }
  }

  return (
    <div className="login-page">
      <form className="card" onSubmit={handleSubmit}>
        <h2>Hyrje</h2>
        <div className="form-grid">
          <div>
            <label htmlFor="username">Përdoruesi</label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoFocus
              autoCapitalize="none"
              autoComplete="username"
            />
          </div>
          <div>
            <label htmlFor="password">Fjalëkalimi</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <div className="text-red">{error}</div>}
          <button className="btn blue big" disabled={submitting}>
            {submitting ? "Duke hyrë..." : "Hyr"}
          </button>
        </div>
      </form>
    </div>
  );
}
