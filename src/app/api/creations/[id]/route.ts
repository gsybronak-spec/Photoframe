import { getDb, nowIso } from "@/server/db";
import { generateToken } from "@/server/passwords";
import { deleteCreationObjects } from "@/server/storage";
import { logEvent } from "@/server/activity";
import { track } from "@/server/analytics";
import { getEntitlements } from "@/server/entitlements";
import { cleanId } from "@/server/validation";
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

interface OwnedRow {
  id: string;
  user_id: string;
  frame_id: string;
  caption: string | null;
  storage_path: string;
  thumb_path: string | null;
  visibility: string;
  share_slug: string | null;
  share_show_caption: number | null;
}

/** Loads a creation and enforces ownership in one place (no IDOR by design). */
async function loadOwned(
  id: string,
  viewerId: string,
  role: string
): Promise<{ row: OwnedRow; allowed: boolean } | null> {
  const db = await getDb();
  const row = (await db
    .prepare(
      `SELECT id, user_id, frame_id, caption, storage_path, thumb_path,
              visibility, share_slug, share_show_caption
       FROM creations WHERE id = ?`
    )
    .get(id)) as OwnedRow | undefined;
  if (!row) return null;
  return { row, allowed: row.user_id === viewerId || role === "admin" };
}

/** DELETE /api/creations/:id — owner-only, removes the row and every file. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user, error } = await requireUser();
  if (error) return error;

  try {
    const { id } = await params;
    const safeId = cleanId(id);
    if (!safeId) return fail("Creation not found.", "NOT_FOUND");

    const found = await loadOwned(safeId, user.id, user.role);
    if (!found) return fail("Creation not found.", "NOT_FOUND");
    if (!found.allowed) {
      return fail("You can only delete your own creations.", "FORBIDDEN");
    }

    const db = await getDb();
    await db.prepare("DELETE FROM creations WHERE id = ?").run(safeId);
    await deleteCreationObjects([found.row.storage_path, found.row.thumb_path]);

    await logEvent(user.id, "creation_deleted", "Deleted a creation", {
      creationId: safeId,
      frame: found.row.frame_id,
    });
    track("creation_deleted", {
      userId: user.id,
      props: { frame: found.row.frame_id, was_public: found.row.visibility === "public" },
    });

    return ok({ deleted: safeId });
  } catch (err) {
    return serverError("creations:delete", err);
  }
}

/**
 * PATCH /api/creations/:id — sharing controls.
 * Body: { visibility?: "private"|"public", shareShowCaption?: boolean }
 *
 * Publishing requires a verified email and a free share slot. Revoking clears
 * the slug immediately, so a shared URL 404s the moment it is switched off.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await guardRate(req, "creation-share", 30, 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user, error } = await requireVerified();
  if (error) return error;

  const body = await readJson<{
    visibility?: string;
    shareShowCaption?: boolean;
  }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");

  try {
    const { id } = await params;
    const safeId = cleanId(id);
    if (!safeId) return fail("Creation not found.", "NOT_FOUND");

    const found = await loadOwned(safeId, user.id, user.role);
    if (!found) return fail("Creation not found.", "NOT_FOUND");
    // Sharing is always owner-only — an admin may delete, but never publish on
    // another person's behalf.
    if (found.row.user_id !== user.id) {
      return fail("You can only share your own creations.", "FORBIDDEN");
    }

    const db = await getDb();
    const now = nowIso();
    let { share_slug: shareSlug, visibility } = found.row;
    const showCaption =
      body.shareShowCaption === undefined
        ? found.row.share_show_caption !== 0
        : Boolean(body.shareShowCaption);

    if (body.visibility === "public") {
      if (visibility !== "public") {
        const entitlements = await getEntitlements(user.id);
        if (!entitlements.canPublish) {
          return fail(
            `You've used all ${entitlements.plan.limits.publicShares} public share links on the ${entitlements.plan.name} plan. Make one private to free a slot.`,
            "LIMIT_REACHED"
          );
        }
      }
      if (!shareSlug) shareSlug = generateToken(16); // 128-bit, unguessable
      visibility = "public";
      await logEvent(user.id, "creation_shared", "Published a creation with a share link", {
        creationId: safeId,
      });
      track("creation_shared", { userId: user.id, props: { frame: found.row.frame_id } });
    } else if (body.visibility === "private") {
      if (visibility === "public") {
        await logEvent(user.id, "creation_unshared", "Made a creation private again", {
          creationId: safeId,
        });
        track("creation_unshared", {
          userId: user.id,
          props: { frame: found.row.frame_id },
        });
      }
      visibility = "private";
      shareSlug = null; // the old link stops working immediately
    }

    await db
      .prepare(
        `UPDATE creations
       SET visibility = ?, share_slug = ?, share_show_caption = ?,
           published_at = CASE WHEN ? = 'public' THEN COALESCE(published_at, ?) ELSE NULL END,
           updated_at = ?
       WHERE id = ?`
      )
      .run(
        visibility,
        shareSlug,
        showCaption ? 1 : 0,
        visibility,
        now,
        now,
        safeId
      );

    return ok({
      creation: {
        id: safeId,
        visibility,
        shareSlug,
        sharePath: visibility === "public" && shareSlug ? `/s/${shareSlug}` : null,
        shareShowCaption: showCaption,
      },
    });
  } catch (err) {
    return serverError("creations:patch", err);
  }
}
