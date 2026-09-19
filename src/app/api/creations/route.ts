import { getDb, nowIso } from "@/server/db";
import { generateToken } from "@/server/passwords";
import {
  cleanCaption,
  cleanSlug,
  extensionFor,
  imageMime,
  parseDataUrl,
  parsePageParams,
  decodeCursor,
  encodeCursor,
  contentTypeFor,
} from "@/server/validation";
import {
  creationKey,
  deleteCreationObjects,
  putImage,
} from "@/server/storage";
import { logEvent } from "@/server/activity";
import { track } from "@/server/analytics";
import { getEntitlements } from "@/server/entitlements";
import { findAnyFrame } from "@/server/frame-catalog";
import {
  ok,
  fail,
  assertSameOrigin,
  guardRate,
  readJson,
  requireUser,
  requireVerified,
  serverError,
} from "@/server/api";

const MAX_FULL_BYTES = 6 * 1024 * 1024; // 6 MB composite PNG ceiling
const MAX_THUMB_BYTES = 500 * 1024; // 500 KB dashboard thumbnail

export interface CreationListItem {
  id: string;
  frameSlug: string;
  caption: string | null;
  bytes: number;
  thumbBytes: number;
  hasThumb: boolean;
  visibility: "private" | "public";
  shareSlug: string | null;
  shareShowCaption: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreationRow {
  id: string;
  frame_id: string;
  caption: string | null;
  bytes: number;
  thumb_bytes: number | null;
  thumb_path: string | null;
  visibility: string;
  share_slug: string | null;
  share_show_caption: number | null;
  created_at: string;
  updated_at: string;
}

export function toListItem(row: CreationRow): CreationListItem {
  return {
    id: row.id,
    frameSlug: row.frame_id,
    caption: row.caption,
    bytes: row.bytes,
    thumbBytes: row.thumb_bytes ?? 0,
    hasThumb: Boolean(row.thumb_path),
    visibility: row.visibility === "public" ? "public" : "private",
    shareSlug: row.share_slug,
    shareShowCaption: row.share_show_caption !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/creations — the signed-in user's creations, cursor-paged.
 * Never returns another user's rows: `user_id` is part of every query.
 */
export async function GET(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  try {
    const { limit, cursor } = parsePageParams(req.url, {
      defaultLimit: 12,
      maxLimit: 48,
    });
    const db = await getDb();
    const keyset = decodeCursor(cursor);

    const rows = (await (keyset
      ? db
          .prepare(
            `SELECT id, frame_id, caption, bytes, thumb_bytes, thumb_path,
                      visibility, share_slug, share_show_caption, created_at, updated_at
               FROM creations
               WHERE user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
               ORDER BY created_at DESC, id DESC LIMIT ?`
          )
          .all(
            user.id,
            keyset.createdAt,
            keyset.createdAt,
            keyset.id,
            limit + 1
          )
      : db
          .prepare(
            `SELECT id, frame_id, caption, bytes, thumb_bytes, thumb_path,
                      visibility, share_slug, share_show_caption, created_at, updated_at
               FROM creations WHERE user_id = ?
               ORDER BY created_at DESC, id DESC LIMIT ?`
          )
          .all(user.id, limit + 1))) as CreationRow[];

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    const totals = (await db
      .prepare(
        `SELECT COUNT(*) AS n,
                COALESCE(SUM(bytes), 0) AS bytes,
                COALESCE(SUM(CASE WHEN visibility = 'public' THEN 1 ELSE 0 END), 0) AS publicCount
         FROM creations WHERE user_id = ?`
      )
      .get(user.id)) as { n: number; bytes: number; publicCount: number };

    return ok({
      creations: page.map(toListItem),
      nextCursor:
        hasMore && last ? encodeCursor(last.created_at, last.id) : null,
      totals,
    });
  } catch (err) {
    return serverError("creations:list", err);
  }
}

/**
 * POST /api/creations — persist a finished composite.
 * Body: { frameSlug, caption, imageDataUrl, thumbDataUrl? }
 */
export async function POST(req: Request) {
  const limited = await guardRate(req, "creations", 30, 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user, error } = await requireVerified();
  if (error) return error;

  const body = await readJson<{
    frameSlug?: string;
    caption?: string;
    imageDataUrl?: string;
    thumbDataUrl?: string;
  }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");

  try {
    const frameSlug = cleanSlug(body.frameSlug);
    if (!frameSlug) return fail("Which frame is this for?");
    const frame = await findAnyFrame(frameSlug);
    if (!frame) return fail("Unknown frame.", "NOT_FOUND");

    const entitlements = await getEntitlements(user.id);
    if (!entitlements.canCreate) {
      return fail(
        `You've reached the ${entitlements.plan.name} plan limit of ${entitlements.plan.limits.creations} saved creations. Delete one to make room.`,
        "LIMIT_REACHED"
      );
    }

    const full = parseDataUrl(body.imageDataUrl ?? "", MAX_FULL_BYTES);
    if (!full) {
      return fail(
        "That image didn't make it through — please try saving again.",
        "PAYLOAD_TOO_LARGE"
      );
    }
    const fullMime = imageMime(full.buf);
    if (!fullMime) {
      return fail("Unsupported image format. PNG, JPEG or WebP only.", "UNSUPPORTED_MEDIA");
    }

    // The thumbnail is a client-generated derivative. It is validated exactly
    // like the full image (size + magic bytes) and is optional.
    let thumb: { buf: Buffer; mime: "png" | "jpeg" | "webp" } | null = null;
    if (body.thumbDataUrl) {
      const parsed = parseDataUrl(body.thumbDataUrl, MAX_THUMB_BYTES);
      const sniffed = parsed ? imageMime(parsed.buf) : null;
      if (parsed && sniffed) thumb = { buf: parsed.buf, mime: sniffed };
    }

    const db = await getDb();
    const id = generateToken(12);
    const caption = cleanCaption(body.caption) || null;

    const fullKey = creationKey(user.id, id, "full", extensionFor(fullMime));
    const stored = await putImage(fullKey, full.buf);

    let thumbKey: string | null = null;
    let thumbBytes = 0;
    if (thumb) {
      const key = creationKey(user.id, id, "thumb", extensionFor(thumb.mime));
      const res = await putImage(key, thumb.buf);
      thumbKey = res.key;
      thumbBytes = res.bytes;
    }

    const now = nowIso();
    try {
      await db.tx(async (tx) => {
        await tx
          .prepare(
            `INSERT INTO creations
           (id, user_id, frame_id, caption, storage_path, mime_type, bytes,
            thumb_path, thumb_bytes, visibility, share_slug, share_show_caption,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'private', NULL, 1, ?, ?)`
          )
          .run(
            id,
            user.id,
            frameSlug,
            caption,
            stored.key,
            contentTypeFor(fullMime),
            stored.bytes,
            thumbKey,
            thumbBytes,
            now,
            now
          );
      });
    } catch (dbErr) {
      // Never leave orphaned files behind when the row can't be written.
      await deleteCreationObjects([fullKey, thumbKey]);
      throw dbErr;
    }

    await logEvent(user.id, "creation_saved", `Saved a creation using “${frame.title}”`, {
      creationId: id,
    });
    track("creation_saved", {
      userId: user.id,
      props: { frame: frameSlug, thumb: Boolean(thumbKey) },
    });

    return ok(
      {
        creation: {
          id,
          frameSlug,
          caption,
          visibility: "private",
          shareSlug: null,
          createdAt: now,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return serverError("creations:create", err);
  }
}
