import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimitForTests } from "@/lib/auth/rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimitForTests();
  });

  it("allows the first several attempts from one key", () => {
    for (let i = 0; i < 8; i++) {
      expect(checkRateLimit("1.2.3.4").allowed).toBe(true);
    }
  });

  it("blocks after the limit is exceeded within the window", () => {
    for (let i = 0; i < 8; i++) checkRateLimit("1.2.3.4");
    const result = checkRateLimit("1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 8; i++) checkRateLimit("1.2.3.4");
    expect(checkRateLimit("1.2.3.4").allowed).toBe(false);
    expect(checkRateLimit("5.6.7.8").allowed).toBe(true);
  });
});
