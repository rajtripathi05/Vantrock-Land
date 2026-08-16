/**
 * ApiClient — the only surface the UI is allowed to depend on.
 *
 * ===========================================================================
 * WHY THIS EXISTS
 * ===========================================================================
 *
 * The production architecture is:
 *
 *   Frontend -> Application/API layer -> Business logic -> Repository -> Storage
 *
 * In local mode there is no network, so there is no HTTP layer. Without this
 * interface the UI would have to call services directly, and adding HTTP later
 * would mean rewriting every component to be async-over-fetch, handle loading
 * and error states differently, and deal with serialization.
 *
 * Instead the UI depends on ApiClient. Two implementations satisfy it:
 *
 *   LocalApiClient  (now)   calls services in-process
 *   HttpApiClient   (later) fetches /api/* route handlers, which call the
 *                           SAME services with a Supabase-backed repository
 *
 * Method signatures deliberately mirror the blueprint's HTTP contract
 * (section E), so the later implementation is a transport change and nothing
 * more. Results are already Result envelopes — the exact shape the HTTP layer
 * will serialize — so no component needs to learn a new error model.
 */

import type {
  CreateProjectInput,
  CreateSiteInput,
  Project,
  Result,
  Site,
  UpdateSiteInput,
} from "@/types/domain";
import type { CreateSiteResult } from "@/lib/app/services/sites";

export interface HealthStatus {
  ok: boolean;
  driver: string;
  engine_version: string;
  project_count: number;
  site_count: number;
  /** Set when the storage backend could not be reached. */
  detail?: string;
}

export interface ApiClient {
  /** GET /api/health */
  health(): Promise<Result<HealthStatus>>;

  /** POST /api/projects */
  createProject(input: CreateProjectInput): Promise<Result<Project>>;
  /** GET /api/projects */
  listProjects(): Promise<Result<Project[]>>;
  /** GET /api/projects/:id */
  getProject(id: string): Promise<Result<Project>>;
  /** DELETE /api/projects/:id */
  deleteProject(id: string): Promise<Result<{ deleted_sites: number }>>;

  /** POST /api/projects/:id/sites */
  createSite(input: CreateSiteInput): Promise<Result<CreateSiteResult>>;
  /** GET /api/projects/:id/sites */
  listSites(projectId: string): Promise<Result<Site[]>>;
  /** GET /api/sites/:id */
  getSite(id: string): Promise<Result<Site>>;
  /** PATCH /api/sites/:id */
  updateSite(id: string, patch: UpdateSiteInput): Promise<Result<Site>>;
  /** DELETE /api/sites/:id */
  deleteSite(id: string): Promise<Result<{ id: string }>>;
}
