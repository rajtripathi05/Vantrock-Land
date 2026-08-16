"use client";

/**
 * Demo access gate — single shared password, HTTP-only session cookie.
 *
 * Client-side code never sees DEMO_ACCESS_PASSWORD and never checks it
 * locally; this form only POSTs a candidate to /api/auth/login, which is the
 * sole place the real password is compared (server-side).
 */

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        setError(body?.error?.message ?? "Login failed.");
        setSubmitting(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="page-scroll" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <form className="card" style={{ width: 360 }} onSubmit={(event) => void handleSubmit(event)}>
          <div style={{ marginBottom: 18 }}>
            <span className="brand-mark">VANTROCK</span>{" "}
            <span className="brand-sub">Intelligence</span>
          </div>
          <p className="field-hint" style={{ marginBottom: 16 }}>
            This is a private demonstration environment. Enter the access password to continue.
          </p>

          {error ? (
            <div className="alert alert-error" style={{ marginBottom: 14 }}>
              {error}
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="demo-password">Access password</label>
            <input
              id="demo-password"
              className="input"
              type="password"
              autoFocus
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
            {submitting ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
