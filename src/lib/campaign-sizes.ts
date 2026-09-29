/**
 * Standard social-media size presets for campaign canvases.
 *
 * The admin picks an output size; the campaign artwork, photo mask and name
 * overlay are all positioned as percentages of this canvas, and the user's
 * generated composite matches it exactly.
 */

export interface SizePreset {
  category: "Instagram" | "Facebook" | "WhatsApp" | "Custom";
  id: string;
  name: string;
  width: number;
  height: number;
  aspectRatio: string;
  badge: string;
  description: string;
}

export const PRESET_CATEGORIES: SizePreset["category"][] = [
  "Instagram",
  "Facebook",
  "WhatsApp",
  "Custom",
];

export const SIZE_PRESETS: SizePreset[] = [
  // --- INSTAGRAM ---
  {
    category: "Instagram",
    id: "ig-portrait",
    name: "Instagram Portrait",
    width: 1080,
    height: 1350,
    aspectRatio: "4:5",
    badge: "4:5",
    description: "Feed portrait post (standard recommended)",
  },
  {
    category: "Instagram",
    id: "ig-square",
    name: "Instagram Post — Square",
    width: 1080,
    height: 1080,
    aspectRatio: "1:1",
    badge: "1:1",
    description: "Square feed post",
  },
  {
    category: "Instagram",
    id: "ig-story",
    name: "Instagram Story / Reel",
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
    badge: "9:16",
    description: "Full-screen mobile story & reels",
  },
  {
    category: "Instagram",
    id: "ig-landscape",
    name: "Instagram Landscape",
    width: 1080,
    height: 566,
    aspectRatio: "1.91:1",
    badge: "1.91:1",
    description: "Horizontal feed post",
  },

  // --- FACEBOOK ---
  {
    category: "Facebook",
    id: "fb-landscape",
    name: "Facebook Post — Landscape",
    width: 1200,
    height: 630,
    aspectRatio: "1.91:1",
    badge: "1.91:1",
    description: "Standard link & post feed share",
  },
  {
    category: "Facebook",
    id: "fb-square",
    name: "Facebook Post — Square",
    width: 1080,
    height: 1080,
    aspectRatio: "1:1",
    badge: "1:1",
    description: "Square feed post",
  },
  {
    category: "Facebook",
    id: "fb-portrait",
    name: "Facebook Portrait",
    width: 1080,
    height: 1350,
    aspectRatio: "4:5",
    badge: "4:5",
    description: "Vertical feed post",
  },
  {
    category: "Facebook",
    id: "fb-story",
    name: "Facebook Story",
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
    badge: "9:16",
    description: "Full-screen vertical story",
  },

  // --- WHATSAPP ---
  {
    category: "WhatsApp",
    id: "wa-status",
    name: "WhatsApp Status",
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
    badge: "9:16",
    description: "Full-screen WhatsApp status update",
  },
  {
    category: "WhatsApp",
    id: "wa-square",
    name: "WhatsApp Square",
    width: 1080,
    height: 1080,
    aspectRatio: "1:1",
    badge: "1:1",
    description: "Square profile & chat share",
  },

  // --- CUSTOM ---
  {
    category: "Custom",
    id: "custom",
    name: "Custom Dimensions",
    width: 1080,
    height: 1350,
    aspectRatio: "Custom",
    badge: "Custom",
    description: "Enter your custom pixel dimensions",
  },
];

export const DEFAULT_PRESET = SIZE_PRESETS[0]; // Instagram Portrait 1080×1350

/** Finds a matching preset given width and height, or returns a Custom shape. */
export function findMatchingPreset(width: number, height: number): SizePreset {
  const w = Number(width) || 1080;
  const h = Number(height) || 1350;

  const match = SIZE_PRESETS.find(
    (p) => p.category !== "Custom" && p.width === w && p.height === h
  );
  if (match) return match;

  return {
    ...SIZE_PRESETS.find((p) => p.id === "custom")!,
    width: w,
    height: h,
    aspectRatio: `${w}:${h}`,
  };
}

/** Initial cover-fit geometry for newly uploaded artwork (percent coords). */
export function coverFitGeometry(
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; width: number; height: number } {
  const imgAspect = (imageWidth || canvasWidth) / (imageHeight || canvasHeight);
  const canvasAspect = canvasWidth / canvasHeight;

  const round1 = (v: number) => Math.round(v * 10) / 10;
  if (imgAspect > canvasAspect) {
    const width = round1((imgAspect / canvasAspect) * 100);
    return { x: round1((100 - width) / 2), y: 0, width, height: 100 };
  }
  const height = round1((canvasAspect / imgAspect) * 100);
  return { x: 0, y: round1((100 - height) / 2), width: 100, height };
}
