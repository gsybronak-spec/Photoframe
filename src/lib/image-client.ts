/**
 * Client-side image helpers shared by the editor and the avatar uploader.
 *
 * Everything here runs in the browser: photos are decoded, EXIF-rotated and
 * downscaled locally, so the original pixels never travel to the server unless
 * the user explicitly saves a finished composite.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // refuse monster files before decode
export const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export interface IngestedPhoto {
  dataUrl: string;
  width: number;
  height: number;
  /** Original pixel dimensions, useful for the "large image" hint. */
  originalWidth: number;
  originalHeight: number;
}

export class ImageError extends Error {}

/**
 * Validates a picked file and explains, in plain language, why it can't be used.
 * Returns null when the file is acceptable.
 */
export function validateImageFile(file: File, maxBytes = MAX_UPLOAD_BYTES): string | null {
  const name = file.name.toLowerCase();
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif");

  if (isHeic) {
    return "HEIC/HEIF photos aren't supported by every browser. On iPhone: Settings → Camera → Formats → Most Compatible, or export the photo as JPEG.";
  }
  if (file.size === 0) return "That file looks empty — try another photo.";
  if (!file.type.startsWith("image/")) {
    return "That file isn't an image. JPG, PNG or WebP work best.";
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / 1024 / 1024);
    return `That image is over ${mb} MB. Try a smaller one or a lower-resolution export.`;
  }
  return null;
}

/** Decodes with EXIF orientation applied, then downscales for memory safety. */
export async function ingestPhotoFile(
  file: File,
  maxDim = 1200
): Promise<IngestedPhoto> {
  const problem = validateImageFile(file);
  if (problem) throw new ImageError(problem);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Fallback path for browsers without createImageBitmap orientation support.
    bitmap = await decodeViaImgTag(file);
  }

  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const ratio = Math.min(1, maxDim / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * ratio));
  const height = Math.max(1, Math.round(originalHeight * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("Your browser blocked canvas editing.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.9),
    width,
    height,
    originalWidth,
    originalHeight,
  };
}

async function decodeViaImgTag(file: File): Promise<ImageBitmap> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    // drawImage accepts HTMLImageElement too; wrap it in a canvas-backed bitmap.
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")?.drawImage(img, 0, 0);
    return await createImageBitmap(canvas);
  } catch {
    throw new ImageError("This image format isn't supported on your browser.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Small JPEG derivative used for dashboard grids and CDN-friendly caching. */
export async function makeThumbDataUrl(
  source: HTMLCanvasElement | string,
  maxWidth = 400,
  quality = 0.72
): Promise<string | null> {
  try {
    const img = await loadDrawable(source);
    const ratio = Math.min(1, maxWidth / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * ratio));
    canvas.height = Math.max(1, Math.round(img.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

async function loadDrawable(
  source: HTMLCanvasElement | string
): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof source !== "string") {
    return { source, width: source.width, height: source.height };
  }
  const img = new Image();
  img.src = source;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight };
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageError("Export failed"))),
      type,
      quality
    )
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Human summary of a user agent string for the sessions panel. */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "Browser";
  const os =
    /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Linux/.test(ua) ? "Linux"
    : "Unknown OS";
  return `${browser} on ${os}`;
}
