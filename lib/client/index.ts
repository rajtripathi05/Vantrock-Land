/**
 * ApiClient factory — the single place the UI obtains its data access.
 *
 * When the Supabase slice lands this gains an HttpApiClient branch selected by
 * the persistence driver. Components keep calling useApi() and never learn
 * that the calls started crossing a network.
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
      client = new LocalApiClient();
      return client;
    case "supabase":
      // Will become: client = new HttpApiClient("/api")
      throw new Error(
        "The Supabase transport is not implemented yet. Set NEXT_PUBLIC_PERSISTENCE_DRIVER=indexeddb.",
      );
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
