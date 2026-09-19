import { getDb } from "@/server/db";
import { verifyPassword } from "@/server/passwords";
import { createSession } from "@/server/sessions";
import { isEmail } from "@/server/validation";
import { logEvent } from "@/server/activity";
import { track } from "@/server/analytics";
import {
  getEntitlements,
} from "@/server/entitlements";
import {
  ok,
  fail,
  assertSameOrigin,
  guardRate,
  readJson,
  serverError,
} from "@/server/api";

interface LoginRow {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: string | null;
  email_verified_at: string | null;
  password_hash: string;
}

export async function POST(req: Request) {
  const limited = await guardRate(req, "login", 10, 5 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const body = await readJson<{ email?: string; password?: string }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!isEmail(email) || !password) return fail("Enter your email and password.");

  try {
    const db = await getDb();
    const row = (await db
      .prepare(
        `SELECT id, email, name, role, status, email_verified_at, password_hash
         FROM users WHERE email = ?`
      )
      .get(email)) as LoginRow | undefined;

    // One generic message for unknown email and wrong password: the endpoint
    // must not reveal whether an account exists.
    const badCreds = fail("Email or password is incorrect.", "UNAUTHORIZED");
    if (!row) return badCreds;
    if (!(await verifyPassword(password, row.password_hash))) return badCreds;

    if (row.status === "suspended") {
      await logEvent(row.id, "signin_blocked", "Sign-in blocked — account suspended");
      return fail(
        "This account is suspended. Contact the studio team if you think this is a mistake.",
        "FORBIDDEN"
      );
    }

    await createSession(row.id, req);
    await logEvent(row.id, "signin", "Signed in");
    track("login", { userId: row.id });

    const entitlements = await getEntitlements(row.id);
    return ok({
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        emailVerified: !!row.email_verified_at,
        plan: entitlements.planId,
      },
    });
  } catch (err) {
    return serverError("login", err);
  }
}
