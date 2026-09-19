import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast-path protection for authenticated areas.
 *
 * This only checks whether a session cookie is *present* — it cannot validate
 * the token because middleware runs before (and separately from) the Node
 * runtime that owns the database. It exists to turn "you're not signed in yet"
 * into a clean 307 redirect to /login instead of a streamed client-side
 * redirect.
 *
 * In Firebase mode the Firebase SDK may deliver the ID token slightly after
 * first paint; such requests may legitimately carry an Authorization header
 * instead of the app cookie, and are passed through for the page's own
 * server-side verification (which is the real security boundary).
 *
 * The security boundary is elsewhere and unaffected by this file: every
 * protected page re-reads the session row / verifies the Firebase token, and
 * every API route re-checks ownership. A forged or expired cookie gets past
 * this middleware and is then rejected exactly as before.
 */

const SESSION_COOKIE = "zenframe_session";

export function middleware(req: NextRequest) {
  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  // Firebase mode: allow a Bearer-token request through to the page's own
  // verification instead of bouncing it to /login prematurely.
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return NextResponse.next();

  const url = req.nextUrl.clone();
  const target = `${url.pathname}${url.search}`;
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(target)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/dashboard",
    "/settings/:path*",
    "/settings",
    "/admin/:path*",
    "/admin",
    "/creations/:path*",
  ],
};
