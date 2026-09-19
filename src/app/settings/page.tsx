import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { getCurrentUser, listSessions } from "@/server/sessions";
import { getDb } from "@/server/db";
import { getEntitlements } from "@/server/entitlements";
import { getSettings } from "@/server/frame-catalog";
import { Reveal } from "@/components/Reveal";
import { SettingsProfile } from "@/components/SettingsProfile";
import { SettingsSecurity } from "@/components/SettingsSecurity";

export const metadata = { title: "Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");

  const db = await getDb();
  const profile = (await db
    .prepare("SELECT bio, studio, avatar_url FROM profiles WHERE user_id = ?")
    .get(user.id)) as
    | { bio: string; studio: string | null; avatar_url: string | null }
    | undefined;

  const entitlements = await getEntitlements(user.id);
  const sessions = await listSessions(user.id);
  const site = await getSettings();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft transition hover:text-coral"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to your studio
      </Link>

      <Reveal>
        <div className="mt-6 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-jade to-teal text-white shadow-glass">
            <SettingsIcon className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-4xl font-semibold text-ink">
              Settings &amp; profile
            </h1>
            <p className="text-sm text-ink-soft">
              Your account, your devices and your data — {site.hero_tagline}.
            </p>
          </div>
        </div>
      </Reveal>

      <div className="mt-8 space-y-6">
        <Reveal>
          <SettingsProfile
            initial={{
              name: user.name,
              email: user.email,
              bio: profile?.bio ?? "",
              studio: profile?.studio ?? null,
              avatarUrl: profile?.avatar_url ?? null,
              createdAt: user.created_at,
              emailVerified: Boolean(user.email_verified_at),
            }}
            plan={{
              name: entitlements.plan.name,
              limits: {
                creations: entitlements.plan.limits.creations,
                publicShares: entitlements.plan.limits.publicShares,
              },
              usage: entitlements.usage,
            }}
          />
        </Reveal>

        <Reveal delay={0.08}>
          <SettingsSecurity sessions={sessions} />
        </Reveal>
      </div>
    </div>
  );
}
