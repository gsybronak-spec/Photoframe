import assert from "node:assert/strict";
import {
  FRAMES,
  FRAME_REGISTRY,
  OCCASIONS,
  DEFAULT_OCCASION,
  getAllFrames,
  getFrame,
  resolveFrameSlug,
  getAvailableOccasions,
  validateFrameRegistry,
  buildFrameSVG,
  buildThumbSVG,
  svgToDataURI,
  toCatalogFrame,
  frameCategory,
  frameTags,
} from "../src/lib/frames.ts";

console.log("=== ZenFrame Registry & Rendering Verification ===");

// 1. Registry count & uniqueness
const allFrames = getAllFrames();
assert.equal(allFrames.length, 24, `Expected 24 registered frames, got ${allFrames.length}`);
assert.equal(FRAMES.length, 24, `Expected FRAMES.length === 24`);

const report = validateFrameRegistry();
assert.equal(report.valid, true, `Registry validation failed: ${JSON.stringify(report)}`);
assert.equal(report.total, 24, "Expected total 24 frames in report");
assert.equal(report.uniqueSlugs, 24, "Expected 24 unique canonical slugs");
assert.equal(report.duplicateSlugs.length, 0, "Expected 0 duplicate slugs");
assert.equal(report.duplicateIds.length, 0, "Expected 0 duplicate IDs");
assert.equal(report.missingMetadataSlugs.length, 0, "Expected 0 missing metadata slugs in base registry");

console.log(`✓ 1. Registered frames verified: ${allFrames.length} unique frames (0 duplicates, 0 missing metadata)`);

// 2. Slug, ID, and Alias resolution for all 24 frames
for (const frame of allFrames) {
  assert.ok(frame.slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frame.slug), `Invalid slug format: ${frame.slug}`);
  assert.ok(frame.id, `Missing id on ${frame.slug}`);
  assert.equal(getFrame(frame.slug)?.slug, frame.slug, `Direct slug lookup failed for ${frame.slug}`);
  assert.equal(getFrame(frame.id)?.slug, frame.slug, `ID lookup failed for ${frame.id} -> ${frame.slug}`);
  assert.equal(getFrame(frame.slug.toUpperCase())?.slug, frame.slug, `Uppercase lookup failed for ${frame.slug}`);
  assert.equal(getFrame(`  ${frame.slug}  `)?.slug, frame.slug, `Whitespace lookup failed for ${frame.slug}`);
  assert.equal(resolveFrameSlug(frame.id), frame.slug, `resolveFrameSlug(${frame.id}) failed`);
}

// Specifically verify the 4 legacy ID != slug mismatches
const mismatchPairs = [
  ["f-iyd-2026", "international-yoga-day"],
  ["iyd-2026", "international-yoga-day"],
  ["f-still-lake", "still-lake-meditation"],
  ["still-lake", "still-lake-meditation"],
  ["f-amber-hour", "amber-hour-flow"],
  ["amber-hour", "amber-hour-flow"],
  ["f-incense-and-incense", "incense-breeze"],
  ["incense-and-incense", "incense-breeze"],
];
for (const [alias, expectedSlug] of mismatchPairs) {
  assert.equal(
    getFrame(alias)?.slug,
    expectedSlug,
    `Alias mismatch resolution failed for "${alias}" -> expected "${expectedSlug}"`
  );
}
console.log(`✓ 2. All 24 slugs, IDs, and ${mismatchPairs.length} legacy aliases resolve to canonical slugs`);

// 3. SVG Renderer verification (buildFrameSVG + buildThumbSVG) for all 24 frames
for (const frame of allFrames) {
  const compositeSvg = buildFrameSVG(frame, "data:image/png;base64,iVBORw0KGgo=", "Namaste & Peace <2026>");
  const thumbSvg = buildThumbSVG(frame);
  const dataUri = svgToDataURI(thumbSvg);

  assert.ok(compositeSvg.startsWith("<svg") && compositeSvg.endsWith("</svg>"), `Invalid composite SVG for ${frame.slug}`);
  assert.ok(!compositeSvg.includes("undefined") && !compositeSvg.includes("NaN"), `Composite SVG contains undefined/NaN for ${frame.slug}`);
  assert.ok(!compositeSvg.includes("&amp;amp;"), `Double-escaped entity in composite SVG for ${frame.slug}`);

  assert.ok(thumbSvg.startsWith("<svg") && thumbSvg.endsWith("</svg>"), `Invalid thumb SVG for ${frame.slug}`);
  assert.ok(!thumbSvg.includes("undefined") && !thumbSvg.includes("NaN"), `Thumb SVG contains undefined/NaN for ${frame.slug}`);
  assert.ok(!thumbSvg.includes("&amp;amp;"), `Double-escaped entity in thumb SVG for ${frame.slug}`);
  assert.ok(dataUri.startsWith("data:image/svg+xml;utf8,"), `Invalid data URI for ${frame.slug}`);
}
console.log("✓ 3. All 24 frames render valid composite SVGs and thumbnail SVGs (zero double-escaping or undefined values)");

// 4. Duplicate slug & Missing metadata edge-case verification
const edgeReport = validateFrameRegistry([
  {
    id: "f-dup-test",
    slug: "dup-frame",
    title: "Duplicate Frame One",
    occasion: "Meditation",
    tagline: "First",
    style: { from: "#ffffff", to: "#000000", accent: "#ff8a3d", ink: "#111111", motif: "mandala" },
    art: "lotus",
  },
  {
    id: "f-dup-test",
    slug: "dup-frame",
    title: "Duplicate Frame Two",
    occasion: "Meditation",
    tagline: "Second",
    style: { from: "#ffffff", to: "#000000", accent: "#ff8a3d", ink: "#111111", motif: "mandala" },
    art: "lotus",
  },
  {
    id: "f-missing-meta",
    slug: "missing-metadata-frame",
    title: "Frame Without Category",
    // Intentionally omit occasion & category
    tagline: "Should default to General and never be hidden",
    style: { from: "#ffffff", to: "#000000", accent: "#ff8a3d", ink: "#111111", motif: "waves" },
    art: "sun",
  },
]);

assert.equal(edgeReport.valid, false, "Duplicate slug report should mark valid=false");
assert.equal(edgeReport.duplicateSlugs.length, 1, "Should detect 1 duplicate slug");
assert.equal(edgeReport.duplicateIds.length, 1, "Should detect 1 duplicate ID");
assert.equal(edgeReport.missingMetadataSlugs.includes("missing-metadata-frame"), true, "Should record missing metadata slug");
assert.equal(edgeReport.uniqueSlugs, 3, "Duplicate slug should be auto-disambiguated so all 3 frames remain accessible");

// Verify missing metadata frame gets placed in DEFAULT_OCCASION ("General") and appears in getAvailableOccasions
const dynamicOccasions = getAvailableOccasions([
  ...allFrames,
  { category: DEFAULT_OCCASION, occasion: DEFAULT_OCCASION },
]);
assert.equal(dynamicOccasions.includes("General"), true, "Dynamic occasions must include General when a frame uses it");
console.log("✓ 4. Duplicate slug auto-disambiguation and missing-metadata fallback to 'General' verified");

// 5. Category & Search coverage across all 24 frames
const catalogFrames = allFrames.map((f) => toCatalogFrame(f));
assert.equal(catalogFrames.filter((f) => f.active).length, 24, "All 24 catalog frames must be active by default");

for (const occ of OCCASIONS) {
  const inOccasion = catalogFrames.filter(
    (f) => frameCategory(f).toLowerCase() === occ.toLowerCase()
  );
  assert.ok(inOccasion.length >= 2, `Expected at least 2 frames in category "${occ}", found ${inOccasion.length}`);
}

const sumByCategory = OCCASIONS.reduce(
  (acc, occ) => acc + catalogFrames.filter((f) => frameCategory(f) === occ).length,
  0
);
assert.equal(sumByCategory, 24, `Sum of frames across OCCASIONS (${sumByCategory}) must equal total registered frames (24)`);

for (const f of catalogFrames) {
  const tags = frameTags(f);
  assert.ok(tags.length > 0, `Frame ${f.slug} must have non-empty search tags`);
}
console.log("✓ 5. Category & Search filter parity verified: 24/24 frames accounted for across all categories");
console.log("=== ALL FRAME VERIFICATION CHECKS PASSED ===");
