import { getDb, nowIso } from "@/server/db";
import { getCurrentUser } from "@/server/sessions";
import { avatarKey, putImage, readCreationImage } from "@/server/storage";
import { deleteCreationObjects } from "@/server/storage";
import {
  extensionFor,
  imageMime,
  parseDataUrl,
} from "@/server/validation";
import { logEvent } from "@/server/activity";
import {
  ok,
  fail,
  assertSameOrigin,
  guardRate,
  readJson,
  requireUser,
  serverError,
} from "@/server/api";

const MAX_AVATAR_BYTES = 800 * 1024; // 800 KB — avatars are small

/**
 * POST /api/profile/avatar — set a profile image.
 * Body: { imageDataUrl } (PNG/JPEG/WebP data URL, ≤800 KB)
 */
export async function POST(req: Request) {
  const limited = await guardRate(req, "avatar-upload", 20, 30 * 60 * 1000);
  if (limited) return limited;
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");

  const { user, error } = await requireUser();
  if (error) return error;

  const body = await readJson<{ imageDataUrl?: string }>(req);
  if (!body) return fail("Invalid request body", "BAD_REQUEST");

  const parsed = parseDataUrl(body.imageDataUrl ?? "", MAX_AVATAR_BYTES);
  if (!parsed) {
    return fail("Use a PNG, JPEG or WebP image under 800 KB.", "PAYLOAD_TOO_LARGE");
  }
  const mime = imageMime(parsed.buf);
  if (!mime) {
    return fail("Use a PNG, JPEG or WebP image under 800 KB.", "UNSUPPORTED_MEDIA");
  }

  try {
    const ext = extensionFor(mime);
    const key = avatarKey(user.id, ext);
    await putImage(key, parsed.buf);

    const url = `/api/profile/avatar?v=${Date.now()}`;
    getDb()
      .prepare(
        `INSERT INTO profiles (user_id, bio, avatar_url, updated_at) VALUES (?, '', ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET avatar_url = excluded.avatar_url,
           updated_at = excluded.updated_at`
      )
      .run(user.id, url, nowIso());

    logEvent(user.id, "profile_updated", "Updated profile photo");
    return ok({ avatarUrl: url });
  } catch (err) {
    return serverError("profile:avatar", err);
  }
}

/** GET /api/profile/avatar — the signed-in user's avatar (private, no-store). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Sign in required", "UNAUTHORIZED");

    const profile = getDb()
      .prepare("SELECT avatar_url FROM profiles WHERE user_id = ?")
      .get(user.id) as { avatar_url: string | null } | undefined;
    if (!profile?.avatar_url) return fail("No avatar", "NOT_FOUND");

    for (const ext of ["jpg", "png", "webp"] as const) {
      const buf = await readCreationImage(avatarKey(user.id, ext));
      if (buf) {
        return new Response(new Uint8Array(buf), {
          headers: {
            "Content-Type": ext === "jpg" ? "image/jpeg" : `image/${ext}`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
    return fail("No avatar", "NOT_FOUND");
  } catch (err) {
    return serverError("profile:avatar:get", err);
  }
}

/** DELETE /api/profile/avatar — remove the profile image. */
export async function DELETE(req: Request) {
  if (!assertSameOrigin(req)) return fail("Bad origin", "FORBIDDEN");
  const { user, error } = await requireUser();
  if (error) return error;
  try {
    await deleteCreationObjects([
      avatarKey(user.id, "jpg"),
      avatarKey(user.id, "png"),
      avatarKey(user.id, "webp"),
    ]);
    getDb()
      .prepare("UPDATE profiles SET avatar_url = NULL, updated_at = ? WHERE user_id = ?")
      .run(nowIso(), user.id);
    return ok({ avatarUrl: null });
  } catch (err) {
    return serverError("profile:avatar:delete", err);
  }
}
