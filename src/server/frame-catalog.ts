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
  FRAMES,
  OCCASIONS,
  codeMeta,
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
  featured: number | null;
  active: number | null;
  updated_at: string;
}

function overrides(): Map<string, OverrideRow> {
  const rows = getDb()
    .prepare("SELECT * FROM frame_overrides")
    .all() as OverrideRow[];
  return new Map(rows.map((r) => [r.frame_id, r]));
}

function parseTags(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((t): t is string => typeof t === "string")
      .map((t) => cleanText(t, 24))
      .filter(Boolean)
      .slice(0, 8);
  } catch {
    return null;
  }
}

function merge(frame: Frame, row?: OverrideRow): CatalogFrame {
  if (!row) return toCatalogFrame(frame);
  const tags = parseTags(row.tags);
  return toCatalogFrame(frame, {
    active: row.active === null ? undefined : row.active === 1,
    featured: row.featured === null ? undefined : row.featured === 1,
    description: row.description ? cleanMultiline(row.description, 320) : undefined,
    category: (row.category as Occasion) ?? undefined,
    tags: tags ?? undefined,
    updated_at: row.updated_at,
    overridden: true,
  });
}

/** Every frame, including inactive ones (admin view). */
export function getCatalog(): CatalogFrame[] {
  const rows = overrides();
  return FRAMES.map((f) => merge(f, rows.get(f.slug)));
}

/** Public gallery: active frames only. */
export function getPublicFrames(): CatalogFrame[] {
  return getCatalog().filter((f) => f.active);
}

/** Homepage rail. Falls back to `trending` flags when nothing is featured. */
export function getFeaturedFrames(limit = 4): CatalogFrame[] {
  const active = getPublicFrames();
  const featured = active.filter((f) => f.featured);
  return (featured.length ? featured : active.filter((f) => f.trending)).slice(
    0,
    limit
  );
}

/** Merged frame by slug — undefined for unknown or (optionally) inactive frames. */
export function findFrame(
  slug: string,
  opts: { includeInactive?: boolean } = {}
): CatalogFrame | undefined {
  const base = FRAMES.find((f) => f.slug === slug);
  if (!base) return undefined;
  const merged = merge(base, overrides().get(base.slug));
  if (!opts.includeInactive && !merged.active) return undefined;
  return merged;
}

/** Merged frame for editor/gallery use where an inactive frame is still valid. */
export function findAnyFrame(slug: string): CatalogFrame | undefined {
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

const VALID_CATEGORIES = new Set<string>(OCCASIONS);

export function updateFrame(
  slug: string,
  patch: FramePatch,
  adminId: string
): CatalogFrame | null {
  const base = FRAMES.find((f) => f.slug === slug);
  if (!base) return null;

  const db = getDb();
  const current = overrides().get(slug);
  const defaults = codeMeta(base);

  const next = {
    description:
      patch.description === undefined
        ? (current?.description ?? null)
        : cleanMultiline(patch.description, 320) || null,
    category:
      patch.category === undefined
        ? (current?.category ?? null)
        : VALID_CATEGORIES.has(patch.category)
          ? patch.category
          : (current?.category ?? null),
    tags:
      patch.tags === undefined
        ? (current?.tags ?? null)
        : JSON.stringify(
            patch.tags.map((t) => cleanText(t, 24)).filter(Boolean).slice(0, 8)
          ),
    featured:
      patch.featured === undefined
        ? (current?.featured ?? null)
        : patch.featured
          ? 1
          : 0,
    active:
      patch.active === undefined ? (current?.active ?? null) : patch.active ? 1 : 0,
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
    db.prepare("DELETE FROM frame_overrides WHERE frame_id = ?").run(slug);
  } else {
    db.prepare(
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
    ).run(
      slug,
      next.description,
      next.category,
      next.tags,
      next.featured,
      next.active,
      nowIso(),
      adminId
    );
  }

  return findFrame(slug, { includeInactive: true }) ?? null;
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

export function getSettings(): SiteSettings {
  const rows = getDb()
    .prepare("SELECT key, value FROM settings WHERE key IN ('hero_tagline','featured_limit')")
    .all() as { key: string; value: string }[];
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

export function setSettings(patch: Partial<SiteSettings>, adminId: string): SiteSettings {
  const db = getDb();
  const now = nowIso();
  const write = (key: string, value: string) =>
    db
      .prepare(
        `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
           updated_at = excluded.updated_at, updated_by = excluded.updated_by`
      )
      .run(key, value, now, adminId);

  if (patch.hero_tagline !== undefined) {
    write("hero_tagline", cleanText(patch.hero_tagline, 120));
  }
  if (patch.featured_limit !== undefined) {
    const n = Number(patch.featured_limit);
    write("featured_limit", String(Math.min(8, Math.max(1, Math.floor(n) || 4))));
  }
  return getSettings();
}

/** Featured frame slugs, used by the homepage rail. */
export function featuredSlugs(): string[] {
  return getFeaturedFrames(8).map((f) => f.slug);
}
