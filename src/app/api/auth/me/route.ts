import { getCurrentUser } from "@/server/sessions";
import { getEntitlements } from "@/server/entitlements";
import { getDb } from "@/server/db";
import { getSettings } from "@/server/frame-catalog";
import { ok, serverError } from "@/server/api";

/** GET /api/auth/me — the client's only source of auth state (no token in JS). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return ok({ user: null });

    const db = await getDb();
    const profile = (await db
      .prepare("SELECT bio, avatar_url FROM profiles WHERE user_id = ?")
      .get(user.id)) as { bio: string; avatar_url: string | null } | undefined;

    const entitlements = await getEntitlements(user.id);
    const settings = await getSettings();

    return ok({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        emailVerified: Boolean(user.email_verified_at),
        emailVerifiedAt: user.email_verified_at,
        createdAt: user.created_at,
        plan: entitlements.planId,
        avatarUrl: profile?.avatar_url ?? null,
        siteTagline: settings.hero_tagline,
      },
    });
  } catch (err) {
    return serverError("me", err);
  }
}
