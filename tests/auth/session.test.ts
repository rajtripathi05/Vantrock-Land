import { describe, expect, it } from "vitest";
import { createSessionToken, timingSafeEqual, verifySessionToken } from "@/lib/auth/session";

describe("session tokens", () => {
  it("round-trips: a token created with a password verifies against the same password", async () => {
    const token = await createSessionToken("correct-horse");
    expect(await verifySessionToken(token, "correct-horse")).toBe(true);
  });

  it("rejects a token verified against a different password", async () => {
    const token = await createSessionToken("correct-horse");
    expect(await verifySessionToken(token, "wrong-password")).toBe(false);
  });

  it("rejects a missing token", async () => {
    expect(await verifySessionToken(undefined, "correct-horse")).toBe(false);
    expect(await verifySessionToken(null, "correct-horse")).toBe(false);
    expect(await verifySessionToken("", "correct-horse")).toBe(false);
  });

  it("rejects a malformed token", async () => {
    expect(await verifySessionToken("not-a-real-token", "correct-horse")).toBe(false);
    expect(await verifySessionToken("abc.def", "correct-horse")).toBe(false);
  });

  it("rejects an expired token", async () => {
    // Forge an already-expired token in the same signed format rather than
    // waiting 12 hours: sign a past timestamp with the same key derivation.
    const past = Date.now() - 1000;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("correct-horse"),
    );
    const key = await crypto.subtle.importKey(
      "raw",
      digest,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(past)));
    const sigBytes = new Uint8Array(sig);
    let binary = "";
    for (const byte of sigBytes) binary += String.fromCharCode(byte);
    const sigB64 = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const expiredToken = `${past}.${sigB64}`;

    expect(await verifySessionToken(expiredToken, "correct-horse")).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken("correct-horse");
    const [expires] = token.split(".");
    const tampered = `${expires}.tampered-signature`;
    expect(await verifySessionToken(tampered, "correct-horse")).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
