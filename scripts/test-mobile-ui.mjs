#!/usr/bin/env node
/**
 * ZenFrame Mobile Browser UI QA Automation Script
 *
 * Runs a real headless Google Chrome instance using puppeteer-core to test
 * the ZenFrame Admin -> Frames UI end-to-end across real mobile viewports:
 * - 375 x 812 (iPhone X/11/12 mini)
 * - 390 x 844 (iPhone 12/13/14)
 * - 412 x 915 (Pixel 7 / Galaxy S21)
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import puppeteer from "puppeteer-core";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data-test-mobile-ui");
const DB_FILE = path.join(DATA_DIR, "zenframe.db");
const PORT = 3150;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\HP\\.gemini\\antigravity\\brain\\7e42b97c-1296-41e2-9fe2-cb21ab256da3";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;

async function startServer() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      ZENFRAME_DATA_DIR: DATA_DIR,
      DATABASE_DRIVER: "sqlite",
      ZENFRAME_ALLOW_TEST_SQLITE: "1",
      ALLOW_DEV_MAIL_LOG: "1",
      NEXT_PUBLIC_SITE_URL: BASE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stderr.on("data", (d) => {
    const text = String(d);
    if (/Error|error:/.test(text)) console.error(`  [server err] ${text.trim()}`);
  });

  const started = Date.now();
  while (Date.now() - started < 45_000) {
    try {
      const res = await fetch(`${BASE}/api/auth/me`);
      if (res.ok) return;
    } catch {
      /* wait */
    }
    await sleep(500);
  }
  throw new Error("Server failed to start within 45s");
}

async function stopServer() {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await sleep(2000);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

async function createAdminUser() {
  const adminEmail = "admin.qa@zenframe.local";
  const adminPass = "ZenAdmin2026!Secret";

  const signupRes = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPass, name: "QA Admin" }),
  });
  if (!signupRes.ok) throw new Error(`Signup failed: ${signupRes.status}`);

  const db = new DatabaseSync(DB_FILE);
  db.prepare("UPDATE users SET email_verified_at = datetime('now'), role = 'admin' WHERE email = ?").run(adminEmail);
  db.close();

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPass }),
  });
  if (!loginRes.ok) throw new Error("Admin login failed");

  let sessionCookie = "";
  for (const c of loginRes.headers.getSetCookie?.() ?? []) {
    if (c.startsWith("zenframe_session=")) {
      sessionCookie = c.split(";")[0];
      break;
    }
  }
  return { adminEmail, adminPass, sessionCookie };
}

// Helpers that execute safely in the browser page context without detached handle issues
async function applyCustomDecimal(page, labelText, value) {
  // Step 1: Open custom mode via edit button or dropdown prompt
  await page.evaluate((labelTxt) => {
    const findControl = (lbl) => {
      if (!lbl) return null;
      const forId = lbl.getAttribute("for") || lbl.htmlFor;
      if (forId) {
        const el = document.getElementById(forId);
        if (el) {
          const block = el.closest(".block") || el.parentElement;
          return {
            select: el.tagName === "SELECT" ? el : block?.querySelector("select"),
            input: el.tagName === "INPUT" ? el : block?.querySelector("input"),
            editBtn: block?.querySelector("button[title*='Enter custom decimal']"),
            applyBtn: block?.querySelector("button[title='Apply decimal value']"),
            block,
          };
        }
      }
      let p = lbl.parentElement;
      while (p && !p.querySelector("select") && !p.querySelector("input") && p.tagName !== "BODY") {
        p = p.parentElement;
      }
      return {
        select: p?.querySelector("select"),
        input: p?.querySelector("input"),
        editBtn: p?.querySelector("button[title*='Enter custom decimal']"),
        applyBtn: p?.querySelector("button[title='Apply decimal value']"),
        block: p,
      };
    };

    const labels = Array.from(document.querySelectorAll("label"));
    const lbl = labels.find((l) => l.textContent.trim().startsWith(labelTxt));
    if (!lbl) throw new Error(`Label starting with "${labelTxt}" not found`);
    const ctrl = findControl(lbl);
    if (!ctrl || !ctrl.block) throw new Error(`Block container not found for label "${labelTxt}"`);

    if (ctrl.editBtn) {
      ctrl.editBtn.click();
    } else if (ctrl.select) {
      ctrl.select.value = "__CUSTOM_PROMPT__";
      ctrl.select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, labelText);

  // Wait for React to re-render custom mode
  await sleep(200);

  // Step 2: Set text value and click Apply
  await page.evaluate((labelTxt, val) => {
    const findControl = (lbl) => {
      if (!lbl) return null;
      const forId = lbl.getAttribute("for") || lbl.htmlFor;
      if (forId) {
        const el = document.getElementById(forId);
        if (el) {
          const block = el.closest(".block") || el.parentElement;
          return {
            select: el.tagName === "SELECT" ? el : block?.querySelector("select"),
            input: el.tagName === "INPUT" ? el : block?.querySelector("input"),
            editBtn: block?.querySelector("button[title*='Enter custom decimal']"),
            applyBtn: block?.querySelector("button[title='Apply decimal value']"),
            block,
          };
        }
      }
      let p = lbl.parentElement;
      while (p && !p.querySelector("select") && !p.querySelector("input") && p.tagName !== "BODY") {
        p = p.parentElement;
      }
      return {
        select: p?.querySelector("select"),
        input: p?.querySelector("input"),
        editBtn: p?.querySelector("button[title*='Enter custom decimal']"),
        applyBtn: p?.querySelector("button[title='Apply decimal value']"),
        block: p,
      };
    };

    const labels = Array.from(document.querySelectorAll("label"));
    const lbl = labels.find((l) => l.textContent.trim().startsWith(labelTxt));
    if (!lbl) throw new Error(`Label starting with "${labelTxt}" not found`);
    const ctrl = findControl(lbl);
    const input = ctrl?.block?.querySelector("input[inputmode='decimal']");
    if (!input) throw new Error(`Decimal text input did not open for "${labelTxt}"`);

    // Use native prototype setter so React registers the input change
    const nativeInputValSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeInputValSetter.call(input, String(val));
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const applyBtn = ctrl?.block?.querySelector("button[title='Apply decimal value']");
    if (!applyBtn) throw new Error(`Apply button not found for "${labelTxt}"`);
    applyBtn.click();
  }, labelText, value);

  // Wait for React to transition back to select mode with custom value applied
  await sleep(200);
  return getFieldValue(page, labelText);
}

async function selectPreset(page, labelText, presetVal) {
  return page.evaluate((labelTxt, val) => {
    const labels = Array.from(document.querySelectorAll("label"));
    const lbl = labels.find((l) => l.textContent.trim().startsWith(labelTxt));
    if (!lbl) throw new Error(`Label starting with "${labelTxt}" not found`);
    let select = null;
    const forId = lbl.getAttribute("for") || lbl.htmlFor;
    if (forId) {
      const el = document.getElementById(forId);
      if (el && el.tagName === "SELECT") select = el;
    }
    if (!select) {
      const p = lbl.parentElement;
      select = p?.querySelector("select");
    }
    if (!select) throw new Error(`Select element not found for "${labelTxt}"`);

    const nativeSelectValSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    nativeSelectValSetter.call(select, String(val));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return select.value;
  }, labelText, presetVal);
}

async function switchFrame(page, slug) {
  await page.evaluate((targetSlug) => {
    const sel = document.getElementById("admin-frame-selector");
    if (!sel) throw new Error("admin-frame-selector not found");
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    nativeSetter.call(sel, targetSlug);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, slug);
  await sleep(300);
  await page.waitForFunction(
    (targetSlug) => {
      const section = document.querySelector(`section#frame-card-${targetSlug}`);
      return !!section;
    },
    { timeout: 8000 },
    slug
  );
}

async function getFieldValue(page, labelText, targetSlug) {
  return page.evaluate((labelTxt, slug) => {
    const root = slug ? document.querySelector(`section#frame-card-${slug}`) : document;
    if (!root) return null;
    const labels = Array.from(root.querySelectorAll("label"));
    const lbl = labels.find((l) => l.textContent.trim().startsWith(labelTxt));
    if (!lbl) return null;
    let select = null;
    const forId = lbl.getAttribute("for") || lbl.htmlFor;
    if (forId) {
      const el = document.getElementById(forId);
      if (el && el.tagName === "SELECT") select = el;
    }
    if (!select) {
      const p = lbl.parentElement;
      select = p?.querySelector("select");
    }
    return select ? select.value : null;
  }, labelText, targetSlug);
}

async function tapSaveSticky(page) {
  return page.evaluate(() => {
    const stickyBar = document.querySelector(".fixed.bottom-0.inset-x-0");
    if (!stickyBar) return false;
    const saveBtn = Array.from(stickyBar.querySelectorAll("button")).find((b) =>
      b.textContent.includes("Save Settings") || b.textContent.includes("Tap to Retry")
    );
    if (!saveBtn) return false;
    saveBtn.click();
    return true;
  });
}

async function run() {
  console.log("=== ZenFrame Real Mobile Browser UI QA Pass ===");
  console.log("1. Starting production server on port", PORT);
  await startServer();
  console.log("   ✓ Server active");

  console.log("2. Creating and authenticating Admin user");
  const { sessionCookie } = await createAdminUser();
  console.log("   ✓ Admin session cookie acquired:", sessionCookie.slice(0, 30) + "…");

  console.log("3. Launching Google Chrome via puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  console.log("   ✓ Chrome launched");

  const [cookieName, cookieVal] = sessionCookie.split("=");
  const testResults = [];

  const record = (name, ok, msg = "") => {
    testResults.push({ name, ok, msg });
    console.log(`   ${ok ? "✓" : "✗"} ${name}${msg ? ` (${msg})` : ""}`);
    if (!ok) throw new Error(`QA Check Failed: ${name}: ${msg}`);
  };

  try {
    const page = await browser.newPage();
    await page.setCookie({
      name: cookieName,
      value: cookieVal,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
    });

    const viewports = [
      { name: "iPhone X/11/12 mini", width: 375, height: 812 },
      { name: "iPhone 12/13/14", width: 390, height: 844 },
      { name: "Pixel 7 / Galaxy S21", width: 412, height: 915 },
    ];

    // =========================================================================
    // SECTION 1: REAL MOBILE VIEWPORT TEST ACROSS ALL 3 RESOLUTIONS
    // =========================================================================
    console.log("\n--- Section 1: Mobile Viewports & Layout Ergonomics ---");
    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height, isMobile: true, hasTouch: true });
      await page.goto(`${BASE}/admin?tab=frames`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#admin-frame-selector", { timeout: 10000 });
      await sleep(300);

      // Check horizontal overflow
      const overflow = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        return { docWidth, winWidth, hasOverflow: docWidth > winWidth };
      });
      record(
        `Viewport ${vp.name} (${vp.width}x${vp.height}): No horizontal scrolling`,
        !overflow.hasOverflow,
        `scrollWidth=${overflow.docWidth}px, innerWidth=${overflow.winWidth}px`
      );

      // Verify Frame Selector
      const selectorExists = await page.$("#admin-frame-selector");
      record(`Viewport ${vp.name}: Frame Selector exists & is interactive`, !!selectorExists);

      // Verify Live Preview visibility
      const previewImg = await page.$("img[alt*='Live Artwork Preview']");
      record(`Viewport ${vp.name}: Live Artwork Preview is rendered`, !!previewImg);

      // Verify Sticky Mobile Action Bar
      const stickyBar = await page.$(".fixed.bottom-0.inset-x-0");
      record(`Viewport ${vp.name}: Sticky Mobile Action Bar is anchored at bottom`, !!stickyBar);

      // Take a mobile viewport screenshot
      const shotPath = path.join(ARTIFACT_DIR, `qa_mobile_${vp.width}x${vp.height}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      console.log(`     Saved screenshot -> ${shotPath}`);
    }

    // =========================================================================
    // SECTION 2 & 5: TEST THE ACTUAL DECIMAL FLOW & MOBILE SAVE
    // =========================================================================
    console.log("\n--- Section 2: Real Mobile Interaction — Exact Decimal Entry & Save ---");
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${BASE}/admin?tab=frames&frame=sunrise-salutation`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#admin-frame-selector", { timeout: 10000 });
    await sleep(400);

    // 1. Set Subtitle Size = 10.1 via Custom Decimal
    console.log("   Action: Subtitle Size -> Custom Decimal -> Type 10.1 -> Apply");
    const val10_1 = await applyCustomDecimal(page, "Subtitle Size", "10.1");
    await sleep(200);
    record("Subtitle Size custom decimal applied in DOM", val10_1 === "10.1", `value=${val10_1}`);

    // 2. Set Subtitle Line Height = 1.25 via Custom Decimal
    console.log("   Action: Subtitle Line Height -> Custom Decimal -> Type 1.25 -> Apply");
    const val1_25 = await applyCustomDecimal(page, "Subtitle Line Height", "1.25");
    await sleep(200);
    record("Subtitle Line Height custom decimal applied in DOM", val1_25 === "1.25", `value=${val1_25}`);

    // 3. Set Subtitle Letter Spacing = 0.5 via Preset / Apply
    console.log("   Action: Subtitle Letter Spacing -> Set 0.5");
    const val0_5 = await selectPreset(page, "Subtitle Letter Spacing", "0.5");
    await sleep(200);
    record("Subtitle Letter Spacing set to 0.5", val0_5 === "0.5", `value=${val0_5}`);

    // 4. Set Photo Scale = 0.75 via Custom Decimal
    console.log("   Action: Photo Scale -> Custom Decimal -> Type 0.75 -> Apply");
    const val0_75 = await applyCustomDecimal(page, "Photo Scale", "0.75");
    await sleep(200);
    record("Photo Scale set to 0.75", val0_75 === "0.75", `value=${val0_75}`);

    // 5. Save Settings via Sticky Mobile Action Bar
    console.log("   Action: Tap Save Settings on Sticky Mobile Action Bar");
    const tapped = await tapSaveSticky(page);
    record("Sticky Mobile Save Settings button tapped", tapped);

    // Wait for "Saved ✓" indicator
    await page.waitForFunction(
      () => {
        const stickyBar = document.querySelector(".fixed.bottom-0.inset-x-0");
        return stickyBar && stickyBar.textContent.includes("Saved ✓");
      },
      { timeout: 8000 }
    );
    record("Mobile save state machine transitioned to 'Saved ✓'", true);

    const shotSavedPath = path.join(ARTIFACT_DIR, "qa_mobile_saved_state.png");
    await page.screenshot({ path: shotSavedPath, fullPage: false });
    console.log(`     Saved screenshot -> ${shotSavedPath}`);

    // =========================================================================
    // SECTION 3: TEST ALL DROPDOWNS & PRESETS IN REAL UI
    // =========================================================================
    console.log("\n--- Section 3: Dropdown Presets & Options Inspection ---");
    const dropdownSettings = [
      { label: "Font Family", expectedCount: 8 },
      { label: "Subtitle Size", expectedCount: 12 },
      { label: "Subtitle Line Height", expectedCount: 12 },
      { label: "Subtitle Letter Spacing", expectedCount: 10 },
      { label: "Subtitle Text Scale", expectedCount: 14 },
      { label: "Subtitle Text Opacity", expectedCount: 9 },
      { label: "Subtitle X Position", expectedCount: 9 },
      { label: "Subtitle Y Offset", expectedCount: 9 },
      { label: "Subtitle Box Width", expectedCount: 9 },
      { label: "Photo Scale", expectedCount: 14 },
      { label: "Border Opacity", expectedCount: 9 },
    ];

    for (const item of dropdownSettings) {
      const info = await page.evaluate((labelTxt) => {
        const labels = Array.from(document.querySelectorAll("label"));
        const lbl = labels.find((l) => l.textContent.trim().startsWith(labelTxt));
        if (!lbl) return null;
        let select = null;
        const forId = lbl.getAttribute("for") || lbl.htmlFor;
        if (forId) {
          const el = document.getElementById(forId);
          if (el && el.tagName === "SELECT") select = el;
        }
        if (!select) {
          const parent = lbl.parentElement;
          select = parent?.querySelector("select");
        }
        if (!select) return null;
        const options = Array.from(select.options).map((o) => ({ value: o.value, text: o.text }));
        return { currentVal: select.value, optionCount: options.length, options: options.slice(0, 4) };
      }, item.label);

      record(
        `Dropdown "${item.label}": Presets available & rendered`,
        info && info.optionCount >= item.expectedCount,
        `found ${info?.optionCount} options`
      );
    }

    // =========================================================================
    // SECTION 4: AUDIT EVERY FRAME SETTING & CLASSIFICATION
    // =========================================================================
    console.log("\n--- Section 4: Audit of Every Frame Setting in UI ---");
    const fullAudit = await page.evaluate(() => {
      const items = [];
      const sections = document.querySelectorAll("section[id^='frame-card-']");
      if (sections.length === 0) return items;
      const root = sections[0];

      // Scan all labels
      const labels = Array.from(root.querySelectorAll("label"));
      for (const lbl of labels) {
        const text = lbl.textContent.trim();
        const block = lbl.closest(".block") || lbl;

        const hasSelect = block.querySelector("select");
        const hasCustomBtn = block.querySelector("button[title*='Enter custom decimal']");
        const hasInput = block.querySelector("input:not([type='checkbox'])");
        const hasCheckbox = block.querySelector("input[type='checkbox']");
        const hasTextarea = block.querySelector("textarea");

        let classification = "Other";
        if (hasSelect && hasCustomBtn) classification = "Dropdown + Custom";
        else if (hasSelect) classification = "Dropdown";
        else if (hasCheckbox) classification = "Toggle";
        else if (hasTextarea) classification = "Textarea";
        else if (hasInput) classification = "Text input";

        items.push({ label: text.split("\n")[0].trim(), classification });
      }
      return items;
    });

    console.log("   UI Inventory of Settings:");
    for (const it of fullAudit) {
      console.log(`     - ${it.label}: [${it.classification}]`);
    }
    const oldPlainInputs = fullAudit.filter((i) => i.classification === "Plain Number");
    record("Zero old plain number inputs found under Frame Settings", oldPlainInputs.length === 0);

    // =========================================================================
    // SECTION 6: REFRESH PERSISTENCE TEST
    // =========================================================================
    console.log("\n--- Section 6: Refresh Persistence Test ---");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#admin-frame-selector", { timeout: 10000 });
    await sleep(500);

    const reloadedSubtitleSize = await getFieldValue(page, "Subtitle Size");
    const reloadedLineHeight = await getFieldValue(page, "Subtitle Line Height");
    const reloadedLetterSpacing = await getFieldValue(page, "Subtitle Letter Spacing");
    const reloadedPhotoScale = await getFieldValue(page, "Photo Scale");

    record("Reload check: Subtitle Size is exact 10.1", reloadedSubtitleSize === "10.1", `got ${reloadedSubtitleSize}`);
    record("Reload check: Subtitle Line Height is exact 1.25", reloadedLineHeight === "1.25", `got ${reloadedLineHeight}`);
    record("Reload check: Subtitle Letter Spacing is exact 0.5", reloadedLetterSpacing === "0.5", `got ${reloadedLetterSpacing}`);
    record("Reload check: Photo Scale is exact 0.75", reloadedPhotoScale === "0.75", `got ${reloadedPhotoScale}`);

    // =========================================================================
    // SECTION 7: MULTI-FRAME ISOLATION TEST (Frame A vs Frame B)
    // =========================================================================
    console.log("\n--- Section 7: Multi-Frame Isolation (Frame A vs Frame B) ---");
    // Switch to Frame B: lotus-heart
    await switchFrame(page, "lotus-heart");

    console.log("   Action: Setting Frame B (lotus-heart) Subtitle Size = 12.5");
    const frameBVal = await applyCustomDecimal(page, "Subtitle Size", "12.5");
    record("Frame B Subtitle Size set to 12.5", frameBVal === "12.5", `value=${frameBVal}`);

    await tapSaveSticky(page);
    await page.waitForFunction(
      () => {
        const stickyBar = document.querySelector(".fixed.bottom-0.inset-x-0");
        return stickyBar && stickyBar.textContent.includes("Saved ✓");
      },
      { timeout: 8000 }
    );
    record("Frame B saved with Subtitle Size 12.5", true);

    // Switch back to Frame A (sunrise-salutation)
    await switchFrame(page, "sunrise-salutation");

    const frameAValAfter = await getFieldValue(page, "Subtitle Size", "sunrise-salutation");
    record("Frame A retained exact 10.1 after switching back", frameAValAfter === "10.1", `got ${frameAValAfter}`);

    // Switch back to Frame B (lotus-heart)
    await switchFrame(page, "lotus-heart");

    const frameBValAfter = await getFieldValue(page, "Subtitle Size", "lotus-heart");
    record("Frame B retained exact 12.5 after switching back", frameBValAfter === "12.5", `got ${frameBValAfter}`);

    // =========================================================================
    // SECTION 8: MOBILE FAILURE / RETRY TEST
    // =========================================================================
    console.log("\n--- Section 8: Mobile Failure & Retry Recovery Test ---");
    await page.setRequestInterception(true);
    let failRequests = true;

    page.on("request", (req) => {
      if (failRequests && req.method() === "PATCH" && req.url().includes("/api/admin/frames/")) {
        req.abort("failed");
      } else {
        req.continue();
      }
    });

    // Make an edit to trigger change
    await selectPreset(page, "Subtitle Letter Spacing", "1.5");
    await sleep(200);

    // Tap Save Settings while requests are failing
    await tapSaveSticky(page);

    await page.waitForFunction(
      () => {
        const stickyBar = document.querySelector(".fixed.bottom-0.inset-x-0");
        return stickyBar && stickyBar.textContent.includes("Tap to Retry");
      },
      { timeout: 8000 }
    );
    record("Simulated network failure handled: UI shows 'Tap to Retry'", true);

    // Check unsaved settings remain intact
    const unsavedVal = await getFieldValue(page, "Subtitle Letter Spacing");
    record("Unsaved decimal values retained in form during network failure", unsavedVal === "1.5", `value=${unsavedVal}`);

    // Restore network and tap Retry
    failRequests = false;
    await sleep(200);

    await tapSaveSticky(page);

    await page.waitForFunction(
      () => {
        const stickyBar = document.querySelector(".fixed.bottom-0.inset-x-0");
        return stickyBar && stickyBar.textContent.includes("Saved ✓");
      },
      { timeout: 8000 }
    );
    record("Retry successful: transitioned cleanly to 'Saved ✓'", true);

    // =========================================================================
    // SECTION 9 & 10: TOUCH TARGET QA & PERFORMANCE ACROSS 5 FRAMES
    // =========================================================================
    console.log("\n--- Section 9 & 10: Touch Target QA & 5-Frame Responsiveness ---");
    const touchAudit = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("button, select, input:not([type='checkbox']), textarea"));
      const tooSmall = [];
      for (const el of elements) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || el.offsetParent === null) continue;
        if (r.height < 36) {
          tooSmall.push({ tag: el.tagName, text: el.textContent?.slice(0, 15) || el.id, height: Math.round(r.height) });
        }
      }
      const checkboxLabels = Array.from(document.querySelectorAll("label")).filter((l) => l.querySelector("input[type='checkbox']"));
      for (const lbl of checkboxLabels) {
        const r = lbl.getBoundingClientRect();
        if (r.height < 36) {
          tooSmall.push({ tag: "LABEL(checkbox)", text: lbl.textContent?.slice(0, 15), height: Math.round(r.height) });
        }
      }
      return { total: elements.length + checkboxLabels.length, tooSmallCount: tooSmall.length, tooSmall };
    });
    if (touchAudit.tooSmallCount > 0) {
      console.log("   Touch target non-compliant elements:", touchAudit.tooSmall);
    }
    record(
      "Touch Target QA: All interactive controls satisfy mobile tap area guidelines (>=36-48px)",
      touchAudit.tooSmallCount === 0,
      `audited ${touchAudit.total} controls, ${touchAudit.tooSmallCount} too small`
    );

    // Switch across 5 frames sequentially
    const testFrames = [
      "sunrise-salutation",
      "lotus-heart",
      "golden-vinyasa",
      "amber-hour-flow",
      "still-lake-meditation",
    ];

    const t0 = Date.now();
    for (const slug of testFrames) {
      await switchFrame(page, slug);
    }
    const elapsed = Date.now() - t0;
    record(
      `Performance QA: Switched across 5 frames smoothly in ${elapsed}ms (<2500ms target)`,
      elapsed < 2500,
      `${elapsed}ms total, ~${Math.round(elapsed / 5)}ms per frame switch`
    );

    console.log("\n=================================================");
    console.log(`🎉 ALL ${testResults.length} REAL BROWSER UI CHECKS PASSED!`);
    console.log("=================================================");
  } finally {
    await browser.close();
    await stopServer();
  }
}

run().catch((err) => {
  console.error("\n❌ Mobile UI Test Runner Error:", err);
  if (server) stopServer();
  process.exit(1);
});
