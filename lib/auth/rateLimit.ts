/**
 * Best-effort in-memory brute-force protection for the demo login endpoint.
 *
 * KNOWN LIMITATION: this is per-process memory, not a shared store. On a
 * single long-running server it works as intended; on a serverless platform
 * (Netlify Functions) where each invocation can land on a different
 * container, the counter can reset. Documented in docs/SECURITY.md — for a
 * single-shared-password demo gate this is judged an acceptable gap, not a
 * silent one. A production multi-tenant auth system would need a shared
 * store (e.g. Supabase table) instead.
 */

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 8;

interface Bucket {
  count: number;
  windowStart: number;
}

const attempts = new Map<string, Bucket>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = attempts.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test-only: clear all rate-limit state between test cases. */
export function resetRateLimitForTests(): void {
  attempts.clear();
}
