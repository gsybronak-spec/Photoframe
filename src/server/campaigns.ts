/**
 * Campaign studio data layer.
 *
 * A campaign is an admin-composed photo-frame event:
 *   - artwork base layer (stored via the StorageDriver, private)
 *   - optional Photo Area mask (circle/square) the user's photo is clipped into
 *   - optional Name Area typography overlay
 *   - optional district tag, description, publish status
 *
 * Users composite their photo locally in the browser; the server never sees a
 * user photo. Only anonymous aggregate events (generate/share) are recorded.
 */

import { getDb, nowIso } from "./db";
import { generateToken } from "./passwords";
import { cleanText } from "./validation";

export type CampaignStatus = "draft" | "active" | "paused" | "archived";
export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "draft",
  "active",
  "paused",
  "archived",
];
export type PhotoShape = "circle" | "square";

export const CAMPAIGN_EVENT_TYPES = [
  "generate",
  "download",
  "whatsapp",
  "facebook",
  "instagram",
  "link",
] as const;
export type CampaignEventType = (typeof CAMPAIGN_EVENT_TYPES)[number];

export interface CampaignRow {
  id: string;
  name: string;
  slug: string;
  district: string | null;
  description: string;
  status: CampaignStatus;
  artwork_key: string | null;
  artwork_mime: string | null;
  artwork_bytes: number;
  canvas_width: number;
  canvas_height: number;
  art_x: number;
  art_y: number;
  art_w: number;
  art_h: number;
  art_rotation: number;
  created_by: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignPhotoConfig {
  enabled: boolean;
  shape: PhotoShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface CampaignNameConfig {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  font_family: string;
  font_size: number;
  font_color: string;
  font_weight: "normal" | "bold";
  alignment: "left" | "center" | "right";
  letter_spacing: number;
}

/* ------------------------------------------------------------------ */
/* Geometry helpers — percentages of the canvas, always clamped        */
/* ------------------------------------------------------------------ */

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Coordinates are percentages of the canvas. Some sources stored raw pixels;
 * anything above 100 is interpreted as pixels and converted. Auto-heals so
 * one bad row can never break a composition.
 */
export function normalizeCoord(value: unknown, total: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n > 100) return round1(clamp((n / total) * 100, 0, 100));
  return round1(clamp(n, 0, 100));
}

/** Clamps a geometry rect into sane bounds (percent coords, 4% min size). */
export function clampRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const width = clamp(round1(Number(rect.width) || 0), 4, 100);
  const height = clamp(round1(Number(rect.height) || 0), 4, 100);
  const x = clamp(round1(Number(rect.x) || 0), 0, 100 - width);
  const y = clamp(round1(Number(rect.y) || 0), 0, 100 - height);
  return { x, y, width, height };
}

const CLAMPED_ROTATION = (v: unknown) => clamp(round1(Number(v) || 0), -180, 180);

export function cleanColor(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const s = v.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s.toLowerCase() : fallback;
}

/** Normalizes a photo config payload from an admin request. */
export function normalizePhotoConfig(input: unknown): CampaignPhotoConfig {
  const raw = (input ?? {}) as Record<string, unknown>;
  const shape: PhotoShape = raw.shape === "circle" ? "circle" : "square";
  const rect = clampRect({
    x: Number(raw.x) || 30,
    y: Number(raw.y) || 35,
    width: Number(raw.width) || 40,
    height: Number(raw.height) || 30,
  });
  return {
    enabled: Boolean(raw.enabled),
    shape,
    ...rect,
    rotation: CLAMPED_ROTATION(raw.rotation),
  };
}

/** Normalizes a name config payload from an admin request. */
export function normalizeNameConfig(input: unknown): CampaignNameConfig {
  const raw = (input ?? {}) as Record<string, unknown>;
  const rect = clampRect({
    x: Number(raw.x) || 20,
    y: Number(raw.y) || 78,
    width: Number(raw.width) || 60,
    height: Number(raw.height) || 12,
  });
  const alignment = String(raw.alignment);
  return {
    enabled: Boolean(raw.enabled),
    ...rect,
    rotation: CLAMPED_ROTATION(raw.rotation),
    font_family: cleanText(raw.font_family, 60) || "Plus Jakarta Sans",
    font_size: clamp(Math.round(Number(raw.font_size) || 26), 10, 120),
    font_color: cleanColor(raw.font_color, "#fff8f0"),
    font_weight: raw.font_weight === "normal" ? "normal" : "bold",
    alignment:
      alignment === "left" || alignment === "right" ? (alignment as CampaignNameConfig["alignment"]) : "center",
    letter_spacing: clamp(Math.round((Number(raw.letter_spacing) ?? 1) * 10) / 10, -2, 12),
  };
}

/** Clamps canvas dimensions to sane bounds (min 300px, max 4000px). */
export function clampCanvasDim(v: unknown, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(4000, Math.max(300, n));
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

interface CampaignDbRow {
  id: string;
  name: string;
  slug: string;
  district: string | null;
  description: string;
  status: string;
  artwork_key: string | null;
  artwork_mime: string | null;
  artwork_bytes: number;
  canvas_width: number;
  canvas_height: number;
  art_x: number;
  art_y: number;
  art_w: number;
  art_h: number;
  art_rotation: number;
  created_by: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ConfigDbRow {
  p_enabled: number | null;
  p_shape: string | null;
  p_x: number | null;
  p_y: number | null;
  p_w: number | null;
  p_h: number | null;
  p_rot: number | null;
  n_enabled: number | null;
  n_x: number | null;
  n_y: number | null;
  n_w: number | null;
  n_h: number | null;
  n_rot: number | null;
  font_family: string | null;
  font_size: number | null;
  font_color: string | null;
  font_weight: string | null;
  alignment: string | null;
  letter_spacing: number | null;
}

const CAMPAIGN_SELECT = `
  SELECT c.*,
         p.enabled  AS p_enabled, p.shape  AS p_shape, p.x AS p_x, p.y AS p_y,
         p.width    AS p_w,       p.height AS p_h,     p.rotation AS p_rot,
         n.enabled  AS n_enabled, n.x      AS n_x, n.y AS n_y,
         n.width    AS n_w,       n.height AS n_h,     n.rotation AS n_rot,
         n.font_family AS font_family, n.font_size AS font_size,
         n.font_color  AS font_color,  n.font_weight AS font_weight,
         n.alignment   AS alignment,   n.letter_spacing AS letter_spacing
    FROM campaigns c
    LEFT JOIN campaign_photo_configs p ON p.campaign_id = c.id
    LEFT JOIN campaign_name_configs  n ON n.campaign_id = c.id`;

function hydrate(row: CampaignDbRow & Partial<ConfigDbRow>): CampaignRow & {
  photoConfig: CampaignPhotoConfig | null;
  nameConfig: CampaignNameConfig | null;
} {
  const campaign: CampaignRow = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    district: row.district,
    description: row.description,
    status: row.status as CampaignStatus,
    artwork_key: row.artwork_key,
    artwork_mime: row.artwork_mime,
    artwork_bytes: row.artwork_bytes,
    canvas_width: row.canvas_width,
    canvas_height: row.canvas_height,
    art_x: row.art_x,
    art_y: row.art_y,
    art_w: row.art_w,
    art_h: row.art_h,
    art_rotation: row.art_rotation,
    created_by: row.created_by,
    activated_at: row.activated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  const photo: CampaignPhotoConfig | null =
    row.p_enabled != null
      ? {
          enabled: Boolean(row.p_enabled),
          shape: row.p_shape === "circle" ? "circle" : "square",
          x: Number(row.p_x),
          y: Number(row.p_y),
          width: Number(row.p_w),
          height: Number(row.p_h),
          rotation: Number(row.p_rot),
        }
      : null;

  const name: CampaignNameConfig | null =
    row.n_enabled != null
      ? {
          enabled: Boolean(row.n_enabled),
          x: Number(row.n_x),
          y: Number(row.n_y),
          width: Number(row.n_w),
          height: Number(row.n_h),
          rotation: Number(row.n_rot),
          font_family: row.font_family ?? "Plus Jakarta Sans",
          font_size: Number(row.font_size),
          font_color: row.font_color ?? "#fff8f0",
          font_weight: row.font_weight === "normal" ? "normal" : "bold",
          alignment: (row.alignment === "left" || row.alignment === "right"
            ? row.alignment
            : "center") as CampaignNameConfig["alignment"],
          letter_spacing: Number(row.letter_spacing),
        }
      : null;

  return { ...campaign, photoConfig: photo, nameConfig: name };
}

/* ------------------------------------------------------------------ */
/* Listing + fetch                                                     */
/* ------------------------------------------------------------------ */

export interface CampaignListItem extends CampaignRow {
  photoConfig: CampaignPhotoConfig | null;
  nameConfig: CampaignNameConfig | null;
  frames: number;
  shares: number;
}

export async function listCampaigns(opts: {
  status?: string;
  search?: string;
  limit: number;
  offset: number;
}): Promise<{ items: CampaignListItem[]; total: number }> {
  const db = await getDb();
  const where: string[] = [];
  const args: (string | number)[] = [];

  if (opts.status && opts.status !== "all") {
    if (!CAMPAIGN_STATUSES.includes(opts.status as CampaignStatus)) {
      throw new Error(`Invalid campaign status: ${opts.status}`);
    }
    where.push("c.status = ?");
    args.push(opts.status);
  }
  if (opts.search && opts.search.trim()) {
    where.push("(LOWER(c.name) LIKE ? OR LOWER(c.slug) LIKE ?)");
    const like = `%${opts.search.trim().toLowerCase()}%`;
    args.push(like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = (await db
    .prepare(
      `${CAMPAIGN_SELECT}
       ${whereSql}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...args, opts.limit, opts.offset)) as unknown as (CampaignDbRow & Partial<ConfigDbRow>)[];

  const totalRow = (await db
    .prepare(`SELECT COUNT(*) AS n FROM campaigns c ${whereSql}`)
    .get(...args)) as { n: number };

  // Anonymous event counts per campaign (one grouped query, engine-portable).
  const ids = rows.map((r) => r.id);
  const counts = new Map<string, { frames: number; shares: number }>();
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(", ");
    const eventRows = (await db
      .prepare(
        `SELECT campaign_id, event_type, COUNT(*) AS n
           FROM campaign_events
          WHERE campaign_id IN (${placeholders})
          GROUP BY campaign_id, event_type`
      )
      .all(...ids)) as unknown as { campaign_id: string; event_type: string; n: number }[];
    for (const e of eventRows) {
      const entry = counts.get(e.campaign_id) ?? { frames: 0, shares: 0 };
      if (e.event_type === "generate") entry.frames += Number(e.n) || 0;
      else entry.shares += Number(e.n) || 0;
      counts.set(e.campaign_id, entry);
    }
  }

  return {
    items: rows.map((r) => {
      const hydrated = hydrate(r);
      const c = counts.get(r.id) ?? { frames: 0, shares: 0 };
      return { ...hydrated, frames: c.frames, shares: c.shares };
    }),
    total: totalRow.n,
  };
}

export async function getCampaignById(
  id: string
): Promise<(CampaignRow & { photoConfig: CampaignPhotoConfig | null; nameConfig: CampaignNameConfig | null }) | null> {
  if (!id) return null;
  const db = await getDb();
  const row = (await db.prepare(`${CAMPAIGN_SELECT} WHERE c.id = ?`).get(id)) as
    | (CampaignDbRow & Partial<ConfigDbRow>)
    | undefined;
  return row ? hydrate(row) : null;
}

export async function getCampaignBySlug(
  slug: string
): Promise<(CampaignRow & { photoConfig: CampaignPhotoConfig | null; nameConfig: CampaignNameConfig | null }) | null> {
  if (!slug) return null;
  const db = await getDb();
  const row = (await db.prepare(`${CAMPAIGN_SELECT} WHERE c.slug = ?`).get(slug)) as
    | (CampaignDbRow & Partial<ConfigDbRow>)
    | undefined;
  return row ? hydrate(row) : null;
}

/** Only active campaigns are publicly visible (draft/paused/archived → 404). */
export async function getActiveCampaignBySlug(
  slug: string
): Promise<(CampaignRow & { photoConfig: CampaignPhotoConfig | null; nameConfig: CampaignNameConfig | null }) | null> {
  const campaign = await getCampaignBySlug(slug);
  if (!campaign || campaign.status !== "active") return null;
  return campaign;
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 80);
}

async function uniqueSlug(db: Awaited<ReturnType<typeof getDb>>, base: string): Promise<string> {
  const root = base || `campaign-${generateToken(4).toLowerCase()}`;
  let candidate = root;
  let counter = 1;
  for (;;) {
    const existing = (await db
      .prepare("SELECT id FROM campaigns WHERE slug = ?")
      .get(candidate)) as { id: string } | undefined;
    if (!existing) return candidate;
    counter += 1;
    candidate = `${root}-${counter}`;
  }
}

export interface CreateCampaignInput {
  name: string;
  slug?: string;
  district?: string | null;
  description?: string;
  status?: CampaignStatus;
  canvas_width?: number;
  canvas_height?: number;
  art_x?: number;
  art_y?: number;
  art_w?: number;
  art_h?: number;
  art_rotation?: number;
  photoConfig?: CampaignPhotoConfig | null;
  nameConfig?: CampaignNameConfig | null;
  createdBy: string;
}

export async function createCampaign(
  input: CreateCampaignInput
): Promise<CampaignRow & { photoConfig: CampaignPhotoConfig | null; nameConfig: CampaignNameConfig | null }> {
  const db = await getDb();
  const name = cleanText(input.name, 120);
  if (!name) throw new Error("Campaign name is required");

  const status: CampaignStatus = CAMPAIGN_STATUSES.includes(
    input.status as CampaignStatus
  )
    ? (input.status as CampaignStatus)
    : "draft";

  const id = `cmp_${generateToken(12)}`;
  const now = nowIso();
  const slug = await uniqueSlug(db, slugify(cleanText(input.slug, 80) || name));

  const canvas_width = clampCanvasDim(input.canvas_width, 1080);
  const canvas_height = clampCanvasDim(input.canvas_height, 1350);
  const art = clampRect({
    x: input.art_x ?? 0,
    y: input.art_y ?? 0,
    width: input.art_w ?? 100,
    height: input.art_h ?? 100,
  });
  const photo = normalizePhotoConfig(input.photoConfig ?? { enabled: false });
  const nameCfg = normalizeNameConfig(input.nameConfig ?? { enabled: false });

  await db.tx(async (tx) => {
    await tx
      .prepare(
        `INSERT INTO campaigns
           (id, name, slug, district, description, status,
            artwork_key, artwork_mime, artwork_bytes,
            canvas_width, canvas_height,
            art_x, art_y, art_w, art_h, art_rotation,
            created_by, activated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        name,
        slug,
        cleanText(input.district, 80) || null,
        cleanText(input.description, 500),
        status,
        canvas_width,
        canvas_height,
        art.x,
        art.y,
        art.width,
        art.height,
        CLAMPED_ROTATION(input.art_rotation ?? 0),
        input.createdBy,
        status === "active" ? now : null,
        now,
        now
      );
    await tx
      .prepare(
        `INSERT INTO campaign_photo_configs
           (campaign_id, enabled, shape, x, y, width, height, rotation, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, photo.enabled ? 1 : 0, photo.shape, photo.x, photo.y, photo.width, photo.height, photo.rotation, now);
    await tx
      .prepare(
        `INSERT INTO campaign_name_configs
           (campaign_id, enabled, x, y, width, height, rotation, font_family, font_size,
            font_color, font_weight, alignment, letter_spacing, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        nameCfg.enabled ? 1 : 0,
        nameCfg.x,
        nameCfg.y,
        nameCfg.width,
        nameCfg.height,
        nameCfg.rotation,
        nameCfg.font_family,
        nameCfg.font_size,
        nameCfg.font_color,
        nameCfg.font_weight,
        nameCfg.alignment,
        nameCfg.letter_spacing,
        now
      );
  });

  const created = await getCampaignById(id);
  if (!created) throw new Error("Campaign creation failed");
  return created;
}

export interface UpdateCampaignInput {
  name?: string;
  slug?: string;
  district?: string | null;
  description?: string;
  status?: CampaignStatus;
  canvas_width?: number;
  canvas_height?: number;
  art_x?: number;
  art_y?: number;
  art_w?: number;
  art_h?: number;
  art_rotation?: number;
  photoConfig?: CampaignPhotoConfig;
  nameConfig?: CampaignNameConfig;
}

export async function updateCampaign(
  id: string,
  input: UpdateCampaignInput
): Promise<CampaignRow & { photoConfig: CampaignPhotoConfig | null; nameConfig: CampaignNameConfig | null }> {
  const db = await getDb();
  const existing = await getCampaignById(id);
  if (!existing) throw new Error("Campaign not found");

  const now = nowIso();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (input.name !== undefined) {
    const name = cleanText(input.name, 120);
    if (!name) throw new Error("Campaign name is required");
    sets.push("name = ?");
    args.push(name);
  }
  if (input.slug !== undefined) {
    const slug = slugify(cleanText(input.slug, 80));
    if (!slug) throw new Error("Campaign slug is invalid");
    const clash = (await db
      .prepare("SELECT id FROM campaigns WHERE slug = ? AND id != ?")
      .get(slug, id)) as { id: string } | undefined;
    if (clash) throw new Error(`Slug "${slug}" is already taken by another campaign`);
    sets.push("slug = ?");
    args.push(slug);
  }
  if (input.district !== undefined) {
    sets.push("district = ?");
    args.push(cleanText(input.district, 80) || null);
  }
  if (input.description !== undefined) {
    sets.push("description = ?");
    args.push(cleanText(input.description, 500));
  }
  if (input.status !== undefined) {
    if (!CAMPAIGN_STATUSES.includes(input.status)) {
      throw new Error(`Invalid campaign status: ${input.status}`);
    }
    sets.push("status = ?");
    args.push(input.status);
    if (input.status === "active" && !existing.activated_at) {
      sets.push("activated_at = ?");
      args.push(now);
    }
  }
  if (input.canvas_width !== undefined) {
    sets.push("canvas_width = ?");
    args.push(clampCanvasDim(input.canvas_width, existing.canvas_width));
  }
  if (input.canvas_height !== undefined) {
    sets.push("canvas_height = ?");
    args.push(clampCanvasDim(input.canvas_height, existing.canvas_height));
  }
  if (input.art_rotation !== undefined) {
    sets.push("art_rotation = ?");
    args.push(CLAMPED_ROTATION(input.art_rotation));
  }

  await db.tx(async (tx) => {
    if (sets.length) {
      sets.push("updated_at = ?");
      args.push(now);
      await tx.prepare(`UPDATE campaigns SET ${sets.join(", ")} WHERE id = ?`).run(...args, id);
    }

    if (input.art_x !== undefined || input.art_y !== undefined || input.art_w !== undefined || input.art_h !== undefined) {
      const art = clampRect({
        x: input.art_x ?? existing.art_x,
        y: input.art_y ?? existing.art_y,
        width: input.art_w ?? existing.art_w,
        height: input.art_h ?? existing.art_h,
      });
      await tx
        .prepare(`UPDATE campaigns SET art_x = ?, art_y = ?, art_w = ?, art_h = ? WHERE id = ?`)
        .run(art.x, art.y, art.width, art.height, id);
    }

    if (input.photoConfig) {
      const photo = normalizePhotoConfig(input.photoConfig);
      await tx
        .prepare(
          `UPDATE campaign_photo_configs
              SET enabled = ?, shape = ?, x = ?, y = ?, width = ?, height = ?, rotation = ?, updated_at = ?
            WHERE campaign_id = ?`
        )
        .run(photo.enabled ? 1 : 0, photo.shape, photo.x, photo.y, photo.width, photo.height, photo.rotation, now, id);
    }

    if (input.nameConfig) {
      const nameCfg = normalizeNameConfig(input.nameConfig);
      await tx
        .prepare(
          `UPDATE campaign_name_configs
              SET enabled = ?, x = ?, y = ?, width = ?, height = ?, rotation = ?,
                  font_family = ?, font_size = ?, font_color = ?, font_weight = ?,
                  alignment = ?, letter_spacing = ?, updated_at = ?
            WHERE campaign_id = ?`
        )
        .run(
          nameCfg.enabled ? 1 : 0,
          nameCfg.x,
          nameCfg.y,
          nameCfg.width,
          nameCfg.height,
          nameCfg.rotation,
          nameCfg.font_family,
          nameCfg.font_size,
          nameCfg.font_color,
          nameCfg.font_weight,
          nameCfg.alignment,
          nameCfg.letter_spacing,
          now,
          id
        );
    }
  });

  const updated = await getCampaignById(id);
  if (!updated) throw new Error("Campaign update failed");
  return updated;
}

export async function setCampaignStatus(
  id: string,
  status: CampaignStatus
): Promise<CampaignRow & { photoConfig: CampaignPhotoConfig | null; nameConfig: CampaignNameConfig | null }> {
  return updateCampaign(id, { status });
}

/** Deletes the row (configs/events cascade) and returns artwork keys to remove. */
export async function deleteCampaign(id: string): Promise<string | null> {
  const db = await getDb();
  const existing = (await db
    .prepare("SELECT artwork_key FROM campaigns WHERE id = ?")
    .get(id)) as { artwork_key: string | null } | undefined;
  if (!existing) throw new Error("Campaign not found");
  await db.tx(async (tx) => {
    await tx.prepare("DELETE FROM campaigns WHERE id = ?").run(id);
  });
  return existing.artwork_key;
}

/* ------------------------------------------------------------------ */
/* Artwork storage key                                                 */
/* ------------------------------------------------------------------ */

export function campaignArtworkKey(campaignId: string, ext: "png" | "jpg" | "webp"): string {
  return `campaigns/${campaignId}/artwork.${ext}`;
}

/* ------------------------------------------------------------------ */
/* Anonymous events + metrics                                          */
/* ------------------------------------------------------------------ */

export async function recordCampaignEvent(
  campaignId: string,
  eventType: CampaignEventType
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO campaign_events (id, campaign_id, event_type, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(`cev_${generateToken(12)}`, campaignId, eventType, nowIso());
}

export interface CampaignMetrics {
  total: number;
  byStatus: Record<CampaignStatus, number>;
  totalFrames: number;
  totalShares: number;
  sharesByType: Record<CampaignEventType, number>;
}

export async function campaignMetrics(): Promise<CampaignMetrics> {
  const db = await getDb();
  const statusRows = (await db
    .prepare("SELECT status, COUNT(*) AS n FROM campaigns GROUP BY status")
    .all()) as unknown as { status: string; n: number }[];
  const eventRows = (await db
    .prepare("SELECT event_type, COUNT(*) AS n FROM campaign_events GROUP BY event_type")
    .all()) as unknown as { event_type: string; n: number }[];

  const byStatus: Record<CampaignStatus, number> = {
    draft: 0,
    active: 0,
    paused: 0,
    archived: 0,
  };
  for (const r of statusRows) {
    if (CAMPAIGN_STATUSES.includes(r.status as CampaignStatus)) {
      byStatus[r.status as CampaignStatus] = Number(r.n) || 0;
    }
  }

  const sharesByType: Record<CampaignEventType, number> = {
    generate: 0,
    download: 0,
    whatsapp: 0,
    facebook: 0,
    instagram: 0,
    link: 0,
  };
  let totalFrames = 0;
  let totalShares = 0;
  for (const r of eventRows) {
    const n = Number(r.n) || 0;
    if (r.event_type === "generate") {
      totalFrames += n;
      sharesByType.generate += n;
    } else if ((CAMPAIGN_EVENT_TYPES as readonly string[]).includes(r.event_type)) {
      totalShares += n;
      sharesByType[r.event_type as CampaignEventType] += n;
    }
  }

  return {
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    byStatus,
    totalFrames,
    totalShares,
    sharesByType,
  };
}

/** Active campaigns for the sitemap. */
export async function activeCampaignSlugs(): Promise<{ slug: string; updated_at: string }[]> {
  const db = await getDb();
  const rows = (await db
    .prepare("SELECT slug, updated_at FROM campaigns WHERE status = 'active' ORDER BY updated_at DESC")
    .all()) as unknown as { slug: string; updated_at: string }[];
  return rows;
}

/** Districts actually in use — powers the admin list filter. */
export async function distinctDistricts(): Promise<string[]> {
  const db = await getDb();
  const rows = (await db
    .prepare(
      "SELECT DISTINCT district FROM campaigns WHERE district IS NOT NULL AND district != '' ORDER BY district"
    )
    .all()) as unknown as { district: string }[];
  return rows.map((r) => r.district);
}
