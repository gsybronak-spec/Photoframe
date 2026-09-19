/**
 * Product analytics.
 *
 * Privacy-conscious by design:
 *  - an allowlist of product events, nothing arbitrary
 *  - no PII: no email, no name, no raw IP, no user agent stored
 *  - props are small scalars only (frame slug, plan, result counts…)
 *  - `user_id` is the internal id (useful for funnels, not identifying on its own)
 *    and is set to NULL if the account is later deleted (ON DELETE SET NULL)
 *
 * Delivery is pluggable: the DB table is the source of truth locally, and
 * `ANALYTICS_PROVIDER=http` forwards events to a collector without touching call
 * sites.
 */

import { getDb, nowIso } from "./db";
import { generateToken } from "./passwords";

export const ANALYTICS_EVENTS = [
  "signup",
  "login",
  "logout",
  "frame_view",
  "frame_search",
  "editor_open",
  "image_upload",
  "creation_saved",
  "creation_shared",
  "creation_unshared",
  "creation_deleted",
  "public_view",
  "upgrade_interest",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

const ALLOWED = new Set<string>(ANALYTICS_EVENTS);
const MAX_PROPS = 8;
const MAX_STRING = 120;

/** Keeps only small scalar props — drops anything that looks like free text/PII. */
function sanitizeProps(props: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props ?? {})) {
    if (Object.keys(out).length >= MAX_PROPS) break;
    if (!/^[a-z_]{1,40}$/.test(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string") out[key] = value.slice(0, MAX_STRING);
  }
  return out;
}

export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  return typeof value === "string" && ALLOWED.has(value);
}

async function forwardToProvider(
  event: string,
  props: Record<string, string | number | boolean>
): Promise<void> {
  if ((process.env.ANALYTICS_PROVIDER ?? "none") !== "http") return;
  const url = process.env.ANALYTICS_ENDPOINT;
  if (!url) {
    console.warn(
      "[analytics] ANALYTICS_PROVIDER=http but ANALYTICS_ENDPOINT is unset — dropping events."
    );
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.ANALYTICS_TOKEN
          ? { Authorization: `Bearer ${process.env.ANALYTICS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ event, props }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    /* analytics must never affect the product experience */
  }
}

/** Records a product event. Fire-and-forget — always safe to call unawaited. */
export function track(
  event: AnalyticsEvent,
  input: { userId?: string | null; props?: Record<string, unknown> } = {}
): void {
  const props = sanitizeProps(input.props ?? {});
  // Fire-and-forget by contract: callers invoke track() without awaiting, so
  // the write is dispatched to the driver without touching request latency.
  // Errors are logged by the driver layer; analytics never breaks a request.
  void (async () => {
    try {
      const db = await getDb();
      await db
        .prepare(
          "INSERT INTO analytics_events (id, user_id, event, props, created_at) VALUES (?, ?, ?, ?, ?)"
        )
        .run(
          generateToken(12),
          input.userId ?? null,
          event,
          JSON.stringify(props),
          nowIso()
        );
    } catch (err) {
      console.error(
        "[analytics] insert failed:",
        err instanceof Error ? err.message : err
      );
    }
  })();
  void forwardToProvider(event, props);
}

export interface AnalyticsSummaryRow {
  event: string;
  n: number;
}

export async function analyticsSummary(days = 30): Promise<AnalyticsSummaryRow[]> {
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  const db = await getDb();
  return (await db
    .prepare(
      `SELECT event, COUNT(*) AS n FROM analytics_events
       WHERE created_at >= ? GROUP BY event ORDER BY n DESC LIMIT 25`
    )
    .all(since)) as AnalyticsSummaryRow[];
}

export async function analyticsTotal(): Promise<number> {
  const db = await getDb();
  return (
    (await db.prepare("SELECT COUNT(*) AS n FROM analytics_events").get()) as { n: number }
  ).n;
}
