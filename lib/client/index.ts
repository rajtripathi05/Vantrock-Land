/**
 * ApiClient factory — the single place the UI obtains its data access.
 *
 * LocalApiClient is transport-agnostic despite its name: it resolves a
 * RepositoryBundle via lib/repositories/index.ts (which already routes
 * "indexeddb" and "supabase" to their respective implementations) and calls
 * the same service functions either way. The Supabase JS client is safe to
 * run directly in the browser — it uses the anon key, constrained by RLS —
 * so no separate HttpApiClient/server round trip is needed for this MVP's
 * single-tenant-behind-a-password-gate posture. Components keep calling
 * getApiClient() and never learn which backend answered.
 */

import { getPersistenceDriver } from "@/lib/config/env";
import type { ApiClient } from "./api";
import { LocalApiClient } from "./local-api";

let client: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (client) return client;

  const driver = getPersistenceDriver();
  switch (driver) {
    case "indexeddb":
    case "supabase":
      client = new LocalApiClient();
      return client;
    default: {
      const exhaustive: never = driver;
      throw new Error(`Unknown persistence driver: ${String(exhaustive)}`);
    }
  }
}

/** Test-only. */
export function setApiClientForTests(override: ApiClient | null): void {
  client = override;
}

export type { ApiClient, HealthStatus } from "./api";
