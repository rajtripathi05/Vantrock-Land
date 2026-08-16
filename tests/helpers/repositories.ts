/**
 * Test helper: a clean IndexedDB-backed repository bundle per test.
 *
 * Deliberately exercises the REAL repository implementation against an
 * in-memory IndexedDB rather than a hand-written in-memory fake. A fake would
 * test the fake; this tests the code that ships.
 */

import { deleteDB } from "idb";
import { createIndexedDbRepositories } from "@/lib/repositories/indexeddb";
import { DB_NAME, resetDbConnectionForTests } from "@/lib/repositories/indexeddb/db";
import type { RepositoryBundle } from "@/lib/repositories/types";

export async function freshRepositories(): Promise<RepositoryBundle> {
  await resetDbConnectionForTests();
  await deleteDB(DB_NAME);
  return createIndexedDbRepositories();
}

/**
 * Simulate a browser refresh: drop every in-process handle and reconnect to
 * the same underlying database, exactly as a page reload would.
 */
export async function simulateReload(): Promise<RepositoryBundle> {
  await resetDbConnectionForTests();
  return createIndexedDbRepositories();
}
