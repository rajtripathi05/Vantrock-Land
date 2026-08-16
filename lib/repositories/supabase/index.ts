/**
 * Supabase (Postgres + PostGIS) implementations of the repository interfaces.
 *
 * Same contract as lib/repositories/indexeddb — persist, read back, sort. No
 * validation, no measurement, no derivation (that stays in lib/app/services).
 * Every method's MIGRATION comment in lib/repositories/types.ts is the SQL
 * this file actually runs, via PostgREST through supabase-js.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project, Site } from "@/types/domain";
import type { ProjectRepository, RepositoryBundle, SiteRepository } from "../types";
import { getSupabaseClient } from "./client";
import {
  type ProjectRow,
  type SiteRow,
  projectToRow,
  rowToProject,
  rowToSite,
  siteToWriteRow,
} from "./mappers";

const SITE_SELECT = "*, geom_geojson, point_origin_geojson" as const;

function throwOnError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`Supabase ${context} failed: ${error.message}`);
}

class SupabaseProjectRepository implements ProjectRepository {
  constructor(private readonly db: SupabaseClient) {}

  async create(project: Project): Promise<Project> {
    const { data, error } = await this.db
      .from("projects")
      .insert(projectToRow(project))
      .select()
      .single();
    throwOnError(error, "projects.create");
    return rowToProject(data as ProjectRow);
  }

  async findById(id: string): Promise<Project | null> {
    const { data, error } = await this.db.from("projects").select().eq("id", id).maybeSingle();
    throwOnError(error, "projects.findById");
    return data ? rowToProject(data as ProjectRow) : null;
  }

  async listByOwner(ownerId: string): Promise<Project[]> {
    const { data, error } = await this.db
      .from("projects")
      .select()
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });
    throwOnError(error, "projects.listByOwner");
    return (data as ProjectRow[]).map(rowToProject);
  }

  async update(id: string, patch: Partial<Project>): Promise<Project | null> {
    const { id: _id, owner_id: _ownerId, ...rest } = patch;
    const { data, error } = await this.db
      .from("projects")
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();
    throwOnError(error, "projects.update");
    return data ? rowToProject(data as ProjectRow) : null;
  }

  async delete(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("projects").delete().eq("id", id).select();
    throwOnError(error, "projects.delete");
    return (data as unknown[]).length > 0;
  }
}

class SupabaseSiteRepository implements SiteRepository {
  constructor(private readonly db: SupabaseClient) {}

  async create(site: Site): Promise<Site> {
    const { data, error } = await this.db
      .from("sites")
      .insert(siteToWriteRow(site))
      .select(SITE_SELECT)
      .single();
    throwOnError(error, "sites.create");
    return rowToSite(data as unknown as SiteRow);
  }

  async findById(id: string): Promise<Site | null> {
    const { data, error } = await this.db
      .from("sites")
      .select(SITE_SELECT)
      .eq("id", id)
      .maybeSingle();
    throwOnError(error, "sites.findById");
    return data ? rowToSite(data as unknown as SiteRow) : null;
  }

  async listByProject(projectId: string): Promise<Site[]> {
    const { data, error } = await this.db
      .from("sites")
      .select(SITE_SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    throwOnError(error, "sites.listByProject");
    return (data as unknown as SiteRow[]).map(rowToSite);
  }

  async update(id: string, patch: Partial<Site>): Promise<Site | null> {
    const { id: _id, project_id: _projectId, ...rest } = patch;
    const writePatch: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
    if (rest.geometry) {
      writePatch.geom = JSON.stringify(rest.geometry);
      delete writePatch.geometry;
    }
    if ("point_origin" in rest) {
      writePatch.point_origin = rest.point_origin ? JSON.stringify(rest.point_origin) : null;
      delete writePatch.point_origin;
    }
    const { data, error } = await this.db
      .from("sites")
      .update(writePatch)
      .eq("id", id)
      .select(SITE_SELECT)
      .maybeSingle();
    throwOnError(error, "sites.update");
    return data ? rowToSite(data as unknown as SiteRow) : null;
  }

  async delete(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("sites").delete().eq("id", id).select();
    throwOnError(error, "sites.delete");
    return (data as unknown[]).length > 0;
  }

  async deleteByProject(projectId: string): Promise<number> {
    const { data, error } = await this.db.from("sites").delete().eq("project_id", projectId).select();
    throwOnError(error, "sites.deleteByProject");
    return (data as unknown[]).length;
  }

  async countByProject(projectId: string): Promise<number> {
    const { count, error } = await this.db
      .from("sites")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    throwOnError(error, "sites.countByProject");
    return count ?? 0;
  }
}

export function createSupabaseRepositories(client?: SupabaseClient): RepositoryBundle {
  const db = client ?? getSupabaseClient();
  return {
    projects: new SupabaseProjectRepository(db),
    sites: new SupabaseSiteRepository(db),
    driver: "supabase",
  };
}
