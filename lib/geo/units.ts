/**
 * Unit conversion — the only place numbers change units.
 *
 * SI is canonical everywhere internally: metres, square metres, seconds,
 * rupees. Indian land is transacted in acres and guntha, buildings in square
 * feet, so conversion happens at the presentation edge and nowhere else.
 *
 * No React component performs arithmetic on a stored value. It calls a
 * formatter here.
 *
 * PURE MODULE: no I/O, no framework, no storage.
 */

/** Exact by international definition. */
export const SQM_PER_ACRE = 4046.8564224;
export const SQM_PER_SQFT = 0.09290304;
export const SQM_PER_HECTARE = 10_000;
/** Maharashtra land unit. 1 acre = 40 guntha exactly. */
export const SQM_PER_GUNTHA = SQM_PER_ACRE / 40;
export const METRES_PER_FOOT = 0.3048;

export const sqmToAcres = (sqm: number): number => sqm / SQM_PER_ACRE;
export const acresToSqm = (acres: number): number => acres * SQM_PER_ACRE;
export const sqmToSqft = (sqm: number): number => sqm / SQM_PER_SQFT;
export const sqftToSqm = (sqft: number): number => sqft * SQM_PER_SQFT;
export const sqmToHectares = (sqm: number): number => sqm / SQM_PER_HECTARE;
export const sqmToGuntha = (sqm: number): number => sqm / SQM_PER_GUNTHA;
export const metresToFeet = (m: number): number => m / METRES_PER_FOOT;

/** Indian digit grouping (lakh / crore), which is what the audience reads. */
export function formatIndianNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatArea(
  sqm: number,
  unit: "acres" | "sqft" | "sqm" | "hectares" | "guntha",
): string {
  switch (unit) {
    case "acres":
      return `${formatIndianNumber(sqmToAcres(sqm), 2)} ac`;
    case "sqft":
      return `${formatIndianNumber(sqmToSqft(sqm), 0)} sq ft`;
    case "hectares":
      return `${formatIndianNumber(sqmToHectares(sqm), 2)} ha`;
    case "guntha":
      return `${formatIndianNumber(sqmToGuntha(sqm), 1)} guntha`;
    case "sqm":
    default:
      return `${formatIndianNumber(sqm, 0)} m²`;
  }
}

export function formatDistance(metres: number): string {
  if (metres >= 1000) return `${formatIndianNumber(metres / 1000, 2)} km`;
  return `${formatIndianNumber(metres, 0)} m`;
}

/** Six decimal places ≈ 0.11 m — the practical limit of hand-drawn boundaries. */
export function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

export function formatLatLon(lon: number, lat: number): string {
  const latHemisphere = lat >= 0 ? "N" : "S";
  const lonHemisphere = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}° ${latHemisphere}, ${Math.abs(lon).toFixed(5)}° ${lonHemisphere}`;
}

/** Indian currency shorthand. Crore above 1e7, lakh above 1e5. */
export function formatInr(value: number): string {
  if (Math.abs(value) >= 1e7) return `₹${formatIndianNumber(value / 1e7, 2)} Cr`;
  if (Math.abs(value) >= 1e5) return `₹${formatIndianNumber(value / 1e5, 2)} L`;
  return `₹${formatIndianNumber(value, 0)}`;
}
