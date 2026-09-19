#!/usr/bin/env node
/**
 * Regenerates the app touch icons + favicon into public/ and src/app/.
 *
 * Run:
 *   node scripts/make-icons.mjs
 *
 * It writes:
 *   public/icon-192.png    (PWA manifest icon)
 *   public/icon-512.png    (PWA manifest icon)
 *   public/favicon.svg     (scalable favicon)
 *   src/app/apple-icon.png (apple-touch-icon, served by Next at /apple-icon.png)
 *
 * Uses sharp (already a Next.js dependency) to rasterize the brand SVG — no
 * native canvas build needed. Re-run any time the brand art changes.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "public");
const APP = path.join(__dirname, "..", "src", "app");

// Brand colors from the ZenFrame design system
const CREAM = "#FBF7F1";
const JADE = "#0F766E";

function brandSVG(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${CREAM}"/>
  <circle cx="${size * 0.5}" cy="${size * 0.5}" r="${size * 0.42}" fill="none" stroke="${JADE}" stroke-width="${Math.max(2, size * 0.02)}"/>
  <circle cx="${size * 0.5}" cy="${size * 0.5}" r="${size * 0.2}" fill="${JADE}" fill-opacity="0.15"/>
  <path d="M ${size * 0.32} ${size * 0.62} C ${size * 0.38} ${size * 0.5}, ${size * 0.62} ${size * 0.5}, ${size * 0.68} ${size * 0.62}" fill="none" stroke="${JADE}" stroke-width="${Math.max(2, size * 0.015)}" stroke-linecap="round"/>
</svg>`;
}

async function main() {
  fs.mkdirSync(PUBLIC, { recursive: true });

  for (const [name, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
  ]) {
    const out = path.join(PUBLIC, name);
    await sharp(Buffer.from(brandSVG(size))).png().toFile(out);
    console.log(`wrote ${out}`);
  }

  // Apple touch icon lives in src/app so Next serves it at /apple-icon.png
  const apple = path.join(APP, "apple-icon.png");
  await sharp(Buffer.from(brandSVG(180))).png().toFile(apple);
  console.log(`wrote ${apple}`);

  const fav = path.join(PUBLIC, "favicon.svg");
  fs.writeFileSync(fav, brandSVG(32));
  console.log(`wrote ${fav}`);

  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
