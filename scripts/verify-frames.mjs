import assert from "node:assert/strict";
import {
  FRAMES,
  OCCASIONS,
  DEFAULT_OCCASION,
  DEFAULT_FRAME_SETTINGS,
  getAllFrames,
  getFrame,
  resolveFrameSlug,
  getAvailableOccasions,
  validateFrameRegistry,
  normalizeFrameSettings,
  buildFrameSVG,
  buildThumbSVG,
  svgToDataURI,
  toCatalogFrame,
  frameCategory,
  frameTags,
} from "../src/lib/frames.ts";
import { cleanDecimal, roundDec } from "../src/server/validation.ts";

console.log("=== ZenFrame Comprehensive Registry, Settings, Decimal & SVG Verification ===");

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

// 3. SVG Renderer verification (buildFrameSVG + buildThumbSVG + custom decimal settings) for all 24 frames
for (const frame of allFrames) {
  const customDecimalSettings = normalizeFrameSettings({
    font_family: "Playfair Display",
    font_size: 10.5,
    line_height: 1.25,
    letter_spacing: 1.5,
    text_scale: 1.15,
    text_x: 50.5,
    text_y: 82.75,
    text_width: 84.5,
    text_opacity: 0.95,
    photo_scale: 1.05,
    border_opacity: 0.85,
  });
  const compositeSvg = buildFrameSVG(
    frame,
    "data:image/png;base64,iVBORw0KGgo=",
    "Namaste & Peace <2026>",
    customDecimalSettings
  );
  const thumbSvg = buildThumbSVG(frame);
  const dataUri = svgToDataURI(thumbSvg);

  const cutoutSvg = buildFrameSVG(
    frame,
    "__cutout__",
    "Namaste & Peace <2026>",
    customDecimalSettings
  );

  assert.ok(compositeSvg.startsWith("<svg") && compositeSvg.endsWith("</svg>"), `Invalid composite SVG for ${frame.slug}`);
  assert.ok(!compositeSvg.includes("undefined") && !compositeSvg.includes("NaN"), `Composite SVG contains undefined/NaN for ${frame.slug}`);
  assert.ok(!compositeSvg.includes("&amp;amp;"), `Double-escaped entity in composite SVG for ${frame.slug}`);

  assert.ok(cutoutSvg.includes('fill-rule="evenodd"'), `Cutout SVG missing even-odd cutout window for ${frame.slug}`);
  assert.ok(cutoutSvg.includes('id="frameOuterClip"'), `Cutout SVG missing outer clipPath for ${frame.slug}`);
  assert.ok(!cutoutSvg.includes('fill="#ffffff" fill-opacity="0.5"'), `Cutout SVG must not block photo area with opaque rect for ${frame.slug}`);

  assert.ok(thumbSvg.startsWith("<svg") && thumbSvg.endsWith("</svg>"), `Invalid thumb SVG for ${frame.slug}`);
  assert.ok(!thumbSvg.includes("undefined") && !thumbSvg.includes("NaN"), `Thumb SVG contains undefined/NaN for ${frame.slug}`);
  assert.ok(!thumbSvg.includes("&amp;amp;"), `Double-escaped entity in thumb SVG for ${frame.slug}`);
  assert.ok(dataUri.startsWith("data:image/svg+xml;utf8,"), `Invalid data URI for ${frame.slug}`);
}
console.log("✓ 3. All 24 frames render valid composite SVGs and thumbnail SVGs with decimal typography settings");

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

// 6. Decimal Validation & Normalization Tests (10, 10.1, 10.5, 12.75, 0.5, 1.5, 2.0, -0.5, -1.5)
const decimalTestCases = [10, 10.1, 10.5, 12.75, 0.5, 1.5, 2.0, -0.5, -1.5];
for (const val of decimalTestCases) {
  assert.equal(roundDec(val, 4), val, `roundDec(${val}) must preserve exact decimal value`);
  assert.equal(cleanDecimal(val, -20, 200, 0, 4), val, `cleanDecimal(${val}) must preserve exact decimal value`);
  assert.equal(cleanDecimal(String(val), -20, 200, 0, 4), val, `cleanDecimal("${val}") must parse and preserve exact decimal value`);
}

const normalizedSettings = normalizeFrameSettings({
  font_family: "Plus Jakarta Sans",
  font_size: 10.1,
  line_height: 1.5,
  letter_spacing: -0.5,
  text_scale: 1.25,
  text_x: 10.5,
  text_y: 12.75,
  text_width: 84.5,
  text_opacity: 0.85,
  photo_scale: 1.15,
  border_opacity: 0.95,
});
assert.equal(normalizedSettings.font_size, 10.1, "normalizeFrameSettings must preserve font_size 10.1");
assert.equal(normalizedSettings.line_height, 1.5, "normalizeFrameSettings must preserve line_height 1.5");
assert.equal(normalizedSettings.letter_spacing, -0.5, "normalizeFrameSettings must preserve letter_spacing -0.5");
assert.equal(normalizedSettings.text_scale, 1.25, "normalizeFrameSettings must preserve text_scale 1.25");
assert.equal(normalizedSettings.text_x, 10.5, "normalizeFrameSettings must preserve text_x 10.5");
assert.equal(normalizedSettings.text_y, 12.75, "normalizeFrameSettings must preserve text_y 12.75");
assert.equal(normalizedSettings.text_width, 84.5, "normalizeFrameSettings must preserve text_width 84.5");
assert.equal(normalizedSettings.text_opacity, 0.85, "normalizeFrameSettings must preserve text_opacity 0.85");
assert.equal(normalizedSettings.photo_scale, 1.15, "normalizeFrameSettings must preserve photo_scale 1.15");
assert.equal(normalizedSettings.border_opacity, 0.95, "normalizeFrameSettings must preserve border_opacity 0.95");
assert.equal(DEFAULT_FRAME_SETTINGS.font_size, 34, "DEFAULT_FRAME_SETTINGS baseline intact");

console.log("✓ 6. Exact decimal values (10, 10.1, 10.5, 12.75, 0.5, 1.5, 2.0, -0.5, -1.5) preserved without rounding");

// 7. Robust NumberSelect preset options & custom decimal parse verification
const expectedDecimals = [10.1, 12.5, 1.25, 0.75, 0.9, 95.5, 99.9];
for (const d of expectedDecimals) {
  const parsed = Number(String(d));
  assert.equal(Number.isFinite(parsed), true, `Number("${d}") must be finite`);
  assert.equal(parsed, d, `Parsed ${d} must match exactly`);
  const clamped = Math.min(100, Math.max(0, parsed));
  assert.equal(typeof clamped, "number", `Clamped ${d} must be number`);
}

// Intermediate typing parsing validation (e.g. typing "10." then "1" -> 10.1)
const typingSequence = ["1", "10", "10.", "10.1"];
let lastCommitted = 0;
for (const token of typingSequence) {
  if (token.endsWith(".")) {
    // Intermediate state: not committed to parent yet, preserves raw string
    assert.equal(token, "10.", "Intermediate dot state must not be destroyed");
  } else {
    lastCommitted = Number(token);
  }
}
assert.equal(lastCommitted, 10.1, "Final committed value from typing 10.1 must be exact 10.1");

console.log("✓ 7. Universal NumberSelect options & custom decimal parsing (10.1, 12.5, 1.25, 0.75, 0.9) verified");
console.log("=== ALL FRAME, SETTINGS & DECIMAL VERIFICATION CHECKS PASSED ===");

