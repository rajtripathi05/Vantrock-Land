import { describe, expect, it } from "vitest";
import {
  acresToSqm,
  formatArea,
  formatDistance,
  formatInr,
  metresToFeet,
  SQM_PER_ACRE,
  sqftToSqm,
  sqmToAcres,
  sqmToGuntha,
  sqmToHectares,
  sqmToSqft,
} from "@/lib/geo/units";

describe("unit constants", () => {
  it("uses the exact international acre", () => {
    expect(SQM_PER_ACRE).toBe(4046.8564224);
  });

  it("uses the Maharashtra guntha of 1/40 acre", () => {
    expect(sqmToGuntha(SQM_PER_ACRE)).toBeCloseTo(40, 9);
  });
});

describe("conversions", () => {
  it("round-trips acres", () => {
    expect(sqmToAcres(acresToSqm(25))).toBeCloseTo(25, 9);
  });

  it("round-trips square feet", () => {
    expect(sqmToSqft(sqftToSqm(500_000))).toBeCloseTo(500_000, 6);
  });

  it("converts a 25-acre site to the expected square footage", () => {
    // 25 acres = 1,089,000 sq ft exactly.
    expect(sqmToSqft(acresToSqm(25))).toBeCloseTo(1_089_000, 3);
  });

  it("converts hectares", () => {
    expect(sqmToHectares(10_000)).toBe(1);
  });

  it("converts metres to feet", () => {
    expect(metresToFeet(0.3048)).toBeCloseTo(1, 9);
  });
});

describe("formatting", () => {
  it("formats area in the requested unit", () => {
    const sqm = acresToSqm(25);
    expect(formatArea(sqm, "acres")).toBe("25.00 ac");
    expect(formatArea(sqm, "sqft")).toContain("sq ft");
    expect(formatArea(sqm, "guntha")).toContain("guntha");
  });

  it("switches distance to kilometres above 1 km", () => {
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(1_850)).toBe("1.85 km");
  });

  it("uses Indian crore and lakh shorthand", () => {
    expect(formatInr(32_000_000)).toBe("₹3.20 Cr");
    expect(formatInr(250_000)).toBe("₹2.50 L");
    expect(formatInr(4_500)).toBe("₹4,500");
  });
});
