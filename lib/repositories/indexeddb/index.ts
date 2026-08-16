/**
 * IndexedDB implementations of the repository interfaces.
 *
 * Deliberately thin: persist, read back, sort. No validation, no measurement,
 * no derivation — those belong to the service layer so they survive the
 * backend swap unchanged.
 *
 * Every method here has a one-line SQL equivalent noted, which is the whole
 * point of keeping the interface narrow.
 */

import type { Project, Site } from "@/types/domain";
import type { ProjectRepository, RepositoryBundle, SiteRepository } from "../types";
import { getDb, STORE_PROJECTS, STORE_SITES } from "./db";

const byCreatedAtDesc = <T extends { created_at: string }>(a: T, b: T): number =>
  b.created_at.localeCompare(a.created_at);

class IndexedDbProjectRepository implements ProjectRepository {
  async create(project: Project): Promise<Project> {
    const db = await getDb();
    // add() rather than put() so a duplicate id is an error, not a silent
    // overwrite. MIGRATION: INSERT INTO projects (...) — the primary key does
    // the same job.
    await db.add(STORE_PROJECTS, project);
    return project;
  }

  /** MIGRATION: SELECT * FROM projects WHERE id = $1 */
  async findById(id: string): Promise<Project | null> {
    const db = await getDb();
    return (await db.get(STORE_PROJECTS, id)) ?? null;
  }

  /** MIGRATION: SELECT * FROM projects WHERE owner_id = $1 ORDER BY created_at DESC */
  async listByOwner(ownerId: string): Promise<Project[]> {
    const db = await getDb();
    const rows = await db.getAllFromIndex(STORE_PROJECTS, "by_owner", ownerId);
    return rows.sort(byCreatedAtDesc);
  }

  /** MIGRATION: UPDATE projects SET ... WHERE id = $1 RETURNING * */
  async update(id: string, patch: Partial<Project>): Promise<Project | null> {
    const db = await getDb();
    const tx = db.transaction(STORE_PROJECTS, "readwrite");
    const existing = await tx.store.get(id);
    if (!existing) {
      await tx.done;
      return null;
    }
    // id and owner_id are immutable — reassigning ownership is not an update.
    const updated: Project = {
      ...existing,
      ...patch,
      id: existing.id,
      owner_id: existing.owner_id,
      updated_at: new Date().toISOString(),
    };
    await tx.store.put(updated);
    await tx.done;
    return updated;
  }

  /** MIGRATION: DELETE FROM projects WHERE id = $1 (sites cascade) */
  async delete(id: string): Promise<boolean> {
    const db = await getDb();
    const tx = db.transaction(STORE_PROJECTS, "readwrite");
    const existing = await tx.store.get(id);
    if (!existing) {
      await tx.done;
      return false;
    }
    await tx.store.delete(id);
    await tx.done;
    return true;
  }
}

class IndexedDbSiteRepository implements SiteRepository {
  async create(site: Site): Promise<Site> {
    const db = await getDb();
    await db.add(STORE_SITES, site);
    return site;
  }

  /** MIGRATION: SELECT *, ST_AsGeoJSON(geom) FROM sites WHERE id = $1 */
  async findById(id: string): Promise<Site | null> {
    const db = await getDb();
    return (await db.get(STORE_SITES, id)) ?? null;
  }

  /** MIGRATION: SELECT * FROM sites WHERE project_id = $1 ORDER BY created_at DESC */
  async listByProject(projectId: string): Promise<Site[]> {
    const db = await getDb();
    const rows = await db.getAllFromIndex(STORE_SITES, "by_project", projectId);
    return rows.sort(byCreatedAtDesc);
  }

  /** MIGRATION: UPDATE sites SET ... WHERE id = $1 RETURNING * */
  async update(id: string, patch: Partial<Site>): Promise<Site | null> {
    const db = await getDb();
    const tx = db.transaction(STORE_SITES, "readwrite");
    const existing = await tx.store.get(id);
    if (!existing) {
      await tx.done;
      return null;
    }
    // Geometry and measurements travel together or not at all. A patch that
    // changed one without the other would desynchronise the stored area from
    // the stored boundary — the exact failure this architecture exists to
    // prevent. The service layer re-measures and passes both.
    const updated: Site = {
      ...existing,
      ...patch,
      id: existing.id,
      project_id: existing.project_id,
      updated_at: new Date().toISOString(),
    };
    await tx.store.put(updated);
    await tx.done;
    return updated;
  }

  /** MIGRATION: DELETE FROM sites WHERE id = $1 */
  async delete(id: string): Promise<boolean> {
    const db = await getDb();
    const tx = db.transaction(STORE_SITES, "readwrite");
    const existing = await tx.store.get(id);
    if (!existing) {
      await tx.done;
      return false;
    }
    await tx.store.delete(id);
    await tx.done;
    return true;
  }

  /**
   * MIGRATION: unnecessary — ON DELETE CASCADE handles this in Postgres.
   * IndexedDB has no referential integrity, so the cascade is explicit here.
   */
  async deleteByProject(projectId: string): Promise<number> {
    const db = await getDb();
    const tx = db.transaction(STORE_SITES, "readwrite");
    const keys = await tx.store.index("by_project").getAllKeys(projectId);
    for (const key of keys) await tx.store.delete(key);
    await tx.done;
    return keys.length;
  }

  /** MIGRATION: SELECT count(*) FROM sites WHERE project_id = $1 */
  async countByProject(projectId: string): Promise<number> {
    const db = await getDb();
    return db.countFromIndex(STORE_SITES, "by_project", projectId);
  }
}

export function createIndexedDbRepositories(): RepositoryBundle {
  return {
    projects: new IndexedDbProjectRepository(),
    sites: new IndexedDbSiteRepository(),
    driver: "indexeddb",
  };
}
