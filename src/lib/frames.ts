/**
 * ZenFrame frame engine.
 *
 * Every frame is built from three composable layers, rendered as pure SVG:
 *   1. backdrop — soft gradient wash + optional decorative marks (mandala spokes, sun rays)
 *   2. photo    — the user's uploaded image, clipped to a portrait/square window
 *   3. overlay  — occasion art (lotus, sun, chakra petals, incense…), occasion title,
 *                 brand wordmark, and user caption
 *
 * All original artwork. 1000 x 1250 (4:5) canvas — ideal for IG posts/stories.
 */

export type Occasion =
  | "Morning Flow"
  | "Yoga Day"
  | "Meditation"
  | "Sunset Flow"
  | "Breathwork"
  | "Mindfulness";

export interface FrameStyle {
  /** gradient stops for the backdrop, [start, end] */
  from: string;
  to: string;
  /** accent color for rings / petals / rays */
  accent: string;
  /** deep tone for title text */
  ink: string;
  /** backdrop decoration motif */
  motif: "rays" | "mandala" | "petals" | "rings" | "bubbles" | "mountains";
}

export interface Frame {
  id: string;
  slug: string;
  title: string;
  /** category — mirrors occasion, kept as its own field for the data model */
  category?: Occasion;
  occasion: Occasion;
  tagline: string;
  /** long description for detail/OG metadata (defaults to tagline) */
  description?: string;
  /** search tags (defaults to [occasion, art]) */
  tags?: string[];
  trending?: boolean;
  style: FrameStyle;
  /** which center art the overlay draws */
  art:
    | "lotus"
    | "sun"
    | "om"
    | "chakra"
    | "candle"
    | "incense"
    | "waves"
    | "moon";
}

/** Derived, overridable metadata — keeps adding a frame to a single object. */
export const frameCategory = (f: Frame): Occasion => f.category ?? f.occasion;
export const frameDescription = (f: Frame): string =>
  f.description ?? `${f.tagline}. A hand-crafted yoga photo frame by ZenFrame.`;
export const frameTags = (f: Frame): string[] =>
  f.tags ?? [f.occasion, f.art];

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
  updated_at?: string;
  /** true when an admin override row exists for this frame */
  overridden?: boolean;
}

export type CatalogFrame = Frame & FrameMeta;

/** Code defaults for a frame, before any admin override is merged in. */
export function codeMeta(f: Frame): FrameMeta {
  return {
    active: true,
    featured: f.trending === true,
    description: frameDescription(f),
    category: frameCategory(f),
    tags: frameTags(f),
  };
}

export function toCatalogFrame(f: Frame, meta?: Partial<FrameMeta>): CatalogFrame {
  return { ...f, ...codeMeta(f), ...meta };
}

export const OCCASIONS: Occasion[] = [
  "Morning Flow",
  "Yoga Day",
  "Meditation",
  "Sunset Flow",
  "Breathwork",
  "Mindfulness",
];

const BRAND = "ZENFRAME";

/* ------------------------------------------------------------------ */
/* Frame catalogue                                                     */
/* ------------------------------------------------------------------ */

export const FRAMES: Frame[] = [
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
];

export function getFrame(slug: string): Frame | undefined {
  return FRAMES.find((f) => f.slug === slug);
}

/* ------------------------------------------------------------------ */
/* Backdrop layer                                                      */
/* ------------------------------------------------------------------ */

function backdrop(frame: Frame): string {
  const { accent, motif } = frame.style;
  let deco = "";

  switch (motif) {
    case "rays":
      deco = Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const x = 500 + Math.sin(a) * 900;
        const y = 190 - Math.cos(a) * 900;
        return `<line x1="500" y1="190" x2="${x.toFixed(0)}" y2="${y.toFixed(0)}" stroke="${accent}" stroke-opacity="0.13" stroke-width="46" stroke-linecap="round"/>`;
      }).join("");
      break;
    case "mandala":
      deco = Array.from({ length: 24 }, (_, i) => {
        const a = (i * 15 * Math.PI) / 180;
        return `<circle cx="${(500 + Math.cos(a) * 430).toFixed(0)}" cy="${(625 + Math.sin(a) * 430).toFixed(0)}" r="${i % 2 ? 7 : 12}" fill="${accent}" fill-opacity="0.16"/>`;
      }).join("");
      break;
    case "petals":
      deco = Array.from({ length: 10 }, (_, i) => {
        const a = (i * 36 * Math.PI) / 180;
        return `<ellipse cx="${(500 + Math.cos(a) * 420).toFixed(0)}" cy="${(625 + Math.sin(a) * 420).toFixed(0)}" rx="14" ry="34" fill="${accent}" fill-opacity="0.15" transform="rotate(${i * 36} ${ (500 + Math.cos(a) * 420).toFixed(0)} ${(625 + Math.sin(a) * 420).toFixed(0)})"/>`;
      }).join("");
      break;
    case "rings":
      deco = [130, 210, 290, 370]
        .map(
          (r) =>
            `<circle cx="500" cy="625" r="${r}" fill="none" stroke="${accent}" stroke-opacity="0.12" stroke-width="3" stroke-dasharray="2 14"/>`
        )
        .join("");
      break;
    case "bubbles":
      deco = [
        [110, 190, 16], [180, 950, 24], [820, 260, 20], [880, 900, 14],
        [70, 620, 11], [930, 560, 18], [300, 130, 10], [700, 1120, 16],
        [220, 1120, 12], [780, 120, 13],
      ]
        .map(
          ([x, y, r]) =>
            `<circle cx="${x}" cy="${y}" r="${r}" fill="${accent}" fill-opacity="0.14"/>`
        )
        .join("");
      break;
    case "mountains":
      deco =
        `<path d="M-20 1150 L180 870 L320 1050 L520 780 L730 1030 L870 900 L1020 1150 Z" fill="${accent}" fill-opacity="0.10"/>` +
        `<path d="M-20 1210 L240 990 L430 1140 L640 950 L860 1160 L1020 1030 L1020 1210 Z" fill="${accent}" fill-opacity="0.16"/>`;
      break;
  }

  return `
    <rect width="1000" height="1250" fill="url(#bgGrad)"/>
    ${deco}
    <circle cx="500" cy="190" r="150" fill="${accent}" fill-opacity="0.10"/>
  `;
}

/* ------------------------------------------------------------------ */
/* Center art (drawn per frame.art)                                    */
/* ------------------------------------------------------------------ */

function centerArt(frame: Frame, cy: number): string {
  const { accent, ink } = frame.style;
  switch (frame.art) {
    case "sun":
      return `
        <g stroke="${accent}" stroke-width="7" stroke-linecap="round" opacity="0.9">
          ${Array.from({ length: 12 }, (_, i) => {
            const a = (i * 30 * Math.PI) / 180;
            return `<line x1="${(500 + Math.cos(a) * 64).toFixed(1)}" y1="${(cy + Math.sin(a) * 64).toFixed(1)}" x2="${(500 + Math.cos(a) * 84).toFixed(1)}" y2="${(cy + Math.sin(a) * 84).toFixed(1)}"/>`;
          }).join("")}
        </g>
        <circle cx="500" cy="${cy}" r="48" fill="${accent}"/>
        <circle cx="500" cy="${cy}" r="48" fill="none" stroke="${ink}" stroke-opacity="0.25" stroke-width="4"/>`;
    case "lotus":
      return `
        <g fill="${accent}">
          <ellipse cx="500" cy="${cy + 18}" rx="88" ry="34" fill-opacity="0.95"/>
          <ellipse cx="452" cy="${cy + 2}" rx="46" ry="66" fill-opacity="0.8" transform="rotate(-28 452 ${cy + 2})"/>
          <ellipse cx="548" cy="${cy + 2}" rx="46" ry="66" fill-opacity="0.8" transform="rotate(28 548 ${cy + 2})"/>
          <ellipse cx="432" cy="${cy - 18}" rx="30" ry="52" fill-opacity="0.65" transform="rotate(-55 432 ${cy - 18})"/>
          <ellipse cx="568" cy="${cy - 18}" rx="30" ry="52" fill-opacity="0.65" transform="rotate(55 568 ${cy - 18})"/>
          <ellipse cx="500" cy="${cy - 26}" rx="22" ry="46" fill-opacity="0.5"/>
        </g>
        <path d="M400 ${cy + 52} Q500 ${cy + 92} 600 ${cy + 52}" stroke="${ink}" stroke-opacity="0.35" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    case "om":
      return `
        <text x="500" y="${cy + 34}" font-size="96" text-anchor="middle" fill="${accent}" font-family="Georgia, serif">ॐ</text>
        <circle cx="500" cy="${cy}" r="70" fill="none" stroke="${accent}" stroke-opacity="0.4" stroke-width="5"/>`;
    case "chakra":
      return `
        ${["#EF4444", "#F97316", "#F59E0B", "#10B981", "#3B82F6", "#6366F1", "#8B5CF6"]
          .map(
            (c, i) =>
              `<circle cx="500" cy="${cy - 54 + i * 18}" r="${11 - i * 0.4}" fill="${c}" fill-opacity="0.85"/>`
          )
          .join("")}
        <circle cx="500" cy="${cy}" r="58" fill="none" stroke="${accent}" stroke-opacity="0.45" stroke-width="5"/>`;
    case "candle":
      return `
        <ellipse cx="500" cy="${cy + 58}" rx="54" ry="14" fill="${accent}" fill-opacity="0.35"/>
        <rect x="474" y="${cy + 6}" width="52" height="52" rx="8" fill="#FFF6E6" stroke="${ink}" stroke-opacity="0.3" stroke-width="4"/>
        <path d="M500 ${cy - 34} C514 ${cy - 12} 512 ${cy - 2} 500 ${cy + 6} C488 ${cy - 2} 486 ${cy - 12} 500 ${cy - 34} Z" fill="${accent}"/>
        <circle cx="500" cy="${cy - 12}" r="34" fill="${accent}" fill-opacity="0.25"/>`;
    case "incense":
      return `
        <rect x="468" y="${cy + 4}" width="64" height="18" rx="9" fill="${ink}" fill-opacity="0.55"/>
        <path d="M500 ${cy + 2} C500 ${cy - 40} 470 ${cy - 60} 500 ${cy - 100} C526 ${cy - 132} 498 ${cy - 150} 502 ${cy - 176}"
          stroke="${accent}" stroke-width="7" fill="none" stroke-linecap="round" stroke-opacity="0.85"/>
        <circle cx="502" cy="${cy - 176}" r="7" fill="${accent}"/>
        <circle cx="486" cy="${cy - 92}" r="5" fill="${accent}" fill-opacity="0.5"/>`;
    case "waves":
      return `
        <g fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round">
          <path d="M430 ${cy - 16} Q465 ${cy - 44} 500 ${cy - 16} T570 ${cy - 16}"/>
          <path d="M430 ${cy + 14} Q465 ${cy - 14} 500 ${cy + 14} T570 ${cy + 14}" stroke-opacity="0.65"/>
          <path d="M430 ${cy + 44} Q465 ${cy + 16} 500 ${cy + 44} T570 ${cy + 44}" stroke-opacity="0.35"/>
        </g>`;
    case "moon":
      return `
        <path d="M540 ${cy - 52} A62 62 0 1 0 540 ${cy + 52} A48 48 0 1 1 540 ${cy - 52} Z" fill="${accent}"/>
        <circle cx="428" cy="${cy - 44}" r="6" fill="${accent}" fill-opacity="0.6"/>
        <circle cx="404" cy="${cy}" r="4" fill="${accent}" fill-opacity="0.45"/>
        <circle cx="440" cy="${cy + 40}" r="5" fill="${accent}" fill-opacity="0.5"/>`;
  }
}

/* ------------------------------------------------------------------ */
/* Overlay layer: art band + title + brand + caption                   */
/* ------------------------------------------------------------------ */

function overlay(frame: Frame, caption?: string): string {
  const { accent, ink } = frame.style;
  return `
    <g>${centerArt(frame, 1105)}</g>
    <text x="500" y="1216" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
      font-size="46" letter-spacing="6" fill="${ink}">${esc(frame.title.toUpperCase())}</text>
    <rect x="420" y="1238" width="160" height="5" rx="2.5" fill="${accent}"/>
    <text x="500" y="90" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold"
      font-size="30" letter-spacing="10" fill="${ink}" fill-opacity="0.55">${BRAND}</text>
    ${
      caption
        ? `<text x="500" y="950" text-anchor="middle" font-family="Georgia, serif" font-style="italic"
            font-size="34" fill="${ink}" fill-opacity="0.85">${esc(quote(caption))}</text>`
        : ""
    }
  `;
}

function quote(s: string): string {
  return `\u201C${s}\u201D`;
}

function esc(s: string): string {
  return s
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
  caption?: string
): string {
  const photo = photoHref
    ? `<image href="${photoHref}" x="150" y="250" width="700" height="700" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="150" y="250" width="700" height="700" rx="24" fill="#ffffff" fill-opacity="0.5"/>
       <text x="500" y="610" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="${frame.style.ink}" fill-opacity="0.5">Your photo goes here</text>
       <text x="500" y="650" text-anchor="middle" font-family="Arial, sans-serif" font-size="46">🌿</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1000" height="1250" viewBox="0 0 1000 1250">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${frame.style.from}"/>
      <stop offset="1" stop-color="${frame.style.to}"/>
    </linearGradient>
  </defs>
  <g>${backdrop(frame)}</g>
  <g>${photo}</g>
  <g>${overlay(frame, caption)}</g>
</svg>`;
}

/** Small standalone SVG used as a gallery thumbnail (no photo, compact). */
export function buildThumbSVG(frame: Frame): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="375" viewBox="0 0 1000 1250">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${frame.style.from}"/>
      <stop offset="1" stop-color="${frame.style.to}"/>
    </linearGradient>
  </defs>
  <g>${backdrop(frame)}</g>
  <g transform="translate(0 -160)">${centerArt(frame, 625)}</g>
  <text x="500" y="1010" text-anchor="middle" font-family="Georgia, serif" font-size="44" letter-spacing="4" fill="${frame.style.ink}">${esc(shortTitle(frame.title))}</text>
</svg>`;
}

function shortTitle(t: string): string {
  const words = t.toUpperCase().split(" ");
  if (words.length <= 1 || t.length <= 12) return esc(t.toUpperCase());
  return esc(words.slice(0, 2).join(" "));
}

export const svgToDataURI = (svg: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
