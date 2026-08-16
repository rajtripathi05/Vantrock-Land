/**
 * LocalApiClient — in-process ApiClient backed by the local repositories.
 *
 * Stands in for the HTTP layer while there is no server-side data store. It
 * does exactly what a route handler will do: resolve the repository bundle,
 * call the service, return the Result. No business logic lives here, so the
 * HTTP implementation will not need to duplicate any.
 */

import type { ApiClient, HealthStatus } from "./api";
import type {
  CreateProjectInput,
  CreateSiteInput,
  Project,
  Result,
  Site,
  UpdateSiteInput,
} from "@/types/domain";
import { err, ok } from "@/types/domain";
import { ENGINE_VERSION, LOCAL_OWNER_ID } from "@/lib/config/env";
import { getRepositories } from "@/lib/repositories";
import type { RepositoryBundle } from "@/lib/repositories/types";
import * as projectService from "@/lib/app/services/projects";
import * as siteService from "@/lib/app/services/sites";
import type { CreateSiteResult } from "@/lib/app/services/sites";

export class LocalApiClient implements ApiClient {
  /**
   * Resolved lazily rather than in a constructor: IndexedDB only exists in the
   * browser, and Next.js constructs modules during server rendering.
   */
  private readonly resolve: () => RepositoryBundle;

  constructor(repositories?: RepositoryBundle) {
    this.resolve = repositories ? () => repositories : getRepositories;
  }

  async health(): Promise<Result<HealthStatus>> {
    try {
      const repositories = this.resolve();
      const projects = await repositories.projects.listByOwner(LOCAL_OWNER_ID);
      let siteCount = 0;
      for (const project of projects) {
        siteCount += await repositories.sites.countByProject(project.id);
      }
      return ok({
        ok: true,
        driver: repositories.driver,
        engine_version: ENGINE_VERSION,
        project_count: projects.length,
        site_count: siteCount,
      });
    } catch (cause) {
      return err("STORAGE_UNAVAILABLE", cause instanceof Error ? cause.message : String(cause));
    }
  }

  createProject(input: CreateProjectInput): Promise<Result<Project>> {
    return projectService.createProject(this.resolve(), input);
  }

  listProjects(): Promise<Result<Project[]>> {
    return projectService.listProjects(this.resolve());
  }

  getProject(id: string): Promise<Result<Project>> {
    return projectService.getProject(this.resolve(), id);
  }

  deleteProject(id: string): Promise<Result<{ deleted_sites: number }>> {
    return projectService.deleteProject(this.resolve(), id);
  }

  createSite(input: CreateSiteInput): Promise<Result<CreateSiteResult>> {
    return siteService.createSite(this.resolve(), input);
  }

  listSites(projectId: string): Promise<Result<Site[]>> {
    return siteService.listSites(this.resolve(), projectId);
  }

  getSite(id: string): Promise<Result<Site>> {
    return siteService.getSite(this.resolve(), id);
  }

  updateSite(id: string, patch: UpdateSiteInput): Promise<Result<Site>> {
    return siteService.updateSite(this.resolve(), id, patch);
  }

  deleteSite(id: string): Promise<Result<{ id: string }>> {
    return siteService.deleteSite(this.resolve(), id);
  }
}
