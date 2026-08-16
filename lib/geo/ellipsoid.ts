/**
 * WGS84 ellipsoid primitives.
 *
 * Everything Vantrock measures is measured on the WGS84 ellipsoid, because
 * that is what PostGIS `geography` uses. Using a sphere here (the common
 * shortcut, and what most JS geo libraries do) would put us ~0.3% away from
 * the production engine at Pune's latitude — about 3,400 sq ft on a 25-acre
 * site. That is exactly the kind of quiet disagreement this module exists to
 * prevent.
 *
 * PURE MODULE: no I/O, no framework, no storage. Fully unit-testable.
 */

import type { Position } from "@/types/geojson";

/** Semi-major axis, metres. */
export const WGS84_A = 6378137.0;
/** Flattening. */
export const WGS84_F = 1 / 298.257223563;
/** Semi-minor axis, metres. */
export const WGS84_B = WGS84_A * (1 - WGS84_F);
/** First eccentricity squared. */
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);

export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * Radii of curvature at a given latitude.
 *
 * `meridional` (M) governs north-south distance, `normal` (N) governs
 * east-west. Using the correct pair at the working latitude is what makes the
 * local projection in measure.ts agree with PostGIS.
 */
export function radiiOfCurvature(latitudeRad: number): { meridional: number; normal: number } {
  const sinLat = Math.sin(latitudeRad);
  const t = 1 - WGS84_E2 * sinLat * sinLat;
  const normal = WGS84_A / Math.sqrt(t);
  const meridional = (WGS84_A * (1 - WGS84_E2)) / (t * Math.sqrt(t));
  return { meridional, normal };
}

// Meridian arc series coefficients, precomputed once.
const E2 = WGS84_E2;
const E4 = E2 * E2;
const E6 = E4 * E2;
const ARC_A0 = 1 - E2 / 4 - (3 * E4) / 64 - (5 * E6) / 256;
const ARC_A2 = (3 / 8) * (E2 + E4 / 4 + (15 * E6) / 128);
const ARC_A4 = (15 / 256) * (E4 + (3 * E6) / 4);
const ARC_A6 = (35 * E6) / 3072;

/**
 * Distance along the meridian from the equator to `latitudeRad`, in metres.
 *
 * Standard series expansion, accurate to sub-millimetre for WGS84. Used to
 * give the local projection a true north-south scale rather than assuming a
 * constant degrees-to-metres factor.
 */
export function meridianArc(latitudeRad: number): number {
  return (
    WGS84_A *
    (ARC_A0 * latitudeRad -
      ARC_A2 * Math.sin(2 * latitudeRad) +
      ARC_A4 * Math.sin(4 * latitudeRad) -
      ARC_A6 * Math.sin(6 * latitudeRad))
  );
}

/**
 * Geodesic distance between two EPSG:4326 positions, in metres.
 *
 * Vincenty's inverse formula on the WGS84 ellipsoid — accurate to ~0.5 mm and
 * the same model PostGIS `ST_Distance(geography)` uses.
 *
 * MIGRATION NOTE: replaced by `ST_Distance(a::geography, b::geography)`.
 *
 * Vincenty fails to converge for near-antipodal points; we fall back to a
 * great-circle distance there. That case cannot arise for a single site
 * boundary, but returning NaN silently would be worse than a documented
 * approximation.
 */
export function geodesicDistance(from: Position, to: Position): number {
  const [lon1, lat1] = from;
  const [lon2, lat2] = to;

  if (lon1 === lon2 && lat1 === lat2) return 0;

  const L = toRadians(lon2 - lon1);
  const U1 = Math.atan((1 - WGS84_F) * Math.tan(toRadians(lat1)));
  const U2 = Math.atan((1 - WGS84_F) * Math.tan(toRadians(lat2)));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let cosSqAlpha = 0;
  let cos2SigmaM = 0;
  let converged = false;

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);

    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2,
    );
    if (sinSigma === 0) return 0; // coincident

    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);

    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;

    const C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    const previousLambda = lambda;
    lambda =
      L +
      (1 - C) *
        WGS84_F *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));

    if (Math.abs(lambda - previousLambda) < 1e-12) {
      converged = true;
      break;
    }
  }

  if (!converged) return greatCircleDistance(from, to);

  const uSq = (cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B)) / (WGS84_B * WGS84_B);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma * sinSigma) *
            (-3 + 4 * cos2SigmaM * cos2SigmaM)));

  return WGS84_B * A * (sigma - deltaSigma);
}

/** Spherical fallback for the near-antipodal case Vincenty cannot resolve. */
function greatCircleDistance(from: Position, to: Position): number {
  const R = 6371008.8;
  const phi1 = toRadians(from[1]);
  const phi2 = toRadians(to[1]);
  const dPhi = phi2 - phi1;
  const dLambda = toRadians(to[0] - from[0]);
  const a =
    Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Destination point given a start, an initial bearing (degrees), and a
 * distance (metres). Vincenty's direct formula.
 *
 * Used to generate geodesic circles when an analyst drops a point rather than
 * drawing a boundary.
 *
 * MIGRATION NOTE: replaced by
 * `ST_Buffer(pt::geography, radius)` — or by projecting to the working UTM
 * SRID, buffering, and projecting back.
 */
export function destinationPoint(
  origin: Position,
  bearingDegrees: number,
  distanceMetres: number,
): Position {
  const [lon1, lat1] = origin;
  const alpha1 = toRadians(bearingDegrees);
  const sinAlpha1 = Math.sin(alpha1);
  const cosAlpha1 = Math.cos(alpha1);

  const tanU1 = (1 - WGS84_F) * Math.tan(toRadians(lat1));
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;

  const sigma1 = Math.atan2(tanU1, cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cosSqAlpha = 1 - sinAlpha * sinAlpha;
  const uSq = (cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B)) / (WGS84_B * WGS84_B);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

  let sigma = distanceMetres / (WGS84_B * A);
  let sinSigma = 0;
  let cosSigma = 0;
  let cos2SigmaM = 0;

  for (let iteration = 0; iteration < 200; iteration += 1) {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    const deltaSigma =
      B *
      sinSigma *
      (cos2SigmaM +
        (B / 4) *
          (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
            (B / 6) *
              cos2SigmaM *
              (-3 + 4 * sinSigma * sinSigma) *
              (-3 + 4 * cos2SigmaM * cos2SigmaM)));
    const previous = sigma;
    sigma = distanceMetres / (WGS84_B * A) + deltaSigma;
    if (Math.abs(sigma - previous) < 1e-12) break;
  }

  const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
  const lat2 = Math.atan2(
    sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - WGS84_F) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp),
  );
  const lambda = Math.atan2(
    sinSigma * sinAlpha1,
    cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1,
  );
  const C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
  const L =
    lambda -
    (1 - C) *
      WGS84_F *
      sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));

  return [normalizeLongitude(lon1 + toDegrees(L)), toDegrees(lat2)];
}

/** Wrap a longitude into [-180, 180]. */
export function normalizeLongitude(longitude: number): number {
  if (longitude >= -180 && longitude <= 180) return longitude;
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/**
 * UTM SRID for a given position — derived, never hardcoded.
 *
 * Blueprint rule 20: build for one geography first, but do not bake that
 * geography into the architecture. Pune resolves to 32643; the same function
 * gives 32644 for Kolkata and 32756 for Sydney without a code change.
 *
 * Used only for buffer and simplify operations. All measurement is geodesic.
 */
export function utmSridFor(position: Position): number {
  const [longitude, latitude] = position;
  const zone = Math.floor((normalizeLongitude(longitude) + 180) / 6) + 1;
  return (latitude >= 0 ? 32600 : 32700) + zone;
}
