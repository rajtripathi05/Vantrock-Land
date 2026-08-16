/**
 * IndexedDB schema and connection.
 *
 * IndexedDB rather than localStorage because site geometry is unbounded in
 * size (a traced boundary can carry hundreds of vertices) and localStorage is
 * a synchronous ~5 MB string store with no indexes. A handful of sites would
 * fit; a project's worth would not, and the failure mode is a thrown quota
 * error mid-save with no way to recover the drawing.
 *
 * IndexedDB also matches the eventual Postgres shape closely enough that the
 * repository code reads almost identically: object stores map to tables, and
 * the by_project index maps to the index on sites(project_id).
 *
 * This module is the ONLY place that knows IndexedDB exists, apart from the
 * two repository implementations beside it.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Project, Site } from "@/types/domain";

export const DB_NAME = "vantrock-intelligence";
export const DB_VERSION = 1;

export const STORE_PROJECTS = "projects";
export const STORE_SITES = "sites";

export interface VantrockDB extends DBSchema {
  [STORE_PROJECTS]: {
    key: string;
    value: Project;
    indexes: {
      /** MIGRATION: index on projects(owner_id) — the RLS anchor. */
      by_owner: string;
      by_created_at: string;
    };
  };
  [STORE_SITES]: {
    key: string;
    value: Site;
    indexes: {
      /** MIGRATION: index on sites(project_id). */
      by_project: string;
      by_created_at: string;
    };
  };
}

let connection: Promise<IDBPDatabase<VantrockDB>> | null = null;

/**
 * Open (and memoize) the database connection.
 *
 * Callers must be on the client. Guarded explicitly rather than relying on a
 * runtime crash, because a Next.js server render reaching this would fail with
 * an opaque "indexedDB is not defined".
 */
export function getDb(): Promise<IDBPDatabase<VantrockDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error(
        "IndexedDB is unavailable in this environment. The local persistence driver only runs in the browser.",
      ),
    );
  }

  if (!connection) {
    connection = openDB<VantrockDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Forward-only migrations, mirroring how supabase/migrations works.
        if (oldVersion < 1) {
          const projects = db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
          projects.createIndex("by_owner", "owner_id");
          projects.createIndex("by_created_at", "created_at");

          const sites = db.createObjectStore(STORE_SITES, { keyPath: "id" });
          sites.createIndex("by_project", "project_id");
          sites.createIndex("by_created_at", "created_at");
        }
      },
      blocked() {
        console.warn(
          "[vantrock] A database upgrade is blocked by another open tab. Close other Vantrock tabs and reload.",
        );
      },
      terminated() {
        // Drop the memoized handle so the next call reconnects rather than
        // failing forever against a dead connection.
        connection = null;
      },
    });
  }

  return connection;
}

/**
 * Test-only: close and drop the memoized handle.
 *
 * The close() matters: an open IndexedDB connection blocks deleteDB()
 * indefinitely rather than failing, so dropping the reference without closing
 * would hang any test that tries to start from a clean database.
 */
export async function resetDbConnectionForTests(): Promise<void> {
  const pending = connection;
  connection = null;
  if (!pending) return;
  try {
    (await pending).close();
  } catch {
    // Already closed or never opened; nothing to release.
  }
}
