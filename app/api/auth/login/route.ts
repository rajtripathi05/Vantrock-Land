import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  timingSafeEqual,
} from "@/lib/auth/session";

const bodySchema = z.object({ password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const password = process.env.DEMO_ACCESS_PASSWORD;
  if (!password) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "NOT_CONFIGURED",
          message: "Demo access is not configured on this deployment.",
        },
      },
      { status: 503 },
    );
  }

  // Best-effort client identifier for rate limiting — no auth cookie exists
  // yet at this point, so IP (or "unknown" behind a proxy that strips it) is
  // the only signal available. See lib/auth/rateLimit.ts for its limits.
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rate = checkRateLimit(clientKey);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: `Too many attempts. Try again in ${rate.retryAfterSeconds}s.`,
        },
      },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_FAILED", message: "Password is required." } },
      { status: 400 },
    );
  }

  // Never log parsed.data.password, the configured password, or any part of
  // either — a rejected attempt or a thrown error must not leak either value.
  if (!timingSafeEqual(parsed.data.password, password)) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_PASSWORD", message: "Incorrect password." } },
      { status: 401 },
    );
  }

  const token = await createSessionToken(password);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
