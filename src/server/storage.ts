/**
 * Object storage for user images.
 *
 * Everything the app stores lives behind the `StorageDriver` interface, so
 * swapping the local filesystem for an object store later means adding one class
 * and setting STORAGE_DRIVER — no route, page or query changes.
 *
 * Only `local` (development) and `blob` (Vercel Blob, production) are
 * implemented; `s3`/`r2` remain reserved names that fail loudly rather than
 * silently writing to the wrong place.
 *
 * Files always live OUTSIDE /public and are reachable only through
 * authorization-checked routes:
 *   /api/creations/[id]/image          (owner or admin)
 *   /api/public/creations/[slug]/image (public creations only)
 *   /api/profile/avatar                (owner only)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { UPLOADS_DIR } from "./db";

export type ImageVariant = "full" | "thumb";

export interface StorageDriver {
  readonly name: string;
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Key handling                                                        */
/* ------------------------------------------------------------------ */

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,220}$/;

/** Rejects traversal, absolute paths and anything that isn't a plain object key. */
export function isSafeKey(key: string): boolean {
  if (!SAFE_KEY.test(key)) return false;
  if (key.includes("..") || key.includes("//") || key.endsWith("/")) return false;
  return true;
}

export function creationKey(
  userId: string,
  creationId: string,
  variant: ImageVariant,
  ext: "png" | "jpg" | "webp"
): string {
  return `creations/${userId}/${creationId}/${variant}.${ext}`;
}

export function avatarKey(userId: string, ext: "png" | "jpg" | "webp"): string {
  return `avatars/${userId}/avatar.${ext}`;
}

/* ------------------------------------------------------------------ */
/* Local filesystem driver                                             */
/* ------------------------------------------------------------------ */

class LocalDriver implements StorageDriver {
  readonly name = "local";

  private resolve(key: string): string | null {
    if (!isSafeKey(key)) return null;
    const full = path.join(/* turbopackIgnore: true */ UPLOADS_DIR, key);
    const root = path.resolve(/* turbopackIgnore: true */ UPLOADS_DIR);
    const resolved = path.resolve(full);
    // Belt and braces: the resolved path must stay inside the uploads root.
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
    return resolved;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.resolve(key);
    if (!target) throw new Error("Unsafe storage key");
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write-then-rename so a crash can never leave a half-written image.
    const tmp = `${target}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, target);
  }

  async get(key: string): Promise<Buffer | null> {
    const target = this.resolve(key);
    if (!target) return null;
    try {
      return await fs.readFile(target);
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    const target = this.resolve(key);
    if (!target) return;
    try {
      await fs.unlink(target);
    } catch {
      /* already gone — deletion is idempotent */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Vercel Blob driver (production)                                     */
/* ------------------------------------------------------------------ */

/**
 * Production driver for Vercel deployments. Activated with:
 *   STORAGE_DRIVER=blob
 *   BLOB_READ_WRITE_TOKEN=<from the Vercel Blob store>
 *
 * Every object is written with `access: "private"` — blobs are never exposed
 * via public URLs; bytes flow only through ZenFrame's authorization-checked
 * routes (owner/admin for private creations, exact-slug match for public ones).
 * Object keys are the same platform-independent keys the local driver uses, so
 * a database row is portable between drivers.
 */
class VercelBlobDriver implements StorageDriver {
  readonly name = "blob";

  private async sdk() {
    return import("@vercel/blob");
  }

  async put(key: string, data: Buffer): Promise<void> {
    if (!isSafeKey(key)) throw new Error("Unsafe storage key");
    const { put } = await this.sdk();
    await put(key, data, {
      access: "private",
      addRandomSuffix: false,
      contentType: key.endsWith(".png")
        ? "image/png"
        : key.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg",
    });
  }

  async get(key: string): Promise<Buffer | null> {
    if (!isSafeKey(key)) return null;
    try {
      const { get } = await this.sdk();
      const result = await get(key, { access: "private" });
      if (!result || !result.stream) return null;
      // Assemble the response stream into a Buffer for the route handlers.
      const chunks: Buffer[] = [];
      const reader = result.stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks);
    } catch (err) {
      // Not-found is a normal miss; anything else is a real provider error.
      const name = err instanceof Error ? err.name : "";
      if (name === "BlobNotFoundError" || name === "BlobAccessError") return null;
      throw err;
    }
  }

  async remove(key: string): Promise<void> {
    if (!isSafeKey(key)) return;
    try {
      const { del } = await this.sdk();
      await del(key);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "BlobNotFoundError") return; // deletion is idempotent
      throw err;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Driver selection                                                    */
/* ------------------------------------------------------------------ */

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  const name = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (name === "blob") {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error(
        `[storage] STORAGE_DRIVER=blob requires BLOB_READ_WRITE_TOKEN. ` +
          `Set it in the Vercel project environment (it is injected automatically ` +
          `when a Blob store is connected to the project).`
      );
    }
    driver = new VercelBlobDriver();
    return driver;
  }
  if (name !== "local") {
    throw new Error(
      `[storage] STORAGE_DRIVER="${name}" is not implemented. ZenFrame ships ` +
        `with "local" (development) and "blob" (Vercel production); see README ` +
        `"Storage architecture" to add another provider.`
    );
  }
  driver = new LocalDriver();
  return driver;
}

/* ------------------------------------------------------------------ */
/* High-level helpers used by routes                                   */
/* ------------------------------------------------------------------ */

export async function putImage(
  key: string,
  data: Buffer
): Promise<{ key: string; bytes: number }> {
  await getStorage().put(key, data);
  return { key, bytes: data.length };
}

export async function readCreationImage(key: string): Promise<Buffer | null> {
  return getStorage().get(key);
}

export async function deleteCreationImage(key: string): Promise<void> {
  return getStorage().remove(key);
}

/** Removes every stored artefact for a creation (full + thumbnail). */
export async function deleteCreationObjects(keys: (string | null)[]): Promise<void> {
  await Promise.all(
    keys.filter((k): k is string => Boolean(k)).map((k) => getStorage().remove(k))
  );
}
