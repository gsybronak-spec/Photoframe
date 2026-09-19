/**
 * Shared helpers for route handlers.
 *
 * Every JSON response uses one envelope:
 *   success → { ok: true,  ...payload }
 *   failure → { ok: false, error: "<human readable>", code: "STABLE_CODE" }
 *
 * Errors are deliberately generic. Stack traces, SQL messages, filesystem paths
 * and provider responses are logged server-side and never returned to a client.
 */

import { NextResponse } from "next/server";
import { getCurrentUser, type DbUser } from "./sessions";
import { rateLimit } from "./ratelimit";

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA"
  | "EMAIL_NOT_VERIFIED"
  | "LIMIT_REACHED"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS_FOR: Partial<Record<ErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  EMAIL_NOT_VERIFIED: 403,
  LIMIT_REACHED: 402,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, init);
}

export function fail(
  message: string,
  statusOrCode: number | ErrorCode = 400,
  extra?: Record<string, unknown>
) {
  const code =
    typeof statusOrCode === "number"
      ? (Object.keys(STATUS_FOR).find(
          (k) => STATUS_FOR[k as ErrorCode] === statusOrCode
        ) as ErrorCode | undefined) ?? "BAD_REQUEST"
      : statusOrCode;
  const status =
    typeof statusOrCode === "number" ? statusOrCode : (STATUS_FOR[code] ?? 400);
  return NextResponse.json(
    { ok: false, error: message, code, ...extra },
    { status }
  );
}

/** 500 for unexpected failures — the real cause is logged, never echoed. */
export function serverError(context: string, err: unknown) {
  console.error(`[api] ${context}:`, err instanceof Error ? err.message : err);
  return fail("Something went wrong on our side. Please try again.", "INTERNAL");
}

/**
 * CSRF defense for cookie-authenticated mutations:
 *  1. SameSite=Lax already blocks cross-site form posts.
 *  2. We additionally require that when a browser sends Origin/Sec-Fetch-Site,
 *     it belongs to this host and is not a cross-site request.
 */
export function assertSameOrigin(req: Request): boolean {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients omit it; cookie theft is the real risk
  try {
    const host = req.headers.get("host");
    const parsed = new URL(origin);
    if (!host) return false;
    if (parsed.host !== host) return false;
    // Reject opaque origins such as "null" (sandboxed iframes).
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function requireUser(): Promise<
  { user: DbUser; error?: never } | { user?: never; error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { error: fail("Sign in required", "UNAUTHORIZED") };
  return { user };
}

export async function requireAdmin(): Promise<
  { user: DbUser; error?: never } | { user?: never; error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { error: fail("Sign in required", "UNAUTHORIZED") };
  // Role is read from the database on every request — never from a token claim.
  if (user.role !== "admin") return { error: fail("Forbidden", "FORBIDDEN") };
  return { user };
}

/** Product actions (saving, publishing, uploads) require a verified email. */
export async function requireVerified(): Promise<
  { user: DbUser; error?: never } | { user?: never; error: NextResponse }
> {
  const result = await requireUser();
  if (result.error) return result;
  if (!result.user.email_verified_at) {
    return {
      error: fail(
        "Verify your email address to save and share creations. Check your inbox or resend the link.",
        "EMAIL_NOT_VERIFIED"
      ),
    };
  }
  return { user: result.user };
}

/** Standard rate-limit guard; returns a 429 response when exceeded. */
export async function guardRate(
  req: Request,
  route: string,
  limit: number,
  windowMs: number
): Promise<NextResponse | null> {
  const r = await rateLimit(req, route, limit, windowMs);
  if (r.ok) return null;
  return fail("Too many requests — take a breath and try again shortly.", "RATE_LIMITED", {
    retryAfter: r.retryAfter,
  });
}

/** Parses a JSON body without ever throwing a 500 on malformed input. */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") return null;
    return body as T;
  } catch {
    return null;
  }
}
