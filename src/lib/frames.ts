/**
 * ZenFrame frame engine & centralized frame registry.
 *
 * Single source of truth for:
 *   - Gallery (/frames)
 *   - Search & Category/Occasion Filters (GalleryGrid)
 *   - Frame Editor (/frames/[slug] & FrameEditor)
 *   - Featured & Trending frames (HomePage)
 *   - Public / Shared frames (/s/[slug], /creations/[id])
 *   - SEO Metadata, OpenGraph images (/frames/[slug]/og) & Sitemap (/sitemap.xml)
 *
 * Every frame is built from three composable layers, rendered as pure SVG:
 *   1. backdrop — soft gradient wash + optional decorative marks (mandala spokes, sun rays)
 *   2. photo    — the user's uploaded image, clipped to a portrait/square window
 *   3. overlay  — occasion art (lotus, sun, chakra petals, incense…), occasion title,
 *                 brand wordmark, and user caption
 *
 * All original artwork. 1000 x 1250 (4:5) canvas — ideal for IG posts/stories.
 */

export const BASE_OCCASIONS = [
  "Morning Flow",
  "Yoga Day",
  "Meditation",
  "Sunset Flow",
  "Breathwork",
  "Mindfulness",
] as const;

export type BaseOccasion = (typeof BASE_OCCASIONS)[number];
export type Occasion = BaseOccasion | "General" | (string & {});

export const DEFAULT_OCCASION: Occasion = "General";

export const OCCASIONS: Occasion[] = [...BASE_OCCASIONS];

export type FrameMotif =
  | "rays"
  | "mandala"
  | "petals"
  | "rings"
  | "bubbles"
  | "mountains";

export type FrameArt =
  | "lotus"
  | "sun"
  | "om"
  | "chakra"
  | "candle"
  | "incense"
  | "waves"
  | "moon";

export interface FrameStyle {
  /** gradient stops for the backdrop, [start, end] */
  from: string;
  to: string;
  /** accent color for rings / petals / rays */
  accent: string;
  /** deep tone for title text */
  ink: string;
  /** backdrop decoration motif */
  motif: FrameMotif;
}

export interface FrameNumericSettings {
  font_family: string;
  font_size: number;
  line_height: number;
  letter_spacing: number;
  text_scale: number;
  text_x: number;
  text_y: number;
  text_width: number;
  text_opacity: number;
  photo_scale: number;
  border_opacity: number;
}

export const DEFAULT_FRAME_SETTINGS: FrameNumericSettings = {
  font_family: "Fraunces",
  font_size: 34,
  line_height: 1.2,
  letter_spacing: 1,
  text_scale: 1,
  text_x: 50,
  text_y: 76,
  text_width: 80,
  text_opacity: 0.85,
  photo_scale: 1,
  border_opacity: 0.9,
};

function roundNum(v: number, decimals = 4): number {
  if (!Number.isFinite(v)) return 0;
  const factor = 10 ** decimals;
  return Math.round((v + Number.EPSILON) * factor) / factor;
}

function clampDecimal(
  val: unknown,
  min: number,
  max: number,
  fallback: number,
  decimals = 4
): number {
  if (val === null || val === undefined || val === "") return fallback;
  const n = typeof val === "number" ? val : Number(String(val).trim());
  if (!Number.isFinite(n)) return fallback;
  return roundNum(Math.min(max, Math.max(min, n)), decimals);
}

export function normalizeFrameSettings(
  input?: Partial<FrameNumericSettings> | null,
  fallback: FrameNumericSettings = DEFAULT_FRAME_SETTINGS
): FrameNumericSettings {
  const raw = input ?? {};
  const fontFamily =
    typeof raw.font_family === "string" && raw.font_family.trim()
      ? raw.font_family.trim().slice(0, 60)
      : fallback.font_family;
  return {
    font_family: fontFamily,
    font_size: clampDecimal(raw.font_size, 6, 120, fallback.font_size),
    line_height: clampDecimal(raw.line_height, 0.5, 4, fallback.line_height),
    letter_spacing: clampDecimal(raw.letter_spacing, -5, 20, fallback.letter_spacing),
    text_scale: clampDecimal(raw.text_scale, 0.25, 4, fallback.text_scale),
    text_x: clampDecimal(raw.text_x, 0, 100, fallback.text_x),
    text_y: clampDecimal(raw.text_y, 0, 100, fallback.text_y),
    text_width: clampDecimal(raw.text_width, 10, 100, fallback.text_width),
    text_opacity: clampDecimal(raw.text_opacity, 0, 1, fallback.text_opacity),
    photo_scale: clampDecimal(raw.photo_scale, 0.25, 4, fallback.photo_scale),
    border_opacity: clampDecimal(raw.border_opacity, 0, 1, fallback.border_opacity),
  };
}

export interface Frame {
  id: string;
  slug: string;
  title: string;
  /** category — mirrors occasion, defaults to "General" when metadata is missing */
  category?: Occasion;
  occasion: Occasion;
  tagline: string;
  /** long description for detail/OG metadata (defaults to tagline) */
  description?: string;
  /** search tags (defaults to [category, occasion, art, motif]) */
  tags?: string[];
  trending?: boolean;
  active?: boolean;
  featured?: boolean;
  style: FrameStyle;
  /** which center art the overlay draws */
  art: FrameArt;
  /** typography and numerical layout settings */
  settings?: FrameNumericSettings;
  /** alternate slugs/IDs that resolve to this frame */
  aliases?: string[];
  /** true when category/occasion was missing and defaulted to General */
  hasMissingMetadata?: boolean;
}

/** Input contract when adding a new frame — only title/slug + minimal fields needed. */
export interface FrameInput {
  id?: string;
  slug?: string;
  title: string;
  category?: Occasion | string;
  occasion?: Occasion | string;
  tagline?: string;
  description?: string;
  tags?: string[];
  trending?: boolean;
  active?: boolean;
  featured?: boolean;
  style?: Partial<FrameStyle>;
  art?: FrameArt | string;
  settings?: Partial<FrameNumericSettings>;
  aliases?: string[];
}

export const DEFAULT_FRAME_STYLE: FrameStyle = {
  from: "#FFE9C7",
  to: "#FFD3A3",
  accent: "#F59E0B",
  ink: "#92400E",
  motif: "rays",
};

const VALID_MOTIFS = new Set<FrameMotif>([
  "rays",
  "mandala",
  "petals",
  "rings",
  "bubbles",
  "mountains",
]);

const VALID_ARTS = new Set<FrameArt>([
  "lotus",
  "sun",
  "om",
  "chakra",
  "candle",
  "incense",
  "waves",
  "moon",
]);

/** Converts any string into a canonical URL-safe lowercase slug. */
export function normalizeSlug(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/['’"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Derived, overridable metadata — never returns undefined or empty values. */
export const frameCategory = (f: Partial<Frame> | undefined): Occasion => {
  const raw = (f?.category ?? f?.occasion ?? "").toString().trim();
  return (raw || DEFAULT_OCCASION) as Occasion;
};

export const frameDescription = (f: Partial<Frame> | undefined): string => {
  const desc = (f?.description ?? "").toString().trim();
  if (desc) return desc;
  const tagline = (f?.tagline ?? f?.title ?? "Mindful yoga practice").toString().trim();
  return `${tagline}. A hand-crafted yoga photo frame by ZenFrame.`;
};

export const frameTags = (f: Partial<Frame> | undefined): string[] => {
  const custom = Array.isArray(f?.tags)
    ? f.tags.map((t) => String(t ?? "").trim()).filter(Boolean)
    : [];
  if (custom.length > 0) return Array.from(new Set(custom));
  const cat = frameCategory(f);
  const occ = (f?.occasion ?? "").toString().trim() || cat;
  const art = (f?.art ?? "lotus").toString().trim();
  const motif = (f?.style?.motif ?? "").toString().trim();
  return Array.from(new Set([cat, occ, art, motif].filter(Boolean)));
};

/* ------------------------------------------------------------------ */
/* Catalogue metadata                                                  */
/* ------------------------------------------------------------------ */

/**
 * Everything about a frame that admins can manage. The artwork itself always
 * comes from code (this file) — only the metadata below can be overridden, so a
 * frame can never be broken from the admin UI.
 */
export interface FrameMeta {
  /** Inactive frames stay in the catalogue but disappear from the gallery. */
  active: boolean;
  featured: boolean;
  description: string;
  category: Occasion;
  tags: string[];
  settings: FrameNumericSettings;
  updated_at?: string;
  /** true when an admin override row exists for this frame */
  overridden?: boolean;
}

export type CatalogFrame = Frame & FrameMeta;

export const frameSettings = (f: Partial<Frame> | undefined): FrameNumericSettings =>
  normalizeFrameSettings(f?.settings, DEFAULT_FRAME_SETTINGS);

/** Code defaults for a frame, before any admin override is merged in. */
export function codeMeta(f: Frame): FrameMeta {
  return {
    active: f.active !== false,
    featured: f.featured === true || f.trending === true,
    description: frameDescription(f),
    category: frameCategory(f),
    tags: frameTags(f),
    settings: frameSettings(f),
  };
}

export function toCatalogFrame(f: Frame, meta?: Partial<FrameMeta>): CatalogFrame {
  const base = codeMeta(f);
  const mergedCategory =
    meta?.category && String(meta.category).trim()
      ? (String(meta.category).trim() as Occasion)
      : base.category;
  const mergedTags =
    Array.isArray(meta?.tags) && meta.tags.length > 0 ? meta.tags : base.tags;
  const mergedDescription =
    meta?.description && String(meta.description).trim()
      ? String(meta.description).trim()
      : base.description;
  const mergedSettings = normalizeFrameSettings(meta?.settings, base.settings);

  return {
    ...f,
    ...base,
    ...meta,
    active: meta?.active !== undefined ? Boolean(meta.active) : base.active,
    featured: meta?.featured !== undefined ? Boolean(meta.featured) : base.featured,
    category: mergedCategory,
    occasion: f.occasion || mergedCategory,
    description: mergedDescription,
    tags: mergedTags,
    settings: mergedSettings,
  };
}

const BRAND = "ZENFRAME";

/* ------------------------------------------------------------------ */
/* Raw Frame Definitions (Single Place to Add New Frames)              */
/* ------------------------------------------------------------------ */

const RAW_FRAMES: FrameInput[] = [
  {
    id: "f-sunrise-salutation",
    slug: "sunrise-salutation",
    title: "Sunrise Salutation",
    occasion: "Morning Flow",
    tagline: "Greet the day with golden light",
    trending: true,
    style: { from: "#FFE9C7", to: "#FFD3A3", accent: "#F59E0B", ink: "#92400E", motif: "rays" },
    art: "sun",
  },
  {
    id: "f-iyd-2026",
    slug: "international-yoga-day",
    title: "International Yoga Day",
    occasion: "Yoga Day",
    tagline: "June 21 — one breath, one world",
    trending: true,
    style: { from: "#D9F3E3", to: "#B9E8D0", accent: "#059669", ink: "#065F46", motif: "mandala" },
    art: "lotus",
  },
  {
    id: "f-still-lake",
    slug: "still-lake-meditation",
    title: "Still Lake Meditation",
    occasion: "Meditation",
    tagline: "Be still. The water clears itself",
    style: { from: "#D7EEF2", to: "#BFE2EA", accent: "#0F766E", ink: "#134E4A", motif: "rings" },
    art: "waves",
  },
  {
    id: "f-amber-hour",
    slug: "amber-hour-flow",
    title: "Amber Hour Flow",
    occasion: "Sunset Flow",
    tagline: "Sunset salutations and soft light",
    trending: true,
    style: { from: "#FFE0D1", to: "#FFC5B5", accent: "#FF7E67", ink: "#9A3412", motif: "rays" },
    art: "sun",
  },
  {
    id: "f-breath-of-jade",
    slug: "breath-of-jade",
    title: "Breath of Jade",
    occasion: "Breathwork",
    tagline: "Inhale calm, exhale clutter",
    style: { from: "#DFF5E9", to: "#C4EDD8", accent: "#10B981", ink: "#065F46", motif: "bubbles" },
    art: "om",
  },
  {
    id: "f-lotus-heart",
    slug: "lotus-heart",
    title: "Lotus Heart",
    occasion: "Meditation",
    tagline: "Open the heart, one petal at a time",
    style: { from: "#FDE7F1", to: "#F9CFE3", accent: "#F472B6", ink: "#9D174D", motif: "petals" },
    art: "lotus",
  },
  {
    id: "f-morning-mandala",
    slug: "morning-mandala",
    title: "Morning Mandala",
    occasion: "Morning Flow",
    tagline: "Begin in symmetry, end in stillness",
    style: { from: "#FFF3D6", to: "#FFE6B8", accent: "#E9B44C", ink: "#92400E", motif: "mandala" },
    art: "chakra",
  },
  {
    id: "f-golden-vinyasa",
    slug: "golden-vinyasa",
    title: "Golden Vinyasa",
    occasion: "Sunset Flow",
    tagline: "Move with the glow of dusk",
    style: { from: "#FFE9C7", to: "#FCD9A8", accent: "#D97706", ink: "#7C2D12", motif: "rings" },
    art: "sun",
  },
  {
    id: "f-seven-centers",
    slug: "seven-centers",
    title: "Seven Centers",
    occasion: "Mindfulness",
    tagline: "Align every chakra, radiant and free",
    trending: true,
    style: { from: "#EDE4F7", to: "#DCCEF2", accent: "#8B5CF6", ink: "#5B21B6", motif: "petals" },
    art: "chakra",
  },
  {
    id: "f-candle-glow",
    slug: "candle-glow",
    title: "Candle Glow",
    occasion: "Meditation",
    tagline: "Trataka — gaze softly, see clearly",
    style: { from: "#FFF0DC", to: "#FFE2BC", accent: "#F59E0B", ink: "#78350F", motif: "bubbles" },
    art: "candle",
  },
  {
    id: "f-incense-and-incense",
    slug: "incense-breeze",
    title: "Incense Breeze",
    occasion: "Breathwork",
    tagline: "Let the smoke draw your breath",
    style: { from: "#EFE9F4", to: "#DED2EC", accent: "#A78BFA", ink: "#4C1D95", motif: "bubbles" },
    art: "incense",
  },
  {
    id: "f-moon-savasana",
    slug: "moon-savasana",
    title: "Moon Savasana",
    occasion: "Mindfulness",
    tagline: "Rest under a silver blessing",
    style: { from: "#E3ECF4", to: "#C9DCEC", accent: "#64748B", ink: "#334155", motif: "rings" },
    art: "moon",
  },
  {
    id: "f-mountain-breath",
    slug: "mountain-breath",
    title: "Mountain Breath",
    occasion: "Breathwork",
    tagline: "Breathe tall as the peaks",
    style: { from: "#DFF0EA", to: "#C2E5D8", accent: "#0F766E", ink: "#134E4A", motif: "mountains" },
    art: "om",
  },
  {
    id: "f-saffron-warrior",
    slug: "saffron-warrior",
    title: "Saffron Warrior",
    occasion: "Yoga Day",
    tagline: "Strong, soft, and unshaken",
    style: { from: "#FFE8C2", to: "#FFD48F", accent: "#D97706", ink: "#7C2D12", motif: "rays" },
    art: "sun",
  },
  {
    id: "f-rose-quartz-calm",
    slug: "rose-quartz-calm",
    title: "Rose Quartz Calm",
    occasion: "Mindfulness",
    tagline: "Hold yourself in rose light",
    style: { from: "#FDE9EC", to: "#FAD2DA", accent: "#F472B6", ink: "#9D174D", motif: "petals" },
    art: "lotus",
  },
  {
    id: "f-tide-of-quiet",
    slug: "tide-of-quiet",
    title: "Tide of Quiet",
    occasion: "Sunset Flow",
    tagline: "Flow out, flow in, flow on",
    style: { from: "#FFE3D6", to: "#F5C9C9", accent: "#FF7E67", ink: "#9A3412", motif: "rings" },
    art: "waves",
  },
  {
    id: "f-surya-namaskar-gold",
    slug: "surya-namaskar-gold",
    title: "Surya Namaskar Gold",
    occasion: "Morning Flow",
    tagline: "Twelve postures in warm solar harmony",
    trending: true,
    style: { from: "#FFF4D9", to: "#FFD89B", accent: "#EA580C", ink: "#7C2D12", motif: "rays" },
    art: "sun",
  },
  {
    id: "f-prana-mudra-flow",
    slug: "prana-mudra-flow",
    title: "Prana Mudra Flow",
    occasion: "Breathwork",
    tagline: "Awaken vital energy with every conscious breath",
    style: { from: "#E0F7EE", to: "#BCEAD8", accent: "#0D9488", ink: "#115E59", motif: "rings" },
    art: "om",
  },
  {
    id: "f-himalayan-dawn",
    slug: "himalayan-dawn",
    title: "Himalayan Dawn",
    occasion: "Morning Flow",
    tagline: "First light over serene mountain peaks",
    style: { from: "#FCE7D2", to: "#F5CBA7", accent: "#D97706", ink: "#78350F", motif: "mountains" },
    art: "sun",
  },
  {
    id: "f-kundalini-awakening",
    slug: "kundalini-awakening",
    title: "Kundalini Awakening",
    occasion: "Mindfulness",
    tagline: "Rise from root to crown in balanced awareness",
    style: { from: "#F1E8FB", to: "#DEC9F6", accent: "#7C3AED", ink: "#4C1D95", motif: "mandala" },
    art: "chakra",
  },
  {
    id: "f-sacred-lotus-pond",
    slug: "sacred-lotus-pond",
    title: "Sacred Lotus Pond",
    occasion: "Meditation",
    tagline: "Rooted in earth, blooming toward the sky",
    style: { from: "#FCE8F3", to: "#F5CBE2", accent: "#DB2777", ink: "#831843", motif: "petals" },
    art: "lotus",
  },
  {
    id: "f-savasana-starlight",
    slug: "savasana-starlight",
    title: "Savasana Starlight",
    occasion: "Mindfulness",
    tagline: "Deep stillness beneath a quiet night sky",
    style: { from: "#E5EDF7", to: "#CBD9EC", accent: "#475569", ink: "#1E293B", motif: "bubbles" },
    art: "moon",
  },
  {
    id: "f-anahata-heart-bloom",
    slug: "anahata-heart-bloom",
    title: "Anahata Heart Bloom",
    occasion: "Yoga Day",
    tagline: "Compassion and unity in every practice",
    style: { from: "#DCFCE7", to: "#BBF7D0", accent: "#16A34A", ink: "#14532D", motif: "mandala" },
    art: "lotus",
  },
  {
    id: "f-twilight-pranayama",
    slug: "twilight-pranayama",
    title: "Twilight Pranayama",
    occasion: "Sunset Flow",
    tagline: "Gentle evening rhythms to settle the mind",
    style: { from: "#FFE8DF", to: "#F9C7B8", accent: "#F97316", ink: "#9A3412", motif: "rings" },
    art: "waves",
  },
];

/* ------------------------------------------------------------------ */
/* Centralized Frame Registry & Normalization Engine                   */
/* ------------------------------------------------------------------ */

export interface FrameRegistryReport {
  valid: boolean;
  total: number;
  uniqueSlugs: number;
  duplicateSlugs: string[];
  duplicateIds: string[];
  missingMetadataSlugs: string[];
  warnings: string[];
}

export function normalizeFrameInput(
  input: FrameInput,
  index: number,
  state: {
    seenSlugs: Set<string>;
    seenIds: Set<string>;
    duplicateSlugs: string[];
    duplicateIds: string[];
    missingMetadataSlugs: string[];
    warnings: string[];
  }
): Frame {
  const rawTitle = (input.title ?? "").toString().trim() || `Yoga Frame ${index + 1}`;
  const baseSlugCandidate =
    normalizeSlug(input.slug) ||
    normalizeSlug(input.id?.replace(/^f-/i, "")) ||
    normalizeSlug(rawTitle) ||
    `frame-${index + 1}`;

  let slug = baseSlugCandidate;
  if (state.seenSlugs.has(slug)) {
    state.duplicateSlugs.push(slug);
    let suffix = 2;
    while (state.seenSlugs.has(`${baseSlugCandidate}-${suffix}`)) {
      suffix += 1;
    }
    const disambiguated = `${baseSlugCandidate}-${suffix}`;
    const msg = `Duplicate frame slug "${slug}" at index ${index} ("${rawTitle}"); auto-disambiguated to "${disambiguated}".`;
    state.warnings.push(msg);
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[zenframe:frames] ${msg}`);
    }
    slug = disambiguated;
  }
  state.seenSlugs.add(slug);

  const baseIdCandidate =
    (input.id ?? "").toString().trim()
      ? `f-${normalizeSlug(String(input.id).replace(/^f-/i, ""))}`
      : `f-${slug}`;

  let id = baseIdCandidate;
  if (state.seenIds.has(id)) {
    state.duplicateIds.push(id);
    let suffix = 2;
    while (state.seenIds.has(`${baseIdCandidate}-${suffix}`)) {
      suffix += 1;
    }
    id = `${baseIdCandidate}-${suffix}`;
    state.warnings.push(
      `Duplicate frame id "${baseIdCandidate}" at index ${index}; auto-disambiguated to "${id}".`
    );
  }
  state.seenIds.add(id);

  // Check category & occasion metadata — NEVER silently hide a frame with missing metadata
  const rawOccasion = (input.occasion ?? "").toString().trim();
  const rawCategory = (input.category ?? "").toString().trim();
  const hasMissingMetadata = !rawOccasion && !rawCategory;

  if (hasMissingMetadata) {
    state.missingMetadataSlugs.push(slug);
    const msg = `Frame "${slug}" ("${rawTitle}") is missing category/occasion metadata; placed in "${DEFAULT_OCCASION}" collection.`;
    state.warnings.push(msg);
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[zenframe:frames] ${msg}`);
    }
  }

  const resolvedCategory = (rawCategory || rawOccasion || DEFAULT_OCCASION) as Occasion;
  const resolvedOccasion = (rawOccasion || rawCategory || DEFAULT_OCCASION) as Occasion;

  const rawMotif = (input.style?.motif ?? DEFAULT_FRAME_STYLE.motif) as FrameMotif;
  const motif: FrameMotif = VALID_MOTIFS.has(rawMotif)
    ? rawMotif
    : DEFAULT_FRAME_STYLE.motif;

  const rawArt = (input.art ?? "lotus") as FrameArt;
  const art: FrameArt = VALID_ARTS.has(rawArt) ? rawArt : "lotus";

  const style: FrameStyle = {
    from: input.style?.from?.trim() || DEFAULT_FRAME_STYLE.from,
    to: input.style?.to?.trim() || DEFAULT_FRAME_STYLE.to,
    accent: input.style?.accent?.trim() || DEFAULT_FRAME_STYLE.accent,
    ink: input.style?.ink?.trim() || DEFAULT_FRAME_STYLE.ink,
    motif,
  };

  const tagline =
    (input.tagline ?? "").toString().trim() ||
    "Mindful yoga practice, framed with intention";

  const aliasSet = new Set<string>();
  aliasSet.add(slug);
  aliasSet.add(id.toLowerCase());
  aliasSet.add(id.replace(/^f-/i, "").toLowerCase());
  const titleSlug = normalizeSlug(rawTitle);
  if (titleSlug) aliasSet.add(titleSlug);
  if (input.id) {
    aliasSet.add(String(input.id).trim().toLowerCase());
    aliasSet.add(normalizeSlug(String(input.id).replace(/^f-/i, "")));
  }
  if (Array.isArray(input.aliases)) {
    for (const a of input.aliases) {
      const norm = normalizeSlug(a);
      if (norm) aliasSet.add(norm);
    }
  }

  const normalized: Frame = {
    id,
    slug,
    title: rawTitle,
    occasion: resolvedOccasion,
    category: resolvedCategory,
    tagline,
    description:
      (input.description ?? "").toString().trim() ||
      `${tagline}. A hand-crafted yoga photo frame by ZenFrame.`,
    tags:
      Array.isArray(input.tags) && input.tags.filter(Boolean).length > 0
        ? Array.from(new Set(input.tags.map((t) => String(t).trim()).filter(Boolean)))
        : Array.from(new Set([resolvedCategory, resolvedOccasion, art, motif].filter(Boolean))),
    trending: Boolean(input.trending),
    active: input.active !== false,
    featured: Boolean(input.featured ?? input.trending),
    style,
    art,
    settings: normalizeFrameSettings(input.settings, DEFAULT_FRAME_SETTINGS),
    aliases: Array.from(aliasSet),
    hasMissingMetadata,
  };

  return normalized;
}

const REGISTRY_STATE = {
  seenSlugs: new Set<string>(),
  seenIds: new Set<string>(),
  duplicateSlugs: [] as string[],
  duplicateIds: [] as string[],
  missingMetadataSlugs: [] as string[],
  warnings: [] as string[],
};

export const FRAMES: Frame[] = RAW_FRAMES.map((item, idx) =>
  normalizeFrameInput(item, idx, REGISTRY_STATE)
);

/** Lookup map indexing every frame by canonical slug, id, short id, and alias. */
export const FRAME_REGISTRY = new Map<string, Frame>();

function indexFrameInRegistry(frame: Frame): void {
  FRAME_REGISTRY.set(frame.slug, frame);
  FRAME_REGISTRY.set(frame.id.toLowerCase(), frame);
  const shortId = frame.id.replace(/^f-/i, "").toLowerCase();
  if (!FRAME_REGISTRY.has(shortId)) {
    FRAME_REGISTRY.set(shortId, frame);
  }
  for (const alias of frame.aliases ?? []) {
    const key = alias.toLowerCase();
    if (!FRAME_REGISTRY.has(key)) {
      FRAME_REGISTRY.set(key, frame);
    }
  }
}

for (const frame of FRAMES) {
  indexFrameInRegistry(frame);
}

/**
 * Dynamically registers a new frame definition into the single source of truth.
 * Automatically normalizes slug/ID/category/style and updates `FRAMES` + `FRAME_REGISTRY`.
 */
export function registerFrame(input: FrameInput): Frame {
  const frame = normalizeFrameInput(input, FRAMES.length, REGISTRY_STATE);
  FRAMES.push(frame);
  indexFrameInRegistry(frame);
  return frame;
}

/** Returns all registered frames from the centralized registry. */
export function getAllFrames(): Frame[] {
  return FRAMES;
}

/**
 * Resolves any frame by slug, id (`f-...`), short id, title slug, or alias.
 * Tolerates URL encoding, uppercase letters, whitespace, and underscores.
 */
export function getFrame(slugOrId: string | null | undefined): Frame | undefined {
  if (!slugOrId || typeof slugOrId !== "string") return undefined;
  let decoded = slugOrId.trim();
  try {
    decoded = decodeURIComponent(decoded).trim();
  } catch {
    /* keep raw */
  }
  const lower = decoded.toLowerCase();
  const direct = FRAME_REGISTRY.get(lower);
  if (direct) return direct;

  const normalized = normalizeSlug(decoded);
  if (!normalized) return undefined;
  return (
    FRAME_REGISTRY.get(normalized) ??
    FRAME_REGISTRY.get(normalized.replace(/^f-/, ""))
  );
}

/** Resolves any slug/id/alias to the frame's canonical slug. */
export function resolveFrameSlug(slugOrId: string | null | undefined): string | undefined {
  return getFrame(slugOrId)?.slug;
}

/**
 * Returns the complete list of filterable occasions for the Gallery.
 * Always includes the 6 core `OCCASIONS` plus any additional category (such as
 * `"General"` when a frame has missing category metadata, or custom occasions).
 */
export function getAvailableOccasions(
  frames: ReadonlyArray<{ category?: string; occasion?: string }> = FRAMES
): Occasion[] {
  const seen = new Set<string>(BASE_OCCASIONS);
  const result: Occasion[] = [...BASE_OCCASIONS];

  for (const f of frames) {
    const cat = (f.category || f.occasion || DEFAULT_OCCASION).toString().trim();
    if (cat && !seen.has(cat)) {
      seen.add(cat);
      result.push(cat as Occasion);
    }
  }
  return result;
}

/**
 * Validates a list of frame inputs (defaults to the registered `RAW_FRAMES`)
 * and verifies that every frame produces valid SVG output.
 */
export function validateFrameRegistry(
  inputs: ReadonlyArray<FrameInput> = RAW_FRAMES
): FrameRegistryReport {
  const state = {
    seenSlugs: new Set<string>(),
    seenIds: new Set<string>(),
    duplicateSlugs: [] as string[],
    duplicateIds: [] as string[],
    missingMetadataSlugs: [] as string[],
    warnings: [] as string[],
  };

  const normalized = inputs.map((item, idx) => normalizeFrameInput(item, idx, state));

  for (const f of normalized) {
    const svg = buildFrameSVG(f);
    const thumb = buildThumbSVG(f);
    if (!svg.startsWith("<svg") || !svg.endsWith("</svg>") || svg.includes("undefined")) {
      state.warnings.push(`Frame "${f.slug}" produced invalid composite SVG.`);
    }
    if (!thumb.startsWith("<svg") || !thumb.endsWith("</svg>") || thumb.includes("undefined")) {
      state.warnings.push(`Frame "${f.slug}" produced invalid thumbnail SVG.`);
    }
  }

  return {
    valid: state.duplicateSlugs.length === 0 && state.duplicateIds.length === 0,
    total: normalized.length,
    uniqueSlugs: state.seenSlugs.size,
    duplicateSlugs: state.duplicateSlugs,
    duplicateIds: state.duplicateIds,
    missingMetadataSlugs: state.missingMetadataSlugs,
    warnings: state.warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Backdrop layer                                                      */
/* ------------------------------------------------------------------ */

function backdrop(frame: Frame, cutoutWindow = false): string {
  const style = { ...DEFAULT_FRAME_STYLE, ...(frame?.style ?? {}) };
  const { accent, motif } = style;
  let deco = "";

  switch (motif) {
    case "rays":
      deco = Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const x = 500 + Math.sin(a) * 900;
        const y = 190 - Math.cos(a) * 900;
        return `<line x1="500" y1="190" x2="${x.toFixed(0)}" y2="${y.toFixed(0)}" stroke="${accent}" stroke-opacity="0.18" stroke-width="46" stroke-linecap="round"/>`;
      }).join("");
      break;
    case "mandala":
      deco = Array.from({ length: 24 }, (_, i) => {
        const a = (i * 15 * Math.PI) / 180;
        return `<circle cx="${(500 + Math.cos(a) * 430).toFixed(0)}" cy="${(625 + Math.sin(a) * 430).toFixed(0)}" r="${i % 2 ? 8 : 14}" fill="${accent}" fill-opacity="0.22"/>`;
      }).join("");
      break;
    case "petals":
      deco = Array.from({ length: 10 }, (_, i) => {
        const a = (i * 36 * Math.PI) / 180;
        return `<ellipse cx="${(500 + Math.cos(a) * 420).toFixed(0)}" cy="${(625 + Math.sin(a) * 420).toFixed(0)}" rx="16" ry="36" fill="${accent}" fill-opacity="0.2" transform="rotate(${i * 36} ${(500 + Math.cos(a) * 420).toFixed(0)} ${(625 + Math.sin(a) * 420).toFixed(0)})"/>`;
      }).join("");
      break;
    case "rings":
    default:
      deco = [130, 210, 290, 370, 440]
        .map(
          (r) =>
            `<circle cx="500" cy="625" r="${r}" fill="none" stroke="${accent}" stroke-opacity="0.18" stroke-width="4" stroke-dasharray="4 14"/>`
        )
        .join("");
      break;
    case "bubbles":
      deco = [
        [110, 190, 18], [180, 990, 26], [820, 220, 22], [880, 980, 16],
        [70, 620, 14], [930, 560, 20], [300, 130, 12], [700, 1120, 18],
        [220, 1120, 14], [780, 120, 15],
      ]
        .map(
          ([x, y, r]) =>
            `<circle cx="${x}" cy="${y}" r="${r}" fill="${accent}" fill-opacity="0.2"/>`
        )
        .join("");
      break;
    case "mountains":
      deco =
        `<path d="M-20 1150 L180 870 L320 1050 L520 780 L730 1030 L870 900 L1020 1150 Z" fill="${accent}" fill-opacity="0.16"/>` +
        `<path d="M-20 1210 L240 990 L430 1140 L640 950 L860 1160 L1020 1030 L1020 1210 Z" fill="${accent}" fill-opacity="0.24"/>`;
      break;
  }

  const baseFill = cutoutWindow
    ? `<path d="M0,0 H1000 V1250 H0 Z M150,250 H850 V950 H150 Z" fill="url(#bgGrad)" fill-rule="evenodd"/>`
    : `<rect width="1000" height="1250" fill="url(#bgGrad)"/>`;

  const clipStart = cutoutWindow ? `<g clip-path="url(#frameOuterClip)">` : `<g>`;
  const clipEnd = `</g>`;

  return `
    ${baseFill}
    ${clipStart}
      ${deco}
      <circle cx="500" cy="190" r="150" fill="${accent}" fill-opacity="0.14"/>
    ${clipEnd}
  `;
}

/* ------------------------------------------------------------------ */
/* Center art (drawn per frame.art)                                    */
/* ------------------------------------------------------------------ */

function centerArt(frame: Frame, cy: number): string {
  const style = { ...DEFAULT_FRAME_STYLE, ...(frame?.style ?? {}) };
  const { accent, ink } = style;
  switch (frame?.art) {
    case "sun":
      return `
        <g stroke="${accent}" stroke-width="7" stroke-linecap="round" opacity="0.95">
          ${Array.from({ length: 12 }, (_, i) => {
            const a = (i * 30 * Math.PI) / 180;
            return `<line x1="${(500 + Math.cos(a) * 64).toFixed(1)}" y1="${(cy + Math.sin(a) * 64).toFixed(1)}" x2="${(500 + Math.cos(a) * 86).toFixed(1)}" y2="${(cy + Math.sin(a) * 86).toFixed(1)}"/>`;
          }).join("")}
        </g>
        <circle cx="500" cy="${cy}" r="48" fill="${accent}"/>
        <circle cx="500" cy="${cy}" r="48" fill="none" stroke="${ink}" stroke-opacity="0.3" stroke-width="4"/>`;
    case "lotus":
    default:
      return `
        <g fill="${accent}">
          <ellipse cx="500" cy="${cy + 18}" rx="88" ry="34" fill-opacity="0.95"/>
          <ellipse cx="452" cy="${cy + 2}" rx="46" ry="66" fill-opacity="0.85" transform="rotate(-28 452 ${cy + 2})"/>
          <ellipse cx="548" cy="${cy + 2}" rx="46" ry="66" fill-opacity="0.85" transform="rotate(28 548 ${cy + 2})"/>
          <ellipse cx="432" cy="${cy - 18}" rx="30" ry="52" fill-opacity="0.7" transform="rotate(-55 432 ${cy - 18})"/>
          <ellipse cx="568" cy="${cy - 18}" rx="30" ry="52" fill-opacity="0.7" transform="rotate(55 568 ${cy - 18})"/>
          <ellipse cx="500" cy="${cy - 26}" rx="22" ry="46" fill-opacity="0.6"/>
        </g>
        <path d="M400 ${cy + 52} Q500 ${cy + 92} 600 ${cy + 52}" stroke="${ink}" stroke-opacity="0.4" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    case "om":
      return `
        <text x="500" y="${cy + 34}" font-size="96" text-anchor="middle" fill="${accent}" font-family="Georgia, serif">ॐ</text>
        <circle cx="500" cy="${cy}" r="70" fill="none" stroke="${accent}" stroke-opacity="0.5" stroke-width="5"/>`;
    case "chakra":
      return `
        ${["#EF4444", "#F97316", "#F59E0B", "#10B981", "#3B82F6", "#6366F1", "#8B5CF6"]
          .map(
            (c, i) =>
              `<circle cx="500" cy="${cy - 54 + i * 18}" r="${11 - i * 0.4}" fill="${c}" fill-opacity="0.9"/>`
          )
          .join("")}
        <circle cx="500" cy="${cy}" r="58" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="5"/>`;
    case "candle":
      return `
        <ellipse cx="500" cy="${cy + 58}" rx="54" ry="14" fill="${accent}" fill-opacity="0.4"/>
        <rect x="474" y="${cy + 6}" width="52" height="52" rx="8" fill="#FFF6E6" stroke="${ink}" stroke-opacity="0.35" stroke-width="4"/>
        <path d="M500 ${cy - 34} C514 ${cy - 12} 512 ${cy - 2} 500 ${cy + 6} C488 ${cy - 2} 486 ${cy - 12} 500 ${cy - 34} Z" fill="${accent}"/>
        <circle cx="500" cy="${cy - 12}" r="34" fill="${accent}" fill-opacity="0.3"/>`;
    case "incense":
      return `
        <rect x="468" y="${cy + 4}" width="64" height="18" rx="9" fill="${ink}" fill-opacity="0.6"/>
        <path d="M500 ${cy + 2} C500 ${cy - 40} 470 ${cy - 60} 500 ${cy - 100} C526 ${cy - 132} 498 ${cy - 150} 502 ${cy - 176}"
          stroke="${accent}" stroke-width="7" fill="none" stroke-linecap="round" stroke-opacity="0.9"/>
        <circle cx="502" cy="${cy - 176}" r="7" fill="${accent}"/>
        <circle cx="486" cy="${cy - 92}" r="5" fill="${accent}" fill-opacity="0.6"/>`;
    case "waves":
      return `
        <g fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round">
          <path d="M430 ${cy - 16} Q465 ${cy - 44} 500 ${cy - 16} T570 ${cy - 16}"/>
          <path d="M430 ${cy + 14} Q465 ${cy - 14} 500 ${cy + 14} T570 ${cy + 14}" stroke-opacity="0.7"/>
          <path d="M430 ${cy + 44} Q465 ${cy + 16} 500 ${cy + 44} T570 ${cy + 44}" stroke-opacity="0.45"/>
        </g>`;
    case "moon":
      return `
        <path d="M540 ${cy - 52} A62 62 0 1 0 540 ${cy + 52} A48 48 0 1 1 540 ${cy - 52} Z" fill="${accent}"/>
        <circle cx="428" cy="${cy - 44}" r="6" fill="${accent}" fill-opacity="0.7"/>
        <circle cx="404" cy="${cy}" r="4" fill="${accent}" fill-opacity="0.55"/>
        <circle cx="440" cy="${cy + 40}" r="5" fill="${accent}" fill-opacity="0.6"/>`;
  }
}

/* ------------------------------------------------------------------ */
/* Overlay layer: art band + title + brand + caption                   */
/* ------------------------------------------------------------------ */

function overlay(
  frame: Frame,
  caption?: string,
  customSettings?: Partial<FrameNumericSettings>
): string {
  const style = { ...DEFAULT_FRAME_STYLE, ...(frame?.style ?? {}) };
  const { accent, ink } = style;
  const cfg = normalizeFrameSettings(customSettings, frameSettings(frame));
  const title = (frame?.title ?? "ZenFrame").toString();

  const captionX = roundNum((cfg.text_x / 100) * 1000, 2);
  const captionY = roundNum((cfg.text_y / 100) * 1250, 2);
  const scaledFontSize = roundNum(cfg.font_size * cfg.text_scale, 2);
  const letterSpacing = roundNum(cfg.letter_spacing, 2);
  const lineHeight = roundNum(cfg.line_height, 2);
  const textOpacity = roundNum(cfg.text_opacity, 3);
  const borderOpacity = roundNum(cfg.border_opacity, 3);
  const fontFamily = esc(cfg.font_family || "Fraunces");

  return `
    <rect x="36" y="36" width="928" height="1178" rx="36" fill="none" stroke="${accent}" stroke-opacity="${roundNum(borderOpacity * 0.45, 3)}" stroke-width="4"/>
    <rect x="150" y="250" width="700" height="700" rx="24" fill="none" stroke="${accent}" stroke-opacity="${roundNum(borderOpacity * 0.85, 3)}" stroke-width="6"/>
    <g opacity="${borderOpacity}">${centerArt(frame, 1085)}</g>
    <text x="500" y="1212" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
      font-size="44" letter-spacing="6" fill="${ink}">${esc(title.toUpperCase())}</text>
    <rect x="420" y="1234" width="160" height="5" rx="2.5" fill="${accent}" fill-opacity="${borderOpacity}"/>
    <text x="500" y="96" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold"
      font-size="28" letter-spacing="10" fill="${ink}" fill-opacity="0.65">${BRAND}</text>
    <text x="500" y="142" text-anchor="middle" font-family="Georgia, serif" font-style="italic"
      font-size="22" fill="${ink}" fill-opacity="0.6">${esc(frame?.tagline ?? "")}</text>
    ${
      caption
        ? `<text x="${captionX}" y="${captionY}" text-anchor="middle" font-family="${fontFamily}, Georgia, serif" font-style="italic"
            font-size="${scaledFontSize}" letter-spacing="${letterSpacing}" data-line-height="${lineHeight}" fill="${ink}" fill-opacity="${textOpacity}">${esc(quote(caption))}</text>`
        : ""
    }
  `;
}

function quote(s: string): string {
  return `\u201C${s}\u201D`;
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ */
/* Public: full composite SVG + gallery thumbnails                     */
/* ------------------------------------------------------------------ */

/** Full 1000x1250 composite: backdrop + photo + overlay. */
export function buildFrameSVG(
  frame: Frame,
  photoHref?: string,
  caption?: string,
  customSettings?: Partial<FrameNumericSettings>
): string {
  const style = { ...DEFAULT_FRAME_STYLE, ...(frame?.style ?? {}) };
  const isCutout = photoHref === "__cutout__";

  const photo = isCutout
    ? ""
    : photoHref
      ? `<image href="${esc(photoHref)}" x="150" y="250" width="700" height="700" preserveAspectRatio="xMidYMid slice"/>`
      : `<rect x="150" y="250" width="700" height="700" rx="24" fill="#ffffff" fill-opacity="0.55"/>
         <g opacity="0.85">${centerArt(frame, 560)}</g>
         <text x="500" y="700" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="${style.ink}" fill-opacity="0.65">${esc(frame.occasion || frame.category || "ZenFrame")}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1000" height="1250" viewBox="0 0 1000 1250">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${style.from}"/>
      <stop offset="1" stop-color="${style.to}"/>
    </linearGradient>
    <clipPath id="frameOuterClip">
      <path d="M0,0 H1000 V1250 H0 Z M150,250 H850 V950 H150 Z" clip-rule="evenodd"/>
    </clipPath>
  </defs>
  <g>${backdrop(frame, isCutout)}</g>
  <g>${photo}</g>
  <g>${overlay(frame, caption, customSettings)}</g>
</svg>`;
}

/** Small standalone SVG used as a gallery thumbnail (no photo, compact). */
export function buildThumbSVG(frame: Frame): string {
  const style = { ...DEFAULT_FRAME_STYLE, ...(frame?.style ?? {}) };
  const title = (frame?.title ?? "ZenFrame").toString();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="375" viewBox="0 0 1000 1250">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${style.from}"/>
      <stop offset="1" stop-color="${style.to}"/>
    </linearGradient>
  </defs>
  <g>${backdrop(frame, false)}</g>
  <rect x="90" y="90" width="820" height="1070" rx="36" fill="none" stroke="${style.accent}" stroke-opacity="0.45" stroke-width="6"/>
  <g transform="translate(0 -140)">${centerArt(frame, 625)}</g>
  <text x="500" y="995" text-anchor="middle" font-family="Georgia, serif" font-size="44" letter-spacing="4" fill="${style.ink}">${esc(shortTitle(title))}</text>
  <text x="500" y="1060" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="26" fill="${style.ink}" fill-opacity="0.65">${esc(frame?.occasion ?? "")}</text>
</svg>`;
}

function shortTitle(t: string): string {
  const clean = String(t ?? "").trim().toUpperCase();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 1 || clean.length <= 12) return clean;
  return words.slice(0, 2).join(" ");
}

export const svgToDataURI = (svg: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
