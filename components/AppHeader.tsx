"use client";

/**
 * Application header.
 *
 * Also carries the persistence status line. That is deliberate: while the app
 * stores data in the browser, the analyst should be able to see it at all
 * times rather than discover it when a device changes.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { getApiClient } from "@/lib/client";
import type { HealthStatus } from "@/lib/client";

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await getApiClient().health();
        if (cancelled) return;
        if (result.ok) setHealth(result.value);
        else setHealthError(result.error.message);
      } catch (cause) {
        if (!cancelled) setHealthError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="app-header">
      <Link href="/" className="brand" style={{ color: "inherit", textDecoration: "none" }}>
        <span className="brand-mark">VANTROCK</span>
        <span className="brand-sub">Intelligence</span>
      </Link>

      <div className="header-divider" />
      {children}
      <div className="header-spacer" />

      <div className="row" style={{ gap: 6 }}>
        <span className={healthError ? "status-dot is-error" : "status-dot"} />
        <span className="label" style={{ letterSpacing: "0.05em" }}>
          {healthError
            ? "storage unavailable"
            : health
              ? `local · ${health.driver} · ${health.project_count} projects`
              : "connecting…"}
        </span>
      </div>
    </header>
  );
}
