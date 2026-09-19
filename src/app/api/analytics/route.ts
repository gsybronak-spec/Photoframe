import { getCurrentUser } from "@/server/sessions";
import { isAnalyticsEvent, track } from "@/server/analytics";
import {
  ok,
  fail,
  assertSameOrigin,
  guardRate,
  readJson,
  serverError,
} from "@/server/api";

/**
 * POST /api/analytics — client-side product events (frame views, searches,
 * editor opens). Deliberately forgiving: analytics must never surface an error
 * to the user, so unknown events are dropped silently and the response is always
 * a cheap 200/204.
 */
export async function POST(req: Request) {
  const limited = await guardRate(req, "analytics", 120, 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  try {
    const body = await readJson<{ event?: string; props?: Record<string, unknown> }>(req);
    if (!body || !isAnalyticsEvent(body.event)) {
      return ok({ accepted: false });
    }
    const user = await getCurrentUser();
    track(body.event, {
      userId: user?.id ?? null,
      props: body.props ?? {},
    });
    return ok({ accepted: true });
  } catch (err) {
    return serverError("analytics:ingest", err);
  }
}
