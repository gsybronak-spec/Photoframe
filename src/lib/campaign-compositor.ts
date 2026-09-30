/**
 * High-resolution client-side compositor for campaign frames.
 *
 * Executes 100% locally in browser memory via the Canvas 2D API. The user's
 * photo and the generated composite are NEVER uploaded — the server only ever
 * receives an anonymous event counter.
 *
 * Layers (same order as the admin studio):
 *   1. Campaign artwork (admin geometry, rotation)
 *   2. User photo clipped into the admin-defined mask (circle/square),
 *      honoring the user's pan + zoom
 *   3. Name overlay (admin typography, rotation)
 */

export interface CampaignArtGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface CampaignPhotoConfig {
  enabled: boolean;
  shape: "circle" | "square";
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

export interface ComposeInput {
  artworkUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  art: CampaignArtGeometry;
  photoConfig: CampaignPhotoConfig | null;
  nameConfig: CampaignNameConfig | null;
  userName: string;
  userPhotoUrl: string | null;
  photoPan: { x: number; y: number };
  photoZoom: number;
}

const imagePromiseCache = new Map<string, Promise<HTMLImageElement>>();

/** Loads an image with CORS; artwork loads are de-duplicated per URL. */
export function loadImage(src: string, isArtwork = false): Promise<HTMLImageElement> {
  if (!src) {
    return Promise.reject(
      new Error(
        isArtwork
          ? "Campaign artwork could not be loaded. Please refresh and try again."
          : "User photo could not be loaded. Please select a photo again."
      )
    );
  }
  if (isArtwork && imagePromiseCache.has(src)) return imagePromiseCache.get(src)!;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const fail = () => {
      if (isArtwork) imagePromiseCache.delete(src);
      reject(
        new Error(
          isArtwork
            ? "Campaign artwork could not be loaded. Please refresh and try again."
            : "User photo could not be loaded. Please select a photo again."
        )
      );
    };
    img.onload = async () => {
      if (!img.naturalWidth || !img.naturalHeight) return fail();
      if (typeof img.decode === "function") {
        try {
          await img.decode();
        } catch {
          /* onload already proved it decodes */
        }
      }
      resolve(img);
    };
    img.onerror = fail;
    img.src = src;
  });

  if (isArtwork) imagePromiseCache.set(src, promise);
  return promise;
}

/** Percent-of-canvas → pixels, with the same pixel-fallback as the server. */
function pct(value: number, total: number, fallback: number): number {
  const n = Number(value);
  const base = Number.isFinite(n) ? n : fallback;
  const norm = base > 100 ? (base / total) * 100 : base;
  return (total * Math.min(100, Math.max(0, norm))) / 100;
}

/**
 * Composites the final frame at the campaign's full output resolution.
 * Returns a PNG data URL.
 */
export async function composeCampaignFrame(input: ComposeInput): Promise<string> {
  const artworkImg = await loadImage(input.artworkUrl, true);

  const W = Math.round(Number(input.canvasWidth) || 1080);
  const H = Math.round(Number(input.canvasHeight) || 1350);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not create the image canvas.");

  ctx.fillStyle = "#fff8f0"; // ZenFrame cream
  ctx.fillRect(0, 0, W, H);

  /* Layer 1 — campaign artwork ------------------------------------- */
  const aw = pct(input.art.width, W, 100);
  const ah = pct(input.art.height, H, 100);
  const ax = pct(input.art.x, W, 0);
  const ay = pct(input.art.y, H, 0);
  ctx.save();
  ctx.translate(ax + aw / 2, ay + ah / 2);
  if (input.art.rotation) ctx.rotate((input.art.rotation * Math.PI) / 180);
  ctx.drawImage(artworkImg, -aw / 2, -ah / 2, aw, ah);
  ctx.restore();

  /* Layer 2 — user photo inside the admin mask ---------------------- */
  const photo = input.photoConfig;
  if (photo?.enabled && input.userPhotoUrl) {
    const userImg = await loadImage(input.userPhotoUrl);

    const pw = pct(photo.width, W, 40);
    const ph = pct(photo.height, H, 30);
    const px = pct(photo.x, W, 30);
    const py = pct(photo.y, H, 35);

    ctx.save();
    ctx.translate(px + pw / 2, py + ph / 2);
    if (photo.rotation) ctx.rotate((photo.rotation * Math.PI) / 180);

    ctx.beginPath();
    if (photo.shape === "circle") {
      ctx.arc(0, 0, Math.min(pw, ph) / 2, 0, Math.PI * 2);
    } else {
      const radius = Math.min(18 * (W / 450), Math.min(pw, ph) / 6);
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(-pw / 2, -ph / 2, pw, ph, radius);
      } else {
        ctx.rect(-pw / 2, -ph / 2, pw, ph);
      }
    }
    ctx.clip();

    // Cover-fit the photo inside the mask, then apply user pan + zoom.
    const imgRatio = userImg.naturalWidth / userImg.naturalHeight;
    const maskRatio = pw / ph;
    let drawW: number;
    let drawH: number;
    if (imgRatio > maskRatio) {
      drawH = ph;
      drawW = ph * imgRatio;
    } else {
      drawW = pw;
      drawH = pw / imgRatio;
    }
    drawW *= input.photoZoom;
    drawH *= input.photoZoom;
    const panPxX = (input.photoPan.x / 100) * pw;
    const panPxY = (input.photoPan.y / 100) * ph;

    ctx.drawImage(userImg, -drawW / 2 + panPxX, -drawH / 2 + panPxY, drawW, drawH);
    ctx.restore();
  }

  /* Layer 3 — name overlay ------------------------------------------ */
  const name = input.nameConfig;
  if (name?.enabled && input.userName.trim()) {
    const nw = pct(name.width, W, 60);
    const nh = pct(name.height, H, 12);
    const nx = pct(name.x, W, 20);
    const ny = pct(name.y, H, 78);

    // Font sizes are tuned on a 450px-wide reference stage in the studio;
    // scale proportionally to the output canvas (preserving decimal font_size and text_scale).
    const fontScale = (W / 450) * (Number(name.text_scale) || 1);
    const fontSize = Math.round((Number(name.font_size) || 26) * fontScale * 100) / 100;

    ctx.save();
    ctx.translate(nx + nw / 2, ny + nh / 2);
    if (name.rotation) ctx.rotate((name.rotation * Math.PI) / 180);
    if (name.text_opacity !== undefined && Number.isFinite(Number(name.text_opacity))) {
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(name.text_opacity)));
    }

    ctx.font = `${name.font_weight === "bold" ? "bold " : ""}${fontSize}px "${name.font_family}", sans-serif`;
    ctx.fillStyle = name.font_color || "#fff8f0";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
    ctx.shadowBlur = 8 * fontScale;
    ctx.shadowOffsetY = 2 * fontScale;

    let textX = 0;
    if (name.alignment === "left") {
      ctx.textAlign = "left";
      textX = -nw / 2 + 10 * fontScale;
    } else if (name.alignment === "right") {
      ctx.textAlign = "right";
      textX = nw / 2 - 10 * fontScale;
    } else {
      ctx.textAlign = "center";
    }

    if ("letterSpacing" in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${(name.letter_spacing ?? 1) * fontScale}px`;
    }

    ctx.fillText(input.userName.trim(), textX, 0);
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}
