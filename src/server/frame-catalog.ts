/**
 * Frame catalogue — the DB override layer over the code frame artwork.
 *
 * Artwork/geometry lives in src/lib/frames.ts (versioned with the code, never in
 * the database). Everything an admin can manage — description, category, tags,
 * featured, active — lives in `frame_overrides`, one row per edited frame.
 *
 * Consequences:
 *  - adding a frame = adding one object to FRAMES, nothing else
 *  - editing a frame needs no deploy
 *  - deleting an override row restores the code defaults
 */

import { getDb, nowIso } from "./db";
import {
  OCCASIONS,
  DEFAULT_OCCASION,
  codeMeta,
  getAllFrames,
  getFrame,
  resolveFrameSlug,
  getAvailableOccasions,
  toCatalogFrame,
  type CatalogFrame,
  type Frame,
  type Occasion,
} from "@/lib/frames";
import { cleanMultiline, cleanText } from "./validation";

interface OverrideRow {
  frame_id: string;
  description: string | null;
  category: string | null;
  tags: string | null;
  featured: number | boolean | string | null;
  active: number | boolean | string | null;
  updated_at: string;
}

function toOptionalBool(val: unknown): boolean | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val === 1;
  if (typeof val === "string") {
    const norm = val.trim().toLowerCase();
    if (norm === "1" || norm === "true") return true;
    if (norm === "0" || norm === "false") return false;
  }
  return undefined;
}

async function overrides(): Promise<Map<string, OverrideRow>> {
  const db = await getDb();
  const rows = (await db
    .prepare("SELECT * FROM frame_overrides")
    .all()) as OverrideRow[];
  const map = new Map<string, OverrideRow>();
  for (const r of rows) {
    map.set(r.frame_id, r);
    const canonical = resolveFrameSlug(r.frame_id);
    if (canonical && !map.has(canonical)) {
      map.set(canonical, r);
    }
  }
  return map;
}

function parseTags(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const cleaned = parsed
      .filter((t): t is string => typeof t === "string")
      .map((t) => cleanText(t, 24))
      .filter(Boolean)
      .slice(0, 8);
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}

function merge(frame: Frame, row?: OverrideRow): CatalogFrame {
  if (!row) return toCatalogFrame(frame);
  const tags = parseTags(row.tags);
  const cleanCat = row.category ? cleanText(row.category, 40) : "";
  const cleanDesc = row.description ? cleanMultiline(row.description, 320) : "";
  return toCatalogFrame(frame, {
    active: toOptionalBool(row.active),
    featured: toOptionalBool(row.featured),
    description: cleanDesc || undefined,
    category: (cleanCat as Occasion) || undefined,
    tags: tags ?? undefined,
    updated_at: row.updated_at,
    overridden: true,
  });
}

/** Every frame, including inactive ones (admin view). */
export async function getCatalog(): Promise<CatalogFrame[]> {
  const rows = await overrides();
  return getAllFrames().map((f) => merge(f, rows.get(f.slug) ?? rows.get(f.id)));
}

/** Public gallery: active frames only. */
export async function getPublicFrames(): Promise<CatalogFrame[]> {
  return (await getCatalog()).filter((f) => f.active !== false);
}

/** Homepage rail. Falls back to `trending` flags when nothing is featured. */
export async function getFeaturedFrames(limit = 4): Promise<CatalogFrame[]> {
  const active = await getPublicFrames();
  const featured = active.filter((f) => f.featured);
  return (featured.length ? featured : active.filter((f) => f.trending)).slice(
    0,
    limit
  );
}

/** Merged frame by slug — undefined for unknown or (optionally) inactive frames. */
export async function findFrame(
  slug: string,
  opts: { includeInactive?: boolean } = {}
): Promise<CatalogFrame | undefined> {
  const base = getFrame(slug);
  if (!base) return undefined;
  const rows = await overrides();
  const merged = merge(base, rows.get(base.slug) ?? rows.get(base.id));
  if (!opts.includeInactive && !merged.active) return undefined;
  return merged;
}

/** Merged frame for editor/gallery use where an inactive frame is still valid. */
export async function findAnyFrame(slug: string): Promise<CatalogFrame | undefined> {
  return findFrame(slug, { includeInactive: true });
}

/* ------------------------------------------------------------------ */
/* Admin mutations (callers must already have checked the admin role)  */
/* ------------------------------------------------------------------ */

export interface FramePatch {
  description?: string;
  category?: string;
  tags?: string[];
  featured?: boolean;
  active?: boolean;
}

export async function updateFrame(
  slug: string,
  patch: FramePatch,
  adminId: string
): Promise<CatalogFrame | null> {
  const base = getFrame(slug);
  if (!base) return null;

  const canonicalSlug = base.slug;
  const validCategories = new Set<string>([
    ...OCCASIONS,
    ...getAvailableOccasions(),
    DEFAULT_OCCASION,
  ]);

  const db = await getDb();
  const rows = await overrides();
  const current = rows.get(canonicalSlug) ?? rows.get(base.id);
  const defaults = codeMeta(base);

  const cleanedTags =
    patch.tags !== undefined
      ? patch.tags
          .map((t) => cleanText(t, 24))
          .filter(Boolean)
          .slice(0, 8)
      : null;

  const currentActive = toOptionalBool(current?.active);
  const currentFeatured = toOptionalBool(current?.featured);

  const next = {
    description:
      patch.description === undefined
        ? (current?.description ?? null)
        : cleanMultiline(patch.description, 320) || null,
    category:
      patch.category === undefined
        ? (current?.category ?? null)
        : validCategories.has(patch.category)
          ? patch.category
          : (current?.category ?? null),
    tags:
      patch.tags === undefined
        ? (current?.tags ?? null)
        : cleanedTags && cleanedTags.length > 0
          ? JSON.stringify(cleanedTags)
          : null,
    featured:
      patch.featured === undefined
        ? currentFeatured === undefined
          ? null
          : currentFeatured
            ? 1
            : 0
        : patch.featured
          ? 1
          : 0,
    active:
      patch.active === undefined
        ? currentActive === undefined
          ? null
          : currentActive
            ? 1
            : 0
        : patch.active
          ? 1
          : 0,
  };

  // If every value matches the code default, drop the override row entirely so
  // the catalogue stays clean and future code changes flow through.
  const matchesDefaults =
    (next.description === null || next.description === defaults.description) &&
    (next.category === null || next.category === defaults.category) &&
    (next.featured === null || (next.featured === 1) === defaults.featured) &&
    (next.active === null || (next.active === 1) === defaults.active) &&
    next.tags === null;

  if (matchesDefaults) {
    await db
      .prepare("DELETE FROM frame_overrides WHERE frame_id = ? OR frame_id = ?")
      .run(canonicalSlug, base.id);
  } else {
    await db
      .prepare(
        `INSERT INTO frame_overrides (frame_id, description, category, tags, featured, active, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(frame_id) DO UPDATE SET
         description = excluded.description,
         category    = excluded.category,
         tags        = excluded.tags,
         featured    = excluded.featured,
         active      = excluded.active,
         updated_at  = excluded.updated_at,
         updated_by  = excluded.updated_by`
      )
      .run(
        canonicalSlug,
        next.description,
        next.category,
        next.tags,
        next.featured,
        next.active,
        nowIso(),
        adminId
      );
  }

  return (await findFrame(canonicalSlug, { includeInactive: true })) ?? null;
}

/* ------------------------------------------------------------------ */
/* Site settings (key/value, admin-managed)                             */
/* ------------------------------------------------------------------ */

export interface SiteSettings {
  hero_tagline: string;
  featured_limit: number;
}

const SETTING_DEFAULTS: SiteSettings = {
  hero_tagline: "Find your balance, frame by frame",
  featured_limit: 4,
};

export async function getSettings(): Promise<SiteSettings> {
  const db = await getDb();
  const rows = (await db
    .prepare("SELECT key, value FROM settings WHERE key IN ('hero_tagline','featured_limit')")
    .all()) as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const limit = Number(map.get("featured_limit"));
  return {
    hero_tagline: map.get("hero_tagline") || SETTING_DEFAULTS.hero_tagline,
    featured_limit:
      Number.isFinite(limit) && limit > 0 && limit <= 8
        ? Math.floor(limit)
        : SETTING_DEFAULTS.featured_limit,
  };
}

export async function setSettings(
  patch: Partial<SiteSettings>,
  adminId: string
): Promise<SiteSettings> {
  const db = await getDb();
  const now = nowIso();

  // Both settings writes land together or not at all — tx receives a Db bound
  // to the transaction connection (BEGIN/COMMIT on SQLite, pooled client on pg).
  await db.tx(async (tx) => {
    const write = async (key: string, value: string) =>
      tx
        .prepare(
          `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value,
             updated_at = excluded.updated_at, updated_by = excluded.updated_by`
        )
        .run(key, value, now, adminId);

    if (patch.hero_tagline !== undefined) {
      await write("hero_tagline", cleanText(patch.hero_tagline, 120));
    }
    if (patch.featured_limit !== undefined) {
      const n = Number(patch.featured_limit);
      await write("featured_limit", String(Math.min(8, Math.max(1, Math.floor(n) || 4))));
    }
  });
  return getSettings();
}

/** Featured frame slugs, used by the homepage rail. */
export async function featuredSlugs(): Promise<string[]> {
  return (await getFeaturedFrames(8)).map((f) => f.slug);
}
