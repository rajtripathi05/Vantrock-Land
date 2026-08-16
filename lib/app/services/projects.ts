/**
 * Project business logic.
 *
 * Transport-agnostic and storage-agnostic: it receives a RepositoryBundle and
 * returns Result envelopes. Today it runs in the browser behind LocalApiClient.
 * When Supabase lands, this exact module runs inside a Next.js route handler
 * with a Supabase-backed bundle, unchanged.
 */

import { z } from "zod";
import {
  err,
  ok,
  type CreateProjectInput,
  type Project,
  type Result,
} from "@/types/domain";
import { LOCAL_OWNER_ID } from "@/lib/config/env";
import { utmSridFor } from "@/lib/geo/ellipsoid";
import type { RepositoryBundle } from "@/lib/repositories/types";

/**
 * Default map centre: Chakan, the initial MVP submarket.
 *
 * Used to seed the project's working SRID. Geography is a DEFAULT, never a
 * hardcoded assumption — utmSridFor derives the zone, so a project centred
 * anywhere on Earth gets the correct one (blueprint rule 20).
 */
export const DEFAULT_MAP_CENTRE: [number, number] = [73.8567, 18.7606];
export const DEFAULT_MAP_ZOOM = 11;

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "A project name is required.")
    .max(120, "Project names are limited to 120 characters."),
  asset_class: z.enum(["grade_a_logistics", "warehouse", "industrial_land"]),
  target_gfa_sqft: z
    .number()
    .finite("Target GFA must be a number.")
    .min(1_000, "Target GFA must be at least 1,000 sq ft.")
    .max(10_000_000, "Target GFA must be at most 10,000,000 sq ft."),
  region_label: z.string().trim().max(120).nullish(),
});

export async function createProject(
  repositories: RepositoryBundle,
  input: CreateProjectInput,
): Promise<Result<Project>> {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid project.", {
      issues: parsed.error.issues,
    });
  }

  const now = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    owner_id: LOCAL_OWNER_ID,
    name: parsed.data.name,
    asset_class: parsed.data.asset_class,
    target_gfa_sqft: parsed.data.target_gfa_sqft,
    region_label: parsed.data.region_label ?? null,
    working_srid: utmSridFor(DEFAULT_MAP_CENTRE),
    created_at: now,
    updated_at: now,
  };

  try {
    return ok(await repositories.projects.create(project));
  } catch (cause) {
    return err("STORAGE_UNAVAILABLE", storageMessage(cause));
  }
}

export async function getProject(
  repositories: RepositoryBundle,
  id: string,
): Promise<Result<Project>> {
  try {
    const project = await repositories.projects.findById(id);
    if (!project) return err("NOT_FOUND", `No project with id ${id}.`);
    return ok(project);
  } catch (cause) {
    return err("STORAGE_UNAVAILABLE", storageMessage(cause));
  }
}

export async function listProjects(
  repositories: RepositoryBundle,
): Promise<Result<Project[]>> {
  try {
    return ok(await repositories.projects.listByOwner(LOCAL_OWNER_ID));
  } catch (cause) {
    return err("STORAGE_UNAVAILABLE", storageMessage(cause));
  }
}

export async function deleteProject(
  repositories: RepositoryBundle,
  id: string,
): Promise<Result<{ deleted_sites: number }>> {
  try {
    const project = await repositories.projects.findById(id);
    if (!project) return err("NOT_FOUND", `No project with id ${id}.`);

    // Explicit cascade. Postgres does this with ON DELETE CASCADE; IndexedDB
    // has no referential integrity, so the service owns it. Sites are removed
    // first so a failure cannot leave orphaned sites pointing at a project
    // that no longer exists.
    const deletedSites = await repositories.sites.deleteByProject(id);
    await repositories.projects.delete(id);
    return ok({ deleted_sites: deletedSites });
  } catch (cause) {
    return err("STORAGE_UNAVAILABLE", storageMessage(cause));
  }
}

function storageMessage(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return `Local storage is unavailable: ${detail}`;
}
