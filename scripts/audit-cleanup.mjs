#!/usr/bin/env node
/**
 * Final release-readiness audit — covers the public surface the full smoke
 * suite doesn't, plus a dead-code signal scan.
 *
 * Usage (against a running dev or built server):
 *   SMOKE_BASE=http://localhost:3000 node scripts/audit-cleanup.mjs
 *
 * Checks:
 *   - /manifest.json is valid JSON and references icons that actually resolve
 *   - apple/icon/favicon assets resolve and are valid PNG/SVG
 *   - /robots.txt and /sitemap.xml resolve
 *   - dead-code signals (zz_ prefixed files, *.bak/*.old, empty route dirs)
 *
 * Exits 0 when everything is clean, 1 on a real failure, 2 on an unexpected
 * error. The dead-code section is informational — nothing is auto-removed.
 */

import fs from "node:fs";
import path from "node:path";

const BASE =
  process.env.SMOKE_BASE ||
  `http://localhost:${process.env.SMOKE_PORT ?? 3000}`;

async function body(p) {
  const url = BASE.replace(/\/$/, "") + p;
  const res = await fetch(url, { headers: { Pragma: "no-cache" } });
  const buffer = await res.arrayBuffer();
  return {
    status: res.status,
    buffer,
    text: new TextDecoder().decode(buffer),
  };
}

function isPng(buf) {
  if (buf.byteLength < 8) return false;
  const b = new Uint8Array(buf);
  return (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  );
}

function isSvg(text) {
  return /^\s*(<svg\b|<\?xml)/i.test(text);
}

const checks = [];
function add(label, passed, detail = "") {
  checks.push({ label, passed, detail });
  console.log(`${passed ? "✓" : "✗"} ${label}${detail ? " — " + detail : ""}`);
}

async function runHttp() {
  console.log("\nPublic surface");
  console.log("--------------");

  // manifest.json — valid JSON, every referenced icon resolves
  {
    const m = await body("/manifest.json");
    let json = null;
    if (m.status !== 200) {
      add("manifest.json returns 200", false, String(m.status));
    } else {
      try {
        json = JSON.parse(m.text);
        add("manifest.json is valid JSON", true);
      } catch {
        add("manifest.json is valid JSON", false, "parse failed");
      }
    }
    if (json) {
      add("manifest has name", !!json.name, json.name || "");
      add(
        "manifest has icons array",
        Array.isArray(json.icons) && json.icons.length > 0,
        json.icons ? `${json.icons.length} icons` : ""
      );
      for (const icon of json.icons ?? []) {
        const r = await body(icon.src);
        const okStatus = r.status === 200;
        const okType =
          icon.type === "image/svg+xml"
            ? isSvg(r.text)
            : icon.type === "image/png"
              ? isPng(r.buffer)
              : true; // unknown declared type: presence is enough
        add(
          `manifest icon ${icon.src} (${icon.sizes}) resolves & matches type`,
          okStatus && okType,
          okStatus ? `${r.buffer.byteLength} bytes` : `HTTP ${r.status}`
        );
      }
    }
  }

  // standalone icon routes Next.js picks up from src/app
  for (const p of ["/apple-icon.png", "/icon.svg", "/favicon.ico"]) {
    const r = await body(p);
    if (r.status !== 200) {
      add(`${p} returns 200`, false, String(r.status));
      continue;
    }
    if (p.endsWith(".png")) {
      add(`${p} is a valid PNG`, isPng(r.buffer), `${r.buffer.byteLength} bytes`);
    } else {
      add(`${p} responds`, true, `${r.buffer.byteLength} bytes`);
    }
  }

  // SEO surface
  for (const p of ["/robots.txt", "/sitemap.xml"]) {
    const r = await body(p);
    add(`${p} returns 200`, r.status === 200, String(r.status));
  }
}

// ---- dead-code signal scan (informational) -------------------------------
function deadCodeSignals() {
  const roots = ["src", "scripts"];
  const findings = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.length === 0) {
      findings.push(`EMPTY DIR: ${path.relative(process.cwd(), dir)}`);
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (/^zz_/.test(e.name) || /\.(bak|old|tmp|orig|rej)$/i.test(e.name)) {
        findings.push(`SUSPECT FILE: ${path.relative(process.cwd(), full)}`);
      }
    }
  }

  for (const root of roots) walk(path.join(process.cwd(), root));
  return findings;
}

async function main() {
  const t0 = Date.now();
  await runHttp();

  console.log("\nDead-code signals (review only — not auto-removed)");
  console.log("--------------------------------------------------");
  const findings = deadCodeSignals();
  if (findings.length === 0) {
    console.log("none");
  } else {
    for (const f of findings) console.log("⚠ " + f);
  }

  const failed = checks.filter((c) => !c.passed);
  console.log(
    `\n${checks.length} HTTP checks in ${Date.now() - t0}ms. ` +
      (failed.length
        ? `${failed.length} failed: ${failed.map((c) => c.label).join("; ")}`
        : "all passed")
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
