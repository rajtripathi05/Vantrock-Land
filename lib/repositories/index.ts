/**
 * Repository factory — the one place a storage backend is chosen.
 *
 * When the Supabase slice lands, it adds a `createSupabaseRepositories()`
 * beside the IndexedDB one and a case to the switch below. That is the entire
 * production cutover as far as the rest of the application is concerned.
 */

import { getPersistenceDriver } from "@/lib/config/env";
import type { RepositoryBundle } from "./types";
import { createIndexedDbRepositories } from "./indexeddb";

let bundle: RepositoryBundle | null = null;

export function getRepositories(): RepositoryBundle {
  if (bundle) return bundle;

  const driver = getPersistenceDriver();
  switch (driver) {
    case "indexeddb":
      bundle = createIndexedDbRepositories();
      return bundle;
    case "supabase":
      // Deliberately a hard failure rather than a silent fallback to local
      // storage. Believing you are writing to Supabase while writing to the
      // browser is a far worse outcome than an explicit crash.
      throw new Error(
        "The Supabase persistence driver is not implemented yet. Set NEXT_PUBLIC_PERSISTENCE_DRIVER=indexeddb.",
      );
    default: {
      const exhaustive: never = driver;
      throw new Error(`Unknown persistence driver: ${String(exhaustive)}`);
    }
  }
}

/** Test-only: force the next getRepositories() call to rebuild the bundle. */
export function resetRepositoriesForTests(override?: RepositoryBundle): void {
  bundle = override ?? null;
}

export type { ProjectRepository, RepositoryBundle, SiteRepository } from "./types";
