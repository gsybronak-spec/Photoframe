import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  Flower2,
  Globe2,
  Images,
  MailCheck,
  Settings,
  ShieldAlert,
  Sparkles,
  HardDrive,
} from "lucide-react";
import { getCurrentUser } from "@/server/sessions";
import { getDb, nowIso } from "@/server/db";
import { recentActivity } from "@/server/activity";
import { getEntitlements } from "@/server/entitlements";
import { getFrame } from "@/lib/frames";
import { buildThumbSVG, svgToDataURI } from "@/lib/frames";
import { Reveal } from "@/components/Reveal";
import { VerificationBanner } from "@/components/VerificationBanner";
import { CreationsPager, EmptyCreations, type CreationItem } from "@/components/CreationsPager";
import { usageLabel } from "@/lib/plans";
import { formatBytes } from "@/lib/image-client";

export const metadata = { title: "Your studio", robots: { index: false } };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  const sp = await searchParams;
  const justVerified = sp.verified === "1";

  const db = await getDb();
  const rows = (await db
    .prepare(
      `SELECT id, frame_id, caption, bytes, thumb_path, visibility, share_slug,
              share_show_caption, created_at
       FROM creations WHERE user_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ?`
    )
    .all(user.id, PAGE_SIZE + 1)) as {
    id: string;
    frame_id: string;
    caption: string | null;
    bytes: number;
    thumb_path: string | null;
    visibility: string;
    share_slug: string | null;
    share_show_caption: number | null;
    created_at: string;
  }[];

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = page[page.length - 1];

  const creations: CreationItem[] = page.map((c) => ({
    id: c.id,
    frameSlug: c.frame_id,
    frameTitle: getFrame(c.frame_id)?.title ?? c.frame_id,
    caption: c.caption,
    bytes: c.bytes,
    hasThumb: Boolean(c.thumb_path),
    visibility: c.visibility === "public" ? "public" : "private",
    shareSlug: c.share_slug,
    createdAt: c.created_at,
  }));

  const totals = (await db
    .prepare(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(bytes), 0) AS bytes,
              COALESCE(SUM(CASE WHEN visibility = 'public' THEN 1 ELSE 0 END), 0) AS publicCount
       FROM creations WHERE user_id = ?`
    )
    .get(user.id)) as { n: number; bytes: number; publicCount: number };

  const savedFrames = (await db
    .prepare(
      "SELECT frame_id, created_at FROM saved_frames WHERE user_id = ? ORDER BY created_at DESC LIMIT 6"
    )
    .all(user.id)) as { frame_id: string; created_at: string }[];

  const activity = await recentActivity(user.id, 8);
  const entitlements = await getEntitlements(user.id);
  const avatarUrl =
    (
      (await db
        .prepare("SELECT avatar_url FROM profiles WHERE user_id = ?")
        .get(user.id)) as { avatar_url: string | null } | undefined
    )?.avatar_url ?? null;
  const activeSessions = (
    (await db
      .prepare(
        "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?"
      )
      .get(user.id, nowIso())) as { n: number }
  ).n;

  const savedFrameCards = savedFrames
    .map((s) => ({ ...s, frame: getFrame(s.frame_id) }))
    .filter((s) => s.frame)
    .slice(0, 4);

  const stats = [
    { icon: Images, label: "Creations", value: usageLabel(totals.n, entitlements.plan.limits.creations) },
    { icon: HardDrive, label: "Storage used", value: formatBytes(totals.bytes) },
    {
      icon: Globe2,
      label: "Public links",
      value: usageLabel(totals.publicCount, entitlements.plan.limits.publicShares),
    },
    {
      icon: CalendarDays,
      label: "Member since",
      value: new Date(user.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      {justVerified && (
        <p className="mb-6 flex items-center gap-2 rounded-2xl bg-jade/10 px-5 py-3 text-sm font-semibold text-jade-deep">
          <Flower2 className="h-4 w-4" aria-hidden /> Email verified — saving and sharing
          are unlocked.
        </p>
      )}

      {!user.email_verified_at && (
        <div className="mb-6">
          <VerificationBanner />
        </div>
      )}

      {/* Greeting + profile */}
      <Reveal>
        <div className="glass rounded-[2rem] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-3xl bg-gradient-to-br from-saffron to-coral font-display text-2xl font-bold text-white shadow-glass">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-cover"
                  />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-teal">
                  Namaste,
                </p>
                <h1 className="mt-0.5 font-display text-4xl font-semibold text-ink">
                  {user.name}
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
                  <span>{user.email}</span>
                  <span className="flex items-center gap-1.5">
                    {user.email_verified_at ? (
                      <>
                        <MailCheck className="h-3.5 w-3.5 text-jade-deep" aria-hidden />
                        <span className="font-semibold text-jade-deep">Verified</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="h-3.5 w-3.5 text-saffron-deep" aria-hidden />
                        <span className="font-semibold text-saffron-deep">Unverified</span>
                      </>
                    )}
                  </span>
                  <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-teal-deep">
                    {entitlements.plan.name} plan
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/settings"
                className="btn-ghost flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-ink"
              >
                <Settings className="h-4 w-4" aria-hidden /> Settings
              </Link>
              <Link
                href="/frames"
                className="btn-primary flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold"
              >
                <Sparkles className="h-4 w-4" aria-hidden /> Create a frame
              </Link>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.06}>
            <div className="glass flex h-full items-center gap-4 rounded-3xl p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-jade to-teal text-white shadow-glass">
                <s.icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="font-display text-xl font-bold text-ink">{s.value}</p>
                <p className="text-xs text-ink-soft">{s.label}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      {!entitlements.canCreate && (
        <p className="mt-6 flex items-start gap-2 rounded-2xl bg-saffron/10 px-5 py-3 text-sm text-saffron-deep">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          You&apos;ve reached your {entitlements.plan.name} limit of{" "}
          {entitlements.plan.limits.creations} saved creations. Delete one to free a slot —
          billing isn&apos;t connected yet, so plans can&apos;t be purchased in-app.
        </p>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Creations */}
        <Reveal delay={0.1}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-2xl font-semibold text-ink">My creations</h2>
            {totals.n > 0 && (
              <p className="text-xs text-ink-soft">
                {formatBytes(totals.bytes)} stored privately
              </p>
            )}
          </div>
          {creations.length === 0 ? (
            <EmptyCreations />
          ) : (
            <CreationsPager
              initial={creations}
              nextCursor={
                hasMore && last ? encodeCursorFor(last.created_at, last.id) : null
              }
            />
          )}
        </Reveal>

        {/* Side rail */}
        <div className="flex flex-col gap-6">
          <Reveal delay={0.15}>
            <div className="glass rounded-3xl p-6">
              <h3 className="font-display text-lg font-semibold text-ink">Saved frames</h3>
              {savedFrameCards.length === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">
                  Bookmark frames you love from any{" "}
                  <Link href="/frames" className="font-semibold text-coral hover:underline">
                    frame page
                  </Link>
                  .
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {savedFrameCards.map((s) => (
                    <Link
                      key={s.frame_id}
                      href={`/frames/${s.frame_id}`}
                      className="overflow-hidden rounded-2xl transition hover:opacity-90"
                      title={s.frame!.title}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={svgToDataURI(buildThumbSVG(s.frame!))}
                        alt={`${s.frame!.title} frame thumbnail`}
                        loading="lazy"
                        className="w-full"
                      />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="glass rounded-3xl p-6">
              <h3 className="font-display text-lg font-semibold text-ink">
                Recent activity
              </h3>
              {activity.length === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">Your journey starts now.</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-saffron/20 to-coral/20 text-saffron-deep">
                        <Flower2 className="h-4 w-4" aria-hidden />
                      </span>
                      <div>
                        <p className="text-sm leading-snug text-ink">{a.message}</p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {new Date(a.created_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.25}>
            <div className="glass rounded-3xl p-6">
              <h3 className="font-display text-lg font-semibold text-ink">
                Your plan &amp; sessions
              </h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-soft">Plan</dt>
                  <dd className="font-semibold text-ink">{entitlements.plan.name}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-soft">Active sessions</dt>
                  <dd className="font-semibold text-ink">{activeSessions}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-soft">Share slots free</dt>
                  <dd className="font-semibold text-ink">
                    {entitlements.remaining.publicShares < 0
                      ? "Unlimited"
                      : entitlements.remaining.publicShares}
                  </dd>
                </div>
              </dl>
              <Link
                href="/settings"
                className="mt-4 inline-block text-xs font-semibold text-coral hover:underline"
              >
                Manage account &amp; security →
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

/** Mirrors the server cursor format (created_at|id, base64url). */
function encodeCursorFor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`).toString("base64url");
}
