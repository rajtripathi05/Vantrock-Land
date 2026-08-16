/**
 * Repository interfaces — the seam between business logic and storage.
 *
 * ===========================================================================
 * THIS IS THE CONTRACT SUPABASE WILL IMPLEMENT
 * ===========================================================================
 *
 * Business logic in lib/app/services depends on these interfaces and nothing
 * else. Today they are backed by IndexedDB. Tomorrow they are backed by
 * Postgres + PostGIS behind Supabase, and not one line of service code, and
 * not one component, changes.
 *
 * Design constraints that make that swap safe:
 *
 *   1. Every method is async. A synchronous localStorage-shaped interface
 *      would have to be rewritten the moment a network hop appears.
 *   2. Methods take and return domain types, never storage rows. No IndexedDB
 *      key, no Postgres row shape, ever crosses this boundary.
 *   3. Repositories PERSIST. They do not validate, measure, or derive. All of
 *      that lives in the service layer, so it stays identical across backends.
 *   4. Reads are explicit about ordering and filtering, so a SQL
 *      implementation can push them into the query rather than sorting in
 *      memory after fetching the world.
 *   5. Not-found is a null return, not a throw. Storage errors throw.
 */

import type { Project, Site } from "@/types/domain";

export interface ProjectRepository {
  create(project: Project): Promise<Project>;
  /** Null when no project has that id. */
  findById(id: string): Promise<Project | null>;
  /** Newest first. MIGRATION: ORDER BY created_at DESC. */
  listByOwner(ownerId: string): Promise<Project[]>;
  update(id: string, patch: Partial<Project>): Promise<Project | null>;
  /** Cascades to the project's sites. MIGRATION: ON DELETE CASCADE. */
  delete(id: string): Promise<boolean>;
}

export interface SiteRepository {
  create(site: Site): Promise<Site>;
  findById(id: string): Promise<Site | null>;
  /**
   * Sites belonging to one project, newest first.
   * MIGRATION: WHERE project_id = $1 ORDER BY created_at DESC — an indexed
   * lookup, which is why the index on (project_id) exists in blueprint C2.
   */
  listByProject(projectId: string): Promise<Site[]>;
  update(id: string, patch: Partial<Site>): Promise<Site | null>;
  delete(id: string): Promise<boolean>;
  deleteByProject(projectId: string): Promise<number>;
  countByProject(projectId: string): Promise<number>;
}

/**
 * The set of repositories a storage backend must provide.
 *
 * Services receive this, so adding a repository later (analysis runs, metrics,
 * evidence) extends the bundle rather than rewiring every call site.
 */
export interface RepositoryBundle {
  projects: ProjectRepository;
  sites: SiteRepository;
  /** Identifies the active backend for diagnostics and the UI status line. */
  readonly driver: string;
}
