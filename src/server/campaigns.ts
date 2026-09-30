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
import { getStorage, putImage } from "./storage";
import {
  cleanDecimal,
  cleanText,
  contentTypeFor,
  extensionFor,
  imageMime,
  parseDataUrl,
  roundDec,
} from "./validation";

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
  line_height?: number;
  text_scale?: number;
  text_opacity?: number;
}

/* ------------------------------------------------------------------ */
/* Geometry helpers — percentages of the canvas, always clamped        */
/* ------------------------------------------------------------------ */

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Coordinates are percentages of the canvas. Some sources stored raw pixels;
 * anything above 100 is interpreted as pixels and converted. Auto-heals so
 * one bad row can never break a composition. Preserves decimal precision.
 */
export function normalizeCoord(value: unknown, total: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n > 100) return roundDec(clamp((n / total) * 100, 0, 100), 4);
  return roundDec(clamp(n, 0, 100), 4);
}

/** Clamps a geometry rect into sane bounds (percent coords, 4% min size). */
export function clampRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const width = clamp(roundDec(Number(rect.width) || 0, 4), 4, 100);
  const height = clamp(roundDec(Number(rect.height) || 0, 4), 4, 100);
  const x = clamp(roundDec(Number(rect.x) || 0, 4), 0, roundDec(100 - width, 4));
  const y = clamp(roundDec(Number(rect.y) || 0, 4), 0, roundDec(100 - height, 4));
  return { x, y, width, height };
}

const CLAMPED_ROTATION = (v: unknown) => cleanDecimal(v, -180, 180, 0, 4);

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
    x: Number.isFinite(Number(raw.x)) && raw.x !== "" && raw.x != null ? Number(raw.x) : 30,
    y: Number.isFinite(Number(raw.y)) && raw.y !== "" && raw.y != null ? Number(raw.y) : 35,
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

/** Normalizes a name config payload from an admin request, preserving decimal typography values. */
export function normalizeNameConfig(input: unknown): CampaignNameConfig {
  const raw = (input ?? {}) as Record<string, unknown>;
  const rect = clampRect({
    x: Number.isFinite(Number(raw.x)) && raw.x !== "" && raw.x != null ? Number(raw.x) : 20,
    y: Number.isFinite(Number(raw.y)) && raw.y !== "" && raw.y != null ? Number(raw.y) : 78,
    width: Number(raw.width) || 60,
    height: Number(raw.height) || 12,
  });
  const alignment = String(raw.alignment);
  return {
    enabled: Boolean(raw.enabled),
    ...rect,
    rotation: CLAMPED_ROTATION(raw.rotation),
    font_family: cleanText(raw.font_family, 60) || "Plus Jakarta Sans",
    font_size: cleanDecimal(raw.font_size, 6, 120, 26, 4),
    font_color: cleanColor(raw.font_color, "#fff8f0"),
    font_weight: raw.font_weight === "normal" ? "normal" : "bold",
    alignment:
      alignment === "left" || alignment === "right" ? (alignment as CampaignNameConfig["alignment"]) : "center",
    letter_spacing: cleanDecimal(raw.letter_spacing, -5, 24, 1, 4),
    line_height: cleanDecimal(raw.line_height, 0.5, 4, 1.2, 4),
    text_scale: cleanDecimal(raw.text_scale, 0.25, 3, 1, 4),
    text_opacity: cleanDecimal(raw.text_opacity, 0, 1, 1, 4),
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
  line_height: number | null;
  text_scale: number | null;
  text_opacity: number | null;
}

const CAMPAIGN_SELECT = `
  SELECT c.id, c.name, c.slug, c.district, c.description, c.status,
         COALESCE(c.artwork_key, CASE WHEN c.artwork_data IS NOT NULL OR c.status = 'active' THEN 'db-inline' ELSE NULL END) AS artwork_key,
         c.artwork_mime, c.artwork_bytes,
         c.canvas_width, c.canvas_height,
         c.art_x, c.art_y, c.art_w, c.art_h, c.art_rotation,
         c.created_by, c.activated_at, c.created_at, c.updated_at,
         p.enabled  AS p_enabled, p.shape  AS p_shape, p.x AS p_x, p.y AS p_y,
         p.width    AS p_w,       p.height AS p_h,     p.rotation AS p_rot,
         n.enabled  AS n_enabled, n.x      AS n_x, n.y AS n_y,
         n.width    AS n_w,       n.height AS n_h,     n.rotation AS n_rot,
         n.font_family AS font_family, n.font_size AS font_size,
         n.font_color  AS font_color,  n.font_weight AS font_weight,
         n.alignment   AS alignment,   n.letter_spacing AS letter_spacing,
         n.line_height AS line_height, n.text_scale AS text_scale,
         n.text_opacity AS text_opacity
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
    art_x: Number(row.art_x),
    art_y: Number(row.art_y),
    art_w: Number(row.art_w),
    art_h: Number(row.art_h),
    art_rotation: Number(row.art_rotation),
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
          line_height: row.line_height != null ? Number(row.line_height) : 1.2,
          text_scale: row.text_scale != null ? Number(row.text_scale) : 1,
          text_opacity: row.text_opacity != null ? Number(row.text_opacity) : 1,
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
            font_color, font_weight, alignment, letter_spacing, line_height, text_scale, text_opacity, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        nameCfg.line_height ?? 1.2,
        nameCfg.text_scale ?? 1,
        nameCfg.text_opacity ?? 1,
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
                  alignment = ?, letter_spacing = ?, line_height = ?, text_scale = ?,
                  text_opacity = ?, updated_at = ?
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
          nameCfg.line_height ?? 1.2,
          nameCfg.text_scale ?? 1,
          nameCfg.text_opacity ?? 1,
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

function escapeXml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildFallbackCampaignSvg(
  campaign: CampaignRow & { photoConfig?: CampaignPhotoConfig | null }
): string {
  const W = Math.max(400, Number(campaign.canvas_width) || 1080);
  const H = Math.max(400, Number(campaign.canvas_height) || 1350);
  const p = campaign.photoConfig;
  const px = p?.enabled ? Math.round((W * Number(p.x || 30)) / 100) : Math.round(W * 0.2);
  const py = p?.enabled ? Math.round((H * Number(p.y || 35)) / 100) : Math.round(H * 0.24);
  const pw = p?.enabled ? Math.round((W * Number(p.width || 40)) / 100) : Math.round(W * 0.6);
  const ph = p?.enabled ? Math.round((H * Number(p.height || 30)) / 100) : Math.round(H * 0.48);
  const title = escapeXml(campaign.name || "ZenFrame Campaign");
  const sub = escapeXml(campaign.district || campaign.description || "Mindful Photo Frame");

  // Even-odd path cuts a 100% transparent window where the user photo sits so
  // the user's photo always shines through while decorative borders sit above.
  const holePath =
    p?.enabled && p.shape === "circle"
      ? (() => {
          const cx = px + pw / 2;
          const cy = py + ph / 2;
          const r = Math.min(pw, ph) / 2;
          return `M0,0 H${W} V${H} H0 Z M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 -${r * 2},0 Z`;
        })()
      : `M0,0 H${W} V${H} H0 Z M${px},${py} H${px + pw} V${py + ph} H${px} Z`;

  const borderShape =
    p?.enabled && p.shape === "circle"
      ? `<circle cx="${px + pw / 2}" cy="${py + ph / 2}" r="${Math.min(pw, ph) / 2}" fill="none" stroke="#ff7e47" stroke-width="8"/>`
      : `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="24" fill="none" stroke="#ff7e47" stroke-width="8"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="cBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff4e3"/>
      <stop offset="100%" stop-color="#ffd5b8"/>
    </linearGradient>
  </defs>
  <path d="${holePath}" fill="url(#cBg)" fill-rule="evenodd"/>
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="36" fill="none" stroke="#e56028" stroke-width="6" stroke-opacity="0.7"/>
  <rect x="46" y="46" width="${W - 92}" height="${H - 92}" rx="28" fill="none" stroke="#f0b429" stroke-width="2.5" stroke-dasharray="10 8" stroke-opacity="0.75"/>
  ${borderShape}
  <text x="${W / 2}" y="${Math.max(110, Math.round(py * 0.52))}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="${Math.round(W * 0.045)}" font-weight="800" fill="#17232b">${title}</text>
  <text x="${W / 2}" y="${Math.max(155, Math.round(py * 0.52) + Math.round(W * 0.038))}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="${Math.round(W * 0.025)}" font-weight="600" fill="#e56028" letter-spacing="3">${sub.toUpperCase()}</text>
  <text x="${W / 2}" y="${H - 60}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="${Math.round(W * 0.02)}" font-weight="700" fill="#0d4a52" letter-spacing="4">ZENFRAME STUDIO</text>
</svg>`;
}

/**
 * Resolves campaign artwork bytes across all storage engines:
 *   1. Primary storage driver (Vercel Blob or local disk)
 *   2. Database inline fallback (`campaigns.artwork_data`) for serverless cold starts
 *   3. High-resolution SVG frame fallback if a pre-migration row lost its `/tmp` file
 */
export async function resolveCampaignArtwork(
  campaign: CampaignRow & { photoConfig?: CampaignPhotoConfig | null }
): Promise<{ buf: Buffer; mime: string } | null> {
  if (!campaign.artwork_key) return null;

  // 1. Primary storage driver
  if (campaign.artwork_key !== "db-inline") {
    const stored = await getStorage().get(campaign.artwork_key);
    if (stored && stored.length > 0) {
      return { buf: stored, mime: campaign.artwork_mime ?? "image/png" };
    }
  }

  // 2. Database `artwork_data` fallback (survives serverless `/tmp` resets)
  try {
    const db = await getDb();
    const row = (await db
      .prepare("SELECT artwork_data, artwork_mime, artwork_key FROM campaigns WHERE id = ?")
      .get(campaign.id)) as
      | { artwork_data?: string | null; artwork_mime?: string | null; artwork_key?: string | null }
      | undefined;

    if (row?.artwork_data) {
      const parsed = parseDataUrl(row.artwork_data, 16 * 1024 * 1024);
      if (parsed && parsed.buf.length > 0) {
        const detected = imageMime(parsed.buf) ?? "png";
        const mime = row.artwork_mime ?? contentTypeFor(detected);
        const key =
          row.artwork_key && row.artwork_key !== "db-inline"
            ? row.artwork_key
            : campaignArtworkKey(campaign.id, extensionFor(detected));
        await putImage(key, parsed.buf).catch(() => {});
        if (!row.artwork_key) {
          await db
            .prepare("UPDATE campaigns SET artwork_key = ?, artwork_mime = ?, artwork_bytes = ? WHERE id = ?")
            .run(key, mime, parsed.buf.length, campaign.id)
            .catch(() => {});
        }
        return { buf: parsed.buf, mime };
      }
    }
  } catch {
    /* continue to SVG fallback */
  }

  // 3. Pre-migration campaign whose ephemeral `/tmp` file was lost
  const svg = buildFallbackCampaignSvg(campaign);
  return { buf: Buffer.from(svg, "utf8"), mime: "image/svg+xml" };
}

