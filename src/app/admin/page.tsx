import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  BookmarkCheck,
  HardDrive,
  Images,
  MailCheck,
  MailWarning,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { getCurrentUser } from "@/server/sessions";
import { cutoffIso, getDb, nowIso } from "@/server/db";
import { activityCount, authActivityCount, systemActivity } from "@/server/activity";
import { emailProviderStatus, recentEmailDeliveries } from "@/server/email";
import { planBreakdown } from "@/server/entitlements";
import { analyticsSummary, analyticsTotal } from "@/server/analytics";
import { getCatalog, getSettings } from "@/server/frame-catalog";
import { Reveal } from "@/components/Reveal";
import { AdminUsersPanel } from "@/components/admin/AdminUsersPanel";
import { AdminFramesPanel } from "@/components/admin/AdminFramesPanel";
import { AdminActivityPanel } from "@/components/admin/AdminActivityPanel";
import { AdminContentPanel } from "@/components/admin/AdminContentPanel";
import { formatBytes } from "@/lib/image-client";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TABS = [
  { id: "overview", label: "Dashboard" },
  { id: "users", label: "Users" },
  { id: "frames", label: "Frames" },
  { id: "activity", label: "Activity" },
  { id: "content", label: "Content" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");

  // Server-side authorization: non-admins never receive admin data.
  if (user.role !== "admin") {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <div className="glass rounded-[2.5rem] p-12">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-coral/15 text-coral">
            <ShieldCheck className="h-8 w-8" aria-hidden />
          </span>
          <h1 className="mt-6 font-display text-3xl font-semibold text-ink">Admins only</h1>
          <p className="mt-3 text-ink-soft">
            This area is reserved for studio keepers. If you believe you should have
            access, contact the team.
          </p>
          <Link
            href="/dashboard"
            className="btn-primary mt-8 inline-block rounded-full px-6 py-3 text-sm font-semibold"
          >
            Back to your studio
          </Link>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const raw = typeof sp.tab === "string" ? sp.tab : "overview";
  const tab: TabId = (TABS.find((t) => t.id === raw)?.id ?? "overview") as TabId;

  const db = await getDb();
  const count = async (
    sql: string,
    ...args: (string | number)[]
  ): Promise<number> => ((await db.prepare(sql).get(...args)) as { n: number }).n;

  const since7 = cutoffIso(7);
  const catalog = await getCatalog();
  const email = emailProviderStatus();
  const plans = await planBreakdown();
  const analytics = await analyticsSummary(30);

  const stats = [
    { icon: Users, label: "Total users", value: await count("SELECT COUNT(*) AS n FROM users") },
    {
      icon: MailCheck,
      label: "Verified users",
      value: await count(
        "SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NOT NULL"
      ),
    },
    {
      icon: Activity,
      label: "Active sessions",
      value: await count("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?", nowIso()),
    },
    { icon: Images, label: "Creations", value: await count("SELECT COUNT(*) AS n FROM creations") },
    {
      icon: HardDrive,
      label: "Storage used",
      value: formatBytes(await count("SELECT COALESCE(SUM(bytes),0) AS n FROM creations")),
    },
  ];

  const growth = [
    { label: "New users · 7d", value: await count("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", since7) },
    { label: "New creations · 7d", value: await count("SELECT COUNT(*) AS n FROM creations WHERE created_at >= ?", since7) },
    {
      label: "Active users · 7d",
      value: await count(
        "SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE last_seen_at >= ?",
        since7
      ),
    },
    {
      label: "Public share links",
      value: await count("SELECT COUNT(*) AS n FROM creations WHERE visibility = 'public'"),
    },
    { icon: BookmarkCheck, label: "Saved frames", value: await count("SELECT COUNT(*) AS n FROM saved_frames") },
  ];

  const recent = await systemActivity(8);
  const deliveries = await recentEmailDeliveries(5);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-gold to-saffron text-white shadow-glass">
              <ShieldCheck className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h1 className="font-display text-3xl font-semibold text-ink">Studio admin</h1>
              <p className="text-sm text-ink-soft">
                Platform operations — {(await getSettings()).hero_tagline}.
              </p>
            </div>
          </div>
          <span
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold ${
              email.ready ? "bg-jade/15 text-jade-deep" : "bg-saffron/15 text-saffron-deep"
            }`}
          >
            {email.ready ? (
              <MailCheck className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <MailWarning className="h-3.5 w-3.5" aria-hidden />
            )}
            Email: {email.provider}
            {email.ready ? "" : " (not configured)"}
          </span>
        </div>
      </Reveal>

      {/* Tabs */}
      <nav aria-label="Admin sections" className="mt-8">
        <ul className="glass flex flex-wrap gap-1 rounded-3xl p-2">
          {TABS.map((t) => (
            <li key={t.id}>
              <Link
                href={t.id === "overview" ? "/admin" : `/admin?tab=${t.id}`}
                aria-current={tab === t.id ? "page" : undefined}
                className={`block rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
                  tab === t.id
                    ? "bg-gradient-to-r from-saffron to-coral text-white shadow-glass"
                    : "text-ink-soft hover:bg-white/70 hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8">
        {tab === "users" && <AdminUsersPanel currentAdminId={user.id} />}
        {tab === "frames" && <AdminFramesPanel />}
        {tab === "activity" && <AdminActivityPanel />}
        {tab === "content" && <AdminContentPanel />}

        {tab === "overview" && (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {stats.map((s, i) => (
                <Reveal key={s.label} delay={i * 0.05}>
                  <div className="glass h-full rounded-3xl p-5 text-center">
                    <s.icon className="mx-auto h-5 w-5 text-teal" aria-hidden />
                    <p className="mt-2 font-display text-2xl font-bold text-ink">{s.value}</p>
                    <p className="text-xs font-medium text-ink-soft">{s.label}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Reveal>
                <div className="glass h-full rounded-3xl p-6">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                    <TrendingUp className="h-4 w-4 text-teal" aria-hidden /> Growth &amp;
                    activity
                  </h2>
                  <dl className="mt-4 space-y-3 text-sm">
                    {growth.map((g) => (
                      <div key={g.label} className="flex items-center justify-between gap-3">
                        <dt className="text-ink-soft">{g.label}</dt>
                        <dd className="font-semibold text-ink">{g.value}</dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink-soft">Audit events logged</dt>
                      <dd className="font-semibold text-ink">
                        {await activityCount()}{" "}
                        <span className="text-xs font-normal text-ink-soft">
                          ({await authActivityCount()} auth)
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
              </Reveal>

              <Reveal delay={0.06}>
                <div className="glass h-full rounded-3xl p-6">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                    <Sparkles className="h-4 w-4 text-saffron-deep" aria-hidden /> Frames
                  </h2>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink-soft">Total in catalogue</dt>
                      <dd className="font-semibold text-ink">{catalog.length}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink-soft">Active</dt>
                      <dd className="font-semibold text-ink">
                        {catalog.filter((f) => f.active).length}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink-soft">Featured</dt>
                      <dd className="font-semibold text-ink">
                        {catalog.filter((f) => f.featured).length}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink-soft">Customised metadata</dt>
                      <dd className="font-semibold text-ink">
                        {catalog.filter((f) => f.overridden).length}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink-soft">Plans in use</dt>
                      <dd className="font-semibold text-ink">
                        {plans.map((p) => `${p.plan_id} ${p.n}`).join(" · ") || "free"}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    href="/admin?tab=frames"
                    className="mt-4 inline-block text-xs font-semibold text-coral hover:underline"
                  >
                    Manage frames →
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={0.1}>
                <div className="glass h-full rounded-3xl p-6">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                    <Activity className="h-4 w-4 text-teal" aria-hidden /> Recent activity
                  </h2>
                  {recent.length === 0 ? (
                    <p className="mt-3 text-sm text-ink-soft">No events yet.</p>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {recent.map((a) => (
                        <li key={a.id} className="text-sm">
                          <p className="text-ink">{a.message}</p>
                          <p className="text-xs text-ink-soft">
                            {a.type.replace(/_/g, " ")} ·{" "}
                            {new Date(a.created_at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    href="/admin?tab=activity"
                    className="mt-4 inline-block text-xs font-semibold text-coral hover:underline"
                  >
                    Full activity log →
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={0.14}>
                <div className="glass h-full rounded-3xl p-6">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                    <MailCheck className="h-4 w-4 text-teal" aria-hidden /> Email &amp;
                    analytics
                  </h2>
                  <p className="mt-2 text-xs text-ink-soft">
                    Provider <strong>{email.provider}</strong>
                    {email.ready ? " — delivering." : " — configure RESEND_API_KEY to deliver."}
                  </p>
                  {deliveries.length > 0 && (
                    <ul className="mt-4 space-y-2 text-xs text-ink-soft">
                      {deliveries.map((d) => (
                        <li key={`${d.created_at}-${d.template}`}>
                          <span
                            className={`font-semibold ${
                              d.status === "sent" ? "text-jade-deep" : "text-coral"
                            }`}
                          >
                            {d.status}
                          </span>{" "}
                          · {d.template} · *@{d.to_domain} · {d.provider}
                          {d.detail ? ` · ${d.detail.slice(0, 60)}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4 border-t border-white/60 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      Product events (30d) · {analyticsTotal()} total
                    </p>
                    {analytics.length === 0 ? (
                      <p className="mt-2 text-sm text-ink-soft">No events recorded yet.</p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                        {analytics.slice(0, 8).map((e) => (
                          <li key={e.event} className="flex items-center justify-between gap-3">
                            <span>{e.event.replace(/_/g, " ")}</span>
                            <span className="font-semibold text-ink">{e.n}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </Reveal>
            </div>

            <p className="text-center text-xs text-ink-soft">
              <UserRound className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Every admin action is role-checked on the server and written to the audit log.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
