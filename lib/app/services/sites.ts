/**
 * Site business logic — validate, normalize, measure, persist.
 *
 * This is where the geometry pipeline from the blueprint (section D3) is
 * enforced:
 *
 *   input geometry
 *     -> structural validation      (validateInputGeometry)
 *     -> normalization              (normalizeToMultiPolygon)
 *     -> measurement-bound checks   (validateStoredGeometry)
 *     -> measurement, computed ONCE (measureGeometry)
 *     -> persistence
 *
 * Measurements are written alongside geometry so nothing downstream ever
 * recomputes them. When PostGIS takes over, the measure step becomes generated
 * columns and this function stops computing but keeps the same shape.
 */

import { z } from "zod";
import {
  err,
  ok,
  type CreateSiteInput,
  type Result,
  type Site,
  type SiteSourceType,
  type UpdateSiteInput,
} from "@/types/domain";
import type { GeometryIssue } from "@/lib/geo/validate";
import { validateInputGeometry, validateStoredGeometry } from "@/lib/geo/validate";
import { DEFAULT_POINT_BUFFER_RADIUS_M, normalizeToMultiPolygon } from "@/lib/geo/normalize";
import { measureGeometry } from "@/lib/geo/measure";
import type { RepositoryBundle } from "@/lib/repositories/types";

export interface CreateSiteResult {
  site: Site;
  /** Non-blocking issues the analyst should still see (holes, multipart). */
  warnings: GeometryIssue[];
}

const createSiteSchema = z.object({
  project_id: z.string().min(1, "A project id is required."),
  name: z
    .string()
    .trim()
    .min(1, "A site name is required.")
    .max(120, "Site names are limited to 120 characters."),
  source_type: z.enum(["drawn_polygon", "drawn_rectangle", "point_buffer"]),
  buffer_radius_m: z
    .number()
    .finite()
    .min(10, "Buffer radius must be at least 10 m.")
    .max(5_000, "Buffer radius must be at most 5,000 m.")
    .optional(),
  land_price_per_acre_inr: z.number().finite().positive().nullish(),
  notes: z.string().trim().max(2_000).nullish(),
});

/**
 * Suggest the next candidate site name.
 *
 * Domain language, not "Shape 1". Analysts talk about Candidate Site A, B, C,
 * and the comparison screen reads far better for it.
 */
export function suggestSiteName(existingCount: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const letter = alphabet[existingCount % 26] ?? "X";
  const cycle = Math.floor(existingCount / 26);
  return cycle === 0 ? `Candidate Site ${letter}` : `Candidate Site ${letter}${cycle + 1}`;
}

export async function createSite(
  repositories: RepositoryBundle,
  input: CreateSiteInput,
): Promise<Result<CreateSiteResult>> {
  const parsed = createSiteSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid site.", {
      issues: parsed.error.issues,
    });
  }

  const project = await repositories.projects.findById(parsed.data.project_id).catch(() => null);
  if (!project) {
    return err("NOT_FOUND", `No project with id ${parsed.data.project_id}.`);
  }

  // 1. Structural validation of the raw drawing.
  const inputValidation = validateInputGeometry(input.geometry);
  if (!inputValidation.valid) {
    const first = inputValidation.errors[0]!;
    return err("GEOMETRY_INVALID", first.message, {
      code: first.code,
      errors: inputValidation.errors,
    });
  }

  // 2. Normalize to canonical MultiPolygon (buffering a Point if needed).
  const radius = parsed.data.buffer_radius_m ?? DEFAULT_POINT_BUFFER_RADIUS_M;
  const normalized = normalizeToMultiPolygon(input.geometry, { bufferRadiusMetres: radius });

  // A Point must be declared as point_buffer, and vice versa. Catching the
  // mismatch here keeps source_type trustworthy for every downstream consumer.
  const derivedSourceType: SiteSourceType | null =
    input.geometry.type === "Point" ? "point_buffer" : null;
  if (derivedSourceType && parsed.data.source_type !== derivedSourceType) {
    return err(
      "VALIDATION_FAILED",
      `Point geometry must be saved with source_type "point_buffer", not "${parsed.data.source_type}".`,
    );
  }
  if (!derivedSourceType && parsed.data.source_type === "point_buffer") {
    return err(
      "VALIDATION_FAILED",
      'source_type "point_buffer" requires Point geometry.',
    );
  }

  // 3. Bounds that can only be checked once the shape has an area.
  const storedValidation = validateStoredGeometry(normalized.geometry);
  if (!storedValidation.valid) {
    const first = storedValidation.errors[0]!;
    const code =
      first.code === "AREA_TOO_SMALL" || first.code === "AREA_TOO_LARGE"
        ? "AREA_OUT_OF_BOUNDS"
        : first.code === "TOO_MANY_VERTICES"
          ? "VERTEX_COUNT_OUT_OF_BOUNDS"
          : "GEOMETRY_INVALID";
    return err(code, first.message, { code: first.code, errors: storedValidation.errors });
  }

  // 4. Measure exactly once. MIGRATION: generated columns in Postgres.
  const measurements = measureGeometry(normalized.geometry);

  const now = new Date().toISOString();
  const site: Site = {
    id: crypto.randomUUID(),
    project_id: parsed.data.project_id,
    name: parsed.data.name,
    source_type: parsed.data.source_type,
    geometry: normalized.geometry,
    point_origin: normalized.pointOrigin
      ? { type: "Point", coordinates: normalized.pointOrigin }
      : null,
    buffer_radius_m: normalized.bufferRadiusMetres,
    measurements,
    land_price_per_acre_inr: parsed.data.land_price_per_acre_inr ?? null,
    notes: parsed.data.notes ?? null,
    created_at: now,
    updated_at: now,
  };

  try {
    const created = await repositories.sites.create(site);
    return ok({ site: created, warnings: storedValidation.warnings });
  } catch (cause) {
    return err("STORAGE_UNAVAILABLE", storageMessage(cause));
  }
}

export async function getSite(
  repositories: RepositoryBundle,
  id: string,
): Promise<Result<Site>> {
  try {
    const site = await repositories.sites.findById(id);
    if (!site) return err("NOT_FOUND", `No site with id ${id}.`);
    return ok(site);
  } catch (cause) {
    return err("STORAGE_UNAVAILABLE", storageMessage(cause));
  }
}

export async function listSites(
  repositories: RepositoryBundle,
  projectId: string,
): Promise<Result<Site[]>> {
  try {
    return ok(await repositories.sites.listByProject(projectId));
  } catch (cause) {
    return err("STORAGE_UNAVAILABLE", storageMessage(cause));
  }
}

const updateSiteSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  land_price_per_acre_inr: z.number().finite().positive().nullish(),
  notes: z.string().trim().max(2_000).nullish(),
});

/**
 * Update site attributes.
 *
 * Deliberately cannot change geometry. Editing a boundary means re-measuring
 * and, later, invalidating analysis runs — that is its own slice with its own
 * rules. Allowing a geometry patch through this path would let the stored area
 * drift away from the stored boundary.
 */
export async function updateSite(
  repositories: RepositoryBundle,
  id: string,
  patch: UpdateSiteInput,
): Promise<Result<Site>> {
  const parsed = updateSiteSchema.safeParse(patch);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid update.", {
      issues: parsed.error.issues,
    });
  }

  try {
    const updated = await repositories.sites.update(id, parsed.data);
    if (!updated) return err("NOT_FOUND", `No site with id ${id}.`);
    return ok(updated);
  } catch (cause) {
    return err("STORAGE_UNAVAILABLE", storageMessage(cause));
  }
}

export async function deleteSite(
  repositories: RepositoryBundle,
  id: string,
): Promise<Result<{ id: string }>> {
  try {
    const deleted = await repositories.sites.delete(id);
    if (!deleted) return err("NOT_FOUND", `No site with id ${id}.`);
    return ok({ id });
  } catch (cause) {
    return err("STORAGE_UNAVAILABLE", storageMessage(cause));
  }
}

function storageMessage(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return `Local storage is unavailable: ${detail}`;
}
