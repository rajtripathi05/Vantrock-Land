/**
 * Draft geometry preview.
 *
 * The map needs to show live area and perimeter for a boundary that has not
 * been saved yet. That is still a geometry calculation, so it must not happen
 * inside a React component — this function is the one entry point, and it uses
 * exactly the same normalize → validate → measure pipeline that createSite
 * uses at write time.
 *
 * Sharing the pipeline is the point: the number an analyst sees while drawing
 * is the number that gets stored, and a boundary that previews as valid cannot
 * then be rejected on save.
 */

import type { InputGeometry } from "@/types/geojson";
import type { SiteMeasurements } from "@/types/domain";
import type { GeometryIssue } from "@/lib/geo/validate";
import { validateInputGeometry, validateStoredGeometry } from "@/lib/geo/validate";
import { DEFAULT_POINT_BUFFER_RADIUS_M, normalizeToMultiPolygon } from "@/lib/geo/normalize";
import { measureGeometry } from "@/lib/geo/measure";

export interface GeometryPreview {
  valid: boolean;
  /** Populated only when valid. */
  measurements: SiteMeasurements | null;
  errors: GeometryIssue[];
  warnings: GeometryIssue[];
  /** True when the input was a Point and has been buffered to a boundary. */
  buffered: boolean;
}

export function previewGeometry(
  geometry: InputGeometry,
  bufferRadiusMetres: number = DEFAULT_POINT_BUFFER_RADIUS_M,
): GeometryPreview {
  const structural = validateInputGeometry(geometry);
  if (!structural.valid) {
    return {
      valid: false,
      measurements: null,
      errors: structural.errors,
      warnings: structural.warnings,
      buffered: false,
    };
  }

  const normalized = normalizeToMultiPolygon(geometry, {
    bufferRadiusMetres,
  });
  const bounds = validateStoredGeometry(normalized.geometry);

  return {
    valid: bounds.valid,
    measurements: bounds.valid ? measureGeometry(normalized.geometry) : null,
    errors: bounds.errors,
    warnings: bounds.warnings,
    buffered: normalized.pointOrigin !== null,
  };
}
