import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Demo access gate. Runs on every request except static assets, the login
 * page itself, and the login/logout API routes (which must stay reachable to
 * authenticate in the first place).
 *
 * DEMO_ACCESS_PASSWORD unset => gate is a no-op (local dev with zero config
 * still works, matching this repo's "runs with zero configuration" rule).
 * Setting it in any deployed environment turns the gate on.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|api/auth/login|api/auth/logout).*)",
  ],
};

export async function middleware(request: NextRequest) {
  const password = process.env.DEMO_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = await verifySessionToken(token, password);
  if (valid) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Login required." } },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
