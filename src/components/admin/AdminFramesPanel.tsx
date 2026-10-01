"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Filter,
  Layers,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sliders,
  Sparkles,
  Type,
} from "lucide-react";
import {
  buildFrameSVG,
  DEFAULT_FRAME_SETTINGS,
  getAllFrames,
  getFrame,
  normalizeFrameSettings,
  resolveFrameSlug,
  svgToDataURI,
  toCatalogFrame,
  type FrameNumericSettings,
} from "@/lib/frames";
import {
  FONT_SIZE_OPTIONS,
  LETTER_SPACING_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  NumberSelect,
  OPACITY_PERCENT_OPTIONS,
  POSITION_X_OPTIONS,
  POSITION_Y_OPTIONS,
  SCALE_OPTIONS,
  WIDTH_PERCENT_OPTIONS,
} from "@/components/ui/NumberSelect";

interface FrameRow {
  id: string;
  slug: string;
  title: string;
  occasion: string;
  tagline: string;
  art: string;
  category: string;
  description: string;
  tags: string[];
  active: boolean;
  featured: boolean;
  settings: FrameNumericSettings;
  overridden: boolean;
  updatedAt: string | null;
}

interface Draft {
  description: string;
  category: string;
  tags: string;
  featured: boolean;
  active: boolean;
  settings: FrameNumericSettings;
}

type SaveStatus = "idle" | "changed" | "saving" | "saved" | "error";

const FRAME_FONTS = [
  "Fraunces",
  "Playfair Display",
  "Plus Jakarta Sans",
  "Cormorant Garamond",
  "Lora",
  "Merriweather",
  "Inter",
  "Georgia",
];

function buildCodeDefaultRows(): FrameRow[] {
  return getAllFrames().map((raw) => {
    const f = toCatalogFrame(raw);
    return {
      id: f.id,
      slug: f.slug,
      title: f.title,
      occasion: f.occasion,
      tagline: f.tagline,
      art: f.art,
      category: f.category || f.occasion || "General",
      description: f.description,
      tags: [...f.tags],
      active: f.active !== false,
      featured: Boolean(f.featured),
      settings: normalizeFrameSettings(f.settings),
      overridden: false,
      updatedAt: null,
    };
  });
}

function toDraft(f: FrameRow): Draft {
  return {
    description: f.description,
    category: f.category || f.occasion || "General",
    tags: f.tags.join(", "),
    featured: f.featured,
    active: f.active,
    settings: normalizeFrameSettings(f.settings),
  };
}

function settingsEqual(a: FrameNumericSettings, b: FrameNumericSettings): boolean {
  return (
    a.font_family === b.font_family &&
    Number(a.font_size) === Number(b.font_size) &&
    Number(a.line_height) === Number(b.line_height) &&
    Number(a.letter_spacing) === Number(b.letter_spacing) &&
    Number(a.text_scale) === Number(b.text_scale) &&
    Number(a.text_x) === Number(b.text_x) &&
    Number(a.text_y) === Number(b.text_y) &&
    Number(a.text_width) === Number(b.text_width) &&
    Number(a.text_opacity) === Number(b.text_opacity) &&
    Number(a.photo_scale) === Number(b.photo_scale) &&
    Number(a.border_opacity) === Number(b.border_opacity)
  );
}

/**
 * Mobile-First Frame Settings & Metadata Studio.
 *
 * Guarantees:
 * 1. Mobile-Optimized Selector: Focuses cleanly on one frame at a time on mobile viewports.
 * 2. Precision Decimal Controls: Pre-curated presets + custom decimal input with zero key-eating.
 * 3. Immediate Local Preview: SVG updates in real-time as settings change before saving.
 * 4. Resilient Mobile Save: Mutex-locked, abort-timeout protected, sticky bottom action bar.
 * 5. Full 24-Frame Integrity: All 24 frames remain permanently accessible and persistent.
 */
export function AdminFramesPanel() {
  const [frames, setFrames] = useState<FrameRow[]>(() => buildCodeDefaultRows());
  const [categories, setCategories] = useState<string[]>([
    "Daily Practice",
    "Meditation",
    "Pranayama",
    "Surya Namaskar",
    "Nature & Retreats",
    "Events & Milestones",
    "General",
  ]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(buildCodeDefaultRows().map((f) => [f.slug, toDraft(f)]))
  );

  const [selectedSlug, setSelectedSlug] = useState<string>(() => {
    if (typeof window === "undefined") return "sunrise-salutation";
    const params = new URLSearchParams(window.location.search);
    const urlFrame = params.get("frame");
    const storedFrame = window.localStorage.getItem("zenframe:selectedFrameSlug");
    const candidate = urlFrame || storedFrame;
    if (candidate) {
      if (candidate === "all") return "all";
      const resolved = resolveFrameSlug(candidate);
      if (resolved) return resolved;
    }
    return "sunrise-salutation";
  });

  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveStates, setSaveStates] = useState<Record<string, SaveStatus>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState("");

  const savingRef = useRef<Record<string, boolean>>({});

  const selectFrame = (slugOrAll: string) => {
    const resolved =
      slugOrAll === "all" ? "all" : resolveFrameSlug(slugOrAll) ?? slugOrAll;
    setSelectedSlug(resolved);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("zenframe:selectedFrameSlug", resolved);
      const url = new URL(window.location.href);
      if (resolved === "all") url.searchParams.set("frame", "all");
      else url.searchParams.set("frame", resolved);
      window.history.replaceState({}, "", url.toString());
    }
  };

  /** Load all frames from API while merging with the 24-frame code registry so zero frames are dropped. */
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/frames", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not load frames.");
        return;
      }

      const apiBySlug = new Map<string, FrameRow>();
      for (const item of (data.frames ?? []) as Partial<FrameRow>[]) {
        const canonical = resolveFrameSlug(item.slug ?? item.id) ?? item.slug;
        if (!canonical) continue;
        apiBySlug.set(canonical, {
          id: item.id ?? canonical,
          slug: canonical,
          title: item.title ?? canonical,
          occasion: item.occasion ?? "General",
          tagline: item.tagline ?? "",
          art: item.art ?? "lotus",
          category: item.category ?? item.occasion ?? "General",
          description: item.description ?? "",
          tags: Array.isArray(item.tags) ? item.tags : [],
          active: item.active !== false,
          featured: Boolean(item.featured),
          settings: normalizeFrameSettings(item.settings),
          overridden: Boolean(item.overridden),
          updatedAt: item.updatedAt ?? null,
        });
      }

      // Always merge with all 24 code frames so no registered frame is ever dropped
      const mergedFrames: FrameRow[] = buildCodeDefaultRows().map(
        (codeFrame) => apiBySlug.get(codeFrame.slug) ?? codeFrame
      );

      setFrames(mergedFrames);
      if (Array.isArray(data.categories) && data.categories.length > 0) {
        setCategories(Array.from(new Set([...categories, ...data.categories])));
      }
      setDrafts(Object.fromEntries(mergedFrames.map((f) => [f.slug, toDraft(f)])));
    } catch {
      setError("Network trouble — check your connection and tap Reload.");
    } finally {
      setLoading(false);
    }
  }, [categories]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (slug: string, changes: Partial<Draft>) => {
    setDrafts((prev) => {
      const current = prev[slug];
      if (!current) return prev;
      return { ...prev, [slug]: { ...current, ...changes } };
    });
    setSaveStates((prev) => ({ ...prev, [slug]: "changed" }));
    if (saveErrors[slug]) {
      setSaveErrors((prev) => ({ ...prev, [slug]: "" }));
    }
  };

  const patchSetting = <K extends keyof FrameNumericSettings>(
    slug: string,
    key: K,
    val: FrameNumericSettings[K]
  ) => {
    setDrafts((prev) => {
      const current = prev[slug];
      if (!current) return prev;
      return {
        ...prev,
        [slug]: {
          ...current,
          settings: {
            ...current.settings,
            [key]: val,
          },
        },
      };
    });
    setSaveStates((prev) => ({ ...prev, [slug]: "changed" }));
    if (saveErrors[slug]) {
      setSaveErrors((prev) => ({ ...prev, [slug]: "" }));
    }
  };

  const resetSettingsToDefault = (slug: string) => {
    patch(slug, { settings: { ...DEFAULT_FRAME_SETTINGS } });
  };

  const save = async (slug: string) => {
    const draft = drafts[slug];
    if (!draft) return;
    if (savingRef.current[slug]) return; // mutex lock

    savingRef.current[slug] = true;
    setSaveStates((prev) => ({ ...prev, [slug]: "saving" }));
    setSaveErrors((prev) => ({ ...prev, [slug]: "" }));
    setError("");
    setFlash("");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`/api/admin/frames/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          description: draft.description,
          category: draft.category,
          tags: draft.tags,
          featured: draft.featured,
          active: draft.active,
          settings: draft.settings,
        }),
      });
      window.clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const msg = data.error ?? "Could not save settings. Please retry.";
        setSaveStates((prev) => ({ ...prev, [slug]: "error" }));
        setSaveErrors((prev) => ({ ...prev, [slug]: msg }));
        return;
      }

      const normalizedSettings = normalizeFrameSettings(data.frame.settings);
      setFrames((prev) =>
        prev.map((f) =>
          f.slug === slug
            ? {
                ...f,
                description: data.frame.description,
                category: data.frame.category,
                tags: data.frame.tags,
                featured: data.frame.featured,
                active: data.frame.active,
                settings: normalizedSettings,
                overridden: data.frame.overridden,
                updatedAt: data.frame.updatedAt ?? f.updatedAt,
              }
            : f
        )
      );

      setDrafts((prev) => ({
        ...prev,
        [slug]: {
          description: data.frame.description,
          category: data.frame.category,
          tags: Array.isArray(data.frame.tags)
            ? data.frame.tags.join(", ")
            : draft.tags,
          featured: Boolean(data.frame.featured),
          active: Boolean(data.frame.active),
          settings: normalizedSettings,
        },
      }));

      setSaveStates((prev) => ({ ...prev, [slug]: "saved" }));
      setFlash(`Saved “${data.frame.title ?? slug}” settings ✓`);

      window.setTimeout(() => {
        setSaveStates((prev) => (prev[slug] === "saved" ? { ...prev, [slug]: "idle" } : prev));
      }, 3500);
    } catch (err) {
      window.clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === "AbortError";
      const msg = isAbort
        ? "Save request timed out. Please check your connection and tap Retry."
        : "Network trouble — unable to save settings. Please tap Retry.";
      setSaveStates((prev) => ({ ...prev, [slug]: "error" }));
      setSaveErrors((prev) => ({ ...prev, [slug]: msg }));
    } finally {
      savingRef.current[slug] = false;
    }
  };

  const visibleFrames = useMemo(() => {
    const q = search.trim().toLowerCase();
    return frames.filter((f) => {
      if (selectedSlug !== "all" && f.slug !== selectedSlug) return false;
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.slug.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [frames, selectedSlug, search]);

  if (loading) {
    return (
      <div className="glass flex items-center justify-center gap-3 rounded-[2rem] p-12 text-sm font-semibold text-ink-soft">
        <Loader2 className="h-5 w-5 animate-spin text-coral" aria-hidden /> Loading frame registry…
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28 sm:pb-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-ink sm:text-3xl">
            <Sparkles className="h-6 w-6 text-saffron-deep" aria-hidden /> Frame Settings
          </h2>
          <p className="mt-1 text-xs text-ink-soft sm:text-sm">
            Configure typography, precise decimal positions, and metadata across all {frames.length} frames.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-sand px-3 py-1 font-mono text-xs font-semibold text-ink-soft">
            {frames.length} registered
          </span>
          <button
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="btn-ghost flex min-h-[44px] items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold text-ink"
            title="Reload all frames from server"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Reload
          </button>
        </div>
      </div>

      {/* Frame Selector Bar (Mobile-First Touch Dropdown + Quick Search) */}
      <div className="glass rounded-3xl p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-12 sm:items-end">
          <div className="sm:col-span-7">
            <label
              htmlFor="admin-frame-selector"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft"
            >
              <Filter className="h-3.5 w-3.5 text-coral" aria-hidden /> Active Frame ({frames.length} Total)
            </label>
            <select
              id="admin-frame-selector"
              value={selectedSlug}
              onChange={(e) => selectFrame(e.target.value)}
              className="w-full rounded-2xl border border-amber-900/15 bg-white px-4 py-3 text-sm font-bold text-ink shadow-sm transition hover:border-coral focus:border-coral focus:ring-2 focus:ring-coral/20 focus:outline-none"
            >
              {frames.map((f, idx) => (
                <option key={f.slug} value={f.slug}>
                  {idx + 1}. {f.title} ({f.occasion}) {!f.active ? "[Hidden]" : ""}
                </option>
              ))}
              <option value="all">── Show all {frames.length} frames (Grid view) ──</option>
            </select>
          </div>

          <div className="sm:col-span-5">
            <label
              htmlFor="admin-frame-search"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft"
            >
              <Search className="h-3.5 w-3.5 text-teal" aria-hidden /> Search by name / tag
            </label>
            <input
              id="admin-frame-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search frames…"
              className="w-full rounded-2xl border border-amber-900/15 bg-white px-4 py-3 text-sm font-medium text-ink shadow-sm focus:border-coral focus:ring-2 focus:ring-coral/20 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {flash && (
        <div role="status" className="flex items-center gap-2 rounded-2xl bg-jade/15 px-4 py-3 text-sm font-bold text-jade-deep">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> {flash}
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-coral/10 px-4 py-3 text-sm font-bold text-coral">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </div>
      )}

      {visibleFrames.length === 0 && (
        <div className="glass rounded-3xl p-8 text-center text-sm font-semibold text-ink-soft">
          No frames match your search.{" "}
          <button
            type="button"
            onClick={() => {
              setSearch("");
              selectFrame("all");
            }}
            className="text-coral underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Frame Settings Cards */}
      {visibleFrames.map((f) => {
        const draft = drafts[f.slug] ?? toDraft(f);
        const state = saveStates[f.slug] ?? "idle";
        const rowErr = saveErrors[f.slug];
        const isChanged =
          draft.description !== f.description ||
          draft.category !== f.category ||
          draft.tags !== f.tags.join(", ") ||
          draft.featured !== f.featured ||
          draft.active !== f.active ||
          !settingsEqual(draft.settings, f.settings);

        const codeFrame = getFrame(f.slug);
        const previewUri = codeFrame
          ? svgToDataURI(buildFrameSVG(codeFrame, undefined, f.tagline || "Mindful Presence", draft.settings))
          : null;

        return (
          <section
            key={f.slug}
            id={`frame-card-${f.slug}`}
            className="glass space-y-6 rounded-[2rem] p-5 sm:p-7 shadow-glass"
            aria-labelledby={`frame-${f.slug}`}
          >
            {/* Header & Meta Badges */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-amber-900/10 pb-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={`frame-${f.slug}`} className="font-display text-2xl font-bold text-ink">
                    {f.title}
                  </h3>
                  <Link
                    href={`/frames/${f.slug}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-full bg-cream px-3 py-1 text-xs font-bold text-teal-deep hover:text-coral"
                  >
                    Open Editor <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  <span>
                    Slug: <code className="font-mono font-bold text-ink">/{f.slug}</code>
                  </span>
                  <span>·</span>
                  <span>Category: {f.occasion}</span>
                  <span>·</span>
                  <span>Art: {f.art}</span>
                  {f.overridden && (
                    <span className="rounded-full bg-saffron/15 px-2 py-0.5 text-[10px] font-bold text-saffron-deep">
                      Customized
                    </span>
                  )}
                </p>
              </div>

              {/* Active & Featured Checkboxes (Large 44px Touch Targets) */}
              <div className="flex items-center gap-3">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-sand/60 px-3 py-2 text-xs font-bold text-ink transition hover:bg-sand">
                  <input
                    type="checkbox"
                    checked={draft.featured}
                    onChange={(e) => patch(f.slug, { featured: e.target.checked })}
                    className="h-4 w-4 accent-saffron"
                  />
                  Featured
                </label>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-sand/60 px-3 py-2 text-xs font-bold text-ink transition hover:bg-sand">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(e) => patch(f.slug, { active: e.target.checked })}
                    className="h-4 w-4 accent-jade"
                  />
                  Active
                </label>
              </div>
            </div>

            {/* Live Interactive Artwork Preview */}
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-900/10 bg-sand/40 p-4 sm:flex-row sm:items-start">
              {previewUri && (
                <div className="relative h-44 w-36 shrink-0 overflow-hidden rounded-2xl border-2 border-amber-900/15 bg-cream shadow-md transition sm:h-52 sm:w-42">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUri}
                    alt={`${f.title} Live Artwork Preview`}
                    className="h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-ink/75 px-2 py-0.5 text-[9px] font-bold text-white shadow">
                    Live Preview
                  </div>
                </div>
              )}
              <div className="flex-1 text-center sm:text-left">
                <h4 className="font-display text-base font-bold text-ink">Interactive Real-Time Preview</h4>
                <p className="mt-1 text-xs text-ink-soft">
                  Changes to typography, decimal size, opacity, and positioning reflect immediately on this preview. Press <strong>Save Settings</strong> below to persist to the database.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-mono text-ink-soft">
                  <span className="rounded-lg bg-white px-2 py-1 shadow-sm">
                    Font: {draft.settings.font_family}
                  </span>
                  <span className="rounded-lg bg-white px-2 py-1 shadow-sm">
                    Size: {draft.settings.font_size}px
                  </span>
                  <span className="rounded-lg bg-white px-2 py-1 shadow-sm">
                    Line Height: {draft.settings.line_height}
                  </span>
                  <span className="rounded-lg bg-white px-2 py-1 shadow-sm">
                    Opacity: {Math.round(draft.settings.text_opacity * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Section 1: Typography Settings (Decimal Safe) */}
            <div className="rounded-2xl border border-amber-900/10 bg-white/70 p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-amber-900/10 pb-3">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink">
                  <Type className="h-4 w-4 text-coral" aria-hidden /> Typography Settings (Dropdowns + Decimal Safe)
                </span>
                <button
                  type="button"
                  onClick={() => resetSettingsToDefault(f.slug)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-cream px-4 py-2 text-xs font-semibold text-ink-soft transition hover:text-ink"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset to Defaults
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Font Family Dropdown */}
                <div className="block w-full">
                  <label className="mb-1.5 block text-xs font-semibold text-ink-soft">
                    Font Family
                  </label>
                  <select
                    value={draft.settings.font_family}
                    onChange={(e) => patchSetting(f.slug, "font_family", e.target.value)}
                    className="w-full min-h-[44px] rounded-2xl border border-amber-900/15 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:border-coral focus:border-coral focus:ring-2 focus:ring-coral/20 focus:outline-none"
                  >
                    {FRAME_FONTS.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Font Size */}
                <NumberSelect
                  label="Subtitle Size"
                  value={draft.settings.font_size}
                  onChange={(v) => patchSetting(f.slug, "font_size", v)}
                  options={FONT_SIZE_OPTIONS}
                  min={6}
                  max={120}
                  unit="px"
                />

                {/* Line Height */}
                <NumberSelect
                  label="Subtitle Line Height"
                  value={draft.settings.line_height}
                  onChange={(v) => patchSetting(f.slug, "line_height", v)}
                  options={LINE_HEIGHT_OPTIONS}
                  min={0.5}
                  max={4}
                />

                {/* Letter Spacing */}
                <NumberSelect
                  label="Subtitle Letter Spacing"
                  value={draft.settings.letter_spacing}
                  onChange={(v) => patchSetting(f.slug, "letter_spacing", v)}
                  options={LETTER_SPACING_OPTIONS}
                  min={-5}
                  max={24}
                  unit="px"
                />

                {/* Text Scale */}
                <NumberSelect
                  label="Subtitle Text Scale"
                  value={draft.settings.text_scale}
                  onChange={(v) => patchSetting(f.slug, "text_scale", v)}
                  options={SCALE_OPTIONS}
                  min={0.25}
                  max={3}
                  unit="×"
                />

                {/* Text Opacity */}
                <NumberSelect
                  label="Subtitle Text Opacity"
                  value={draft.settings.text_opacity}
                  onChange={(v) => patchSetting(f.slug, "text_opacity", v)}
                  options={OPACITY_PERCENT_OPTIONS}
                  min={0}
                  max={1}
                  unit="%"
                  displayAsPercentage={true}
                />
              </div>
            </div>

            {/* Section 2: Position & Dimensions */}
            <div className="rounded-2xl border border-amber-900/10 bg-white/70 p-4 sm:p-5">
              <div className="mb-4 border-b border-amber-900/10 pb-3">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink">
                  <Sliders className="h-4 w-4 text-teal" aria-hidden /> Position &amp; Layout (% of Canvas)
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <NumberSelect
                  label="Subtitle X Position"
                  value={draft.settings.text_x}
                  onChange={(v) => patchSetting(f.slug, "text_x", v)}
                  options={POSITION_X_OPTIONS}
                  min={0}
                  max={100}
                  unit="%"
                />

                <NumberSelect
                  label="Subtitle Y Offset"
                  value={draft.settings.text_y}
                  onChange={(v) => patchSetting(f.slug, "text_y", v)}
                  options={POSITION_Y_OPTIONS}
                  min={0}
                  max={100}
                  unit="%"
                />

                <NumberSelect
                  label="Subtitle Box Width"
                  value={draft.settings.text_width}
                  onChange={(v) => patchSetting(f.slug, "text_width", v)}
                  options={WIDTH_PERCENT_OPTIONS}
                  min={10}
                  max={100}
                  unit="%"
                />
              </div>
            </div>

            {/* Section 3: Photo & Frame Styling */}
            <div className="rounded-2xl border border-amber-900/10 bg-white/70 p-4 sm:p-5">
              <div className="mb-4 border-b border-amber-900/10 pb-3">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink">
                  <Layers className="h-4 w-4 text-saffron-deep" aria-hidden /> Photo &amp; Border Styling
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <NumberSelect
                  label="Photo Scale"
                  value={draft.settings.photo_scale}
                  onChange={(v) => patchSetting(f.slug, "photo_scale", v)}
                  options={SCALE_OPTIONS}
                  min={0.25}
                  max={3}
                  unit="×"
                />

                <NumberSelect
                  label="Border Opacity"
                  value={draft.settings.border_opacity}
                  onChange={(v) => patchSetting(f.slug, "border_opacity", v)}
                  options={OPACITY_PERCENT_OPTIONS}
                  min={0}
                  max={1}
                  unit="%"
                  displayAsPercentage={true}
                />
              </div>
            </div>

            {/* Section 4: Metadata & SEO */}
            <div className="rounded-2xl border border-amber-900/10 bg-white/70 p-4 sm:p-5">
              <div className="mb-4 border-b border-amber-900/10 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-ink">
                  Metadata &amp; Search Tags
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-soft">
                    Description (SEO &amp; Social sharing)
                  </span>
                  <textarea
                    rows={2}
                    value={draft.description}
                    onChange={(e) => patch(f.slug, { description: e.target.value.slice(0, 320) })}
                    className="w-full resize-y rounded-2xl border border-amber-900/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-coral"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-soft">
                    Category
                  </span>
                  <select
                    value={draft.category}
                    onChange={(e) => patch(f.slug, { category: e.target.value })}
                    className="w-full min-h-[44px] rounded-2xl border border-amber-900/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-coral"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-soft">
                    Tags (comma separated)
                  </span>
                  <input
                    value={draft.tags}
                    onChange={(e) => patch(f.slug, { tags: e.target.value })}
                    className="w-full min-h-[44px] rounded-2xl border border-amber-900/15 bg-white px-4 py-2.5 text-sm font-medium text-ink outline-none transition focus:border-coral"
                  />
                </label>
              </div>
            </div>

            {rowErr && (
              <div role="alert" className="flex items-center gap-2 rounded-2xl bg-coral/10 p-3.5 text-xs font-bold text-coral">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> {rowErr}
              </div>
            )}

            {/* Desktop Action Row */}
            <div className="hidden sm:flex sm:items-center sm:justify-between sm:pt-2">
              <div className="flex items-center gap-2">
                {isChanged && state !== "saved" && state !== "saving" && (
                  <span className="flex items-center gap-1.5 rounded-full bg-saffron/15 px-3 py-1 text-xs font-bold text-saffron-deep">
                    <span className="h-2 w-2 rounded-full bg-saffron animate-pulse" /> Unsaved changes
                  </span>
                )}
                {state === "saved" && (
                  <span className="flex items-center gap-1.5 rounded-full bg-jade/15 px-3 py-1 text-xs font-bold text-jade-deep">
                    <CheckCircle2 className="h-3.5 w-3.5" /> All settings saved
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => resetSettingsToDefault(f.slug)}
                  className="btn-ghost rounded-2xl px-4 py-2.5 text-xs font-bold text-ink-soft hover:text-ink"
                >
                  Reset Defaults
                </button>

                <button
                  type="button"
                  onClick={() => void save(f.slug)}
                  disabled={state === "saving"}
                  className="flex min-h-[44px] items-center gap-2 rounded-2xl bg-gradient-to-r from-saffron to-coral px-6 py-2.5 text-sm font-bold text-white shadow-md transition active:scale-95 disabled:opacity-50"
                >
                  {state === "saving" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
                    </>
                  ) : state === "saved" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" aria-hidden /> Saved ✓
                    </>
                  ) : state === "error" ? (
                    <>
                      <AlertCircle className="h-4 w-4" aria-hidden /> Retry Save
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" aria-hidden /> Save Settings
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Sticky Mobile Action Bar (Always Visible While Scrolling on Small Screens) */}
            <div className="fixed bottom-0 inset-x-0 z-30 flex items-center justify-between border-t border-amber-900/10 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-md sm:hidden">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-ink">
                  {isChanged ? (
                    <span className="flex items-center gap-1 text-saffron-deep">
                      <span className="h-2 w-2 rounded-full bg-saffron animate-pulse" /> Modified
                    </span>
                  ) : state === "saved" ? (
                    <span className="flex items-center gap-1 text-jade-deep">✓ Saved</span>
                  ) : (
                    <span className="text-ink-soft">Ready</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => resetSettingsToDefault(f.slug)}
                  className="flex min-h-[44px] items-center px-3 py-2 text-xs font-semibold text-ink-soft underline hover:text-ink"
                >
                  Reset
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void save(f.slug)}
                  disabled={state === "saving"}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-saffron to-coral px-5 py-2.5 text-xs font-extrabold text-white shadow-md transition active:scale-95 disabled:opacity-50"
                >
                  {state === "saving" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
                    </>
                  ) : state === "error" ? (
                    <>
                      <AlertCircle className="h-3.5 w-3.5" aria-hidden /> Tap to Retry
                    </>
                  ) : state === "saved" ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Saved ✓
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" aria-hidden /> Save Settings
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
