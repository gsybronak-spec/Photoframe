"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Filter,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
} from "lucide-react";
import {
  DEFAULT_FRAME_SETTINGS,
  getAllFrames,
  normalizeFrameSettings,
  resolveFrameSlug,
  toCatalogFrame,
  type FrameNumericSettings,
} from "@/lib/frames";
import {
  FONT_SIZE_OPTIONS,
  LETTER_SPACING_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  NumberSelect,
  OPACITY_OPTIONS,
  PERCENT_OPTIONS,
  SCALE_OPTIONS,
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

const FRAME_FONTS = [
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
 * Frame Settings & Metadata Studio.
 *
 * Guarantees:
 * - Every registered frame (all 24 frames) is always available and selectable, even if no DB override row exists yet.
 * - Selected frame persists across URL (`?frame=<slug>`) and localStorage so page refresh / re-open never loses selection.
 * - Numerical & typography settings accept and persist exact decimal values (`10.1`, `10.5`, `12.75`, `1.5`, `-0.5`, etc.).
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
  ]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(buildCodeDefaultRows().map((f) => [f.slug, toDraft(f)]))
  );
  const [selectedSlug, setSelectedSlug] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    const params = new URLSearchParams(window.location.search);
    const urlFrame = params.get("frame");
    const storedFrame = window.localStorage.getItem("zenframe:selectedFrameSlug");
    const candidate = urlFrame || storedFrame;
    if (candidate && candidate !== "all") {
      return resolveFrameSlug(candidate) ?? "all";
    }
    return "all";
  });
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveStates, setSaveStates] = useState<
    Record<string, "idle" | "saving" | "saved" | "error">
  >({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState("");

  const selectFrame = (slugOrAll: string) => {
    const resolved =
      slugOrAll === "all" ? "all" : resolveFrameSlug(slugOrAll) ?? slugOrAll;
    setSelectedSlug(resolved);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("zenframe:selectedFrameSlug", resolved);
      const url = new URL(window.location.href);
      if (resolved === "all") url.searchParams.delete("frame");
      else url.searchParams.set("frame", resolved);
      window.history.replaceState({}, "", url.toString());
    }
  };

  /** Load all frames from API while merging with the 24-frame code registry so zero frames are ever dropped. */
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

      // Always union with all 24 code registry frames so no registered frame can ever disappear
      const mergedFrames: FrameRow[] = buildCodeDefaultRows().map(
        (codeFrame) => apiBySlug.get(codeFrame.slug) ?? codeFrame
      );

      setFrames(mergedFrames);
      if (Array.isArray(data.categories) && data.categories.length > 0) {
        setCategories(data.categories);
      }
      setDrafts(Object.fromEntries(mergedFrames.map((f) => [f.slug, toDraft(f)])));
    } catch {
      setError("Network trouble — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const patch = (slug: string, changes: Partial<Draft>) => {
    setDrafts((prev) => {
      const current = prev[slug];
      if (!current) return prev;
      return { ...prev, [slug]: { ...current, ...changes } };
    });
    setSaveStates((prev) =>
      prev[slug] === "saved" || prev[slug] === "error"
        ? { ...prev, [slug]: "idle" }
        : prev
    );
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
    setSaveStates((prev) =>
      prev[slug] === "saved" || prev[slug] === "error"
        ? { ...prev, [slug]: "idle" }
        : prev
    );
  };

  const resetSettingsToDefault = (slug: string) => {
    patch(slug, { settings: { ...DEFAULT_FRAME_SETTINGS } });
  };

  const save = async (slug: string) => {
    const draft = drafts[slug];
    if (!draft || saveStates[slug] === "saving") return;
    setSaveStates((prev) => ({ ...prev, [slug]: "saving" }));
    setSaveErrors((prev) => ({ ...prev, [slug]: "" }));
    setError("");
    setFlash("");
    try {
      const res = await fetch(`/api/admin/frames/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: draft.description,
          category: draft.category,
          tags: draft.tags,
          featured: draft.featured,
          active: draft.active,
          settings: draft.settings,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const msg = data.error ?? "Could not save that frame.";
        setSaveStates((prev) => ({ ...prev, [slug]: "error" }));
        setSaveErrors((prev) => ({ ...prev, [slug]: msg }));
        setError(msg);
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
      setFlash(`Saved “${data.frame.title ?? slug}” settings.`);
    } catch {
      const msg = "Network trouble — check your connection and try again.";
      setSaveStates((prev) => ({ ...prev, [slug]: "error" }));
      setSaveErrors((prev) => ({ ...prev, [slug]: msg }));
      setError(msg);
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
      <p
        className="glass flex items-center gap-2 rounded-[2rem] p-8 text-sm text-ink-soft"
        role="status"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading frames…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
            <Sparkles className="h-5 w-5 text-saffron-deep" aria-hidden /> Frame Settings ({frames.length})
          </h2>
          <p className="text-xs text-ink-soft">
            Configure metadata, decimal typography, and layout defaults for all {frames.length} registered frames.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-soft">
            {frames.length} registered · {frames.filter((f) => f.overridden).length} customised
          </span>
          <button
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="btn-ghost flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-ink"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Reload
          </button>
        </div>
      </div>

      {/* Persistent Frame Selector & Search Bar */}
      <div className="glass grid gap-3 rounded-3xl p-4 sm:grid-cols-12 sm:items-end">
        <div className="sm:col-span-6">
          <label
            htmlFor="admin-frame-selector"
            className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft"
          >
            <Filter className="h-3.5 w-3.5 text-coral" aria-hidden /> Select Frame ({frames.length} available)
          </label>
          <select
            id="admin-frame-selector"
            value={selectedSlug}
            onChange={(e) => selectFrame(e.target.value)}
            className="w-full rounded-2xl border border-amber-900/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-coral"
          >
            <option value="all">Show all {frames.length} frames</option>
            {frames.map((f, idx) => (
              <option key={f.slug} value={f.slug}>
                {idx + 1}. {f.title} ({f.slug}) {!f.active ? "[Hidden]" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-4">
          <label
            htmlFor="admin-frame-search"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft"
          >
            Quick Search
          </label>
          <input
            id="admin-frame-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, slug, ID, or tag…"
            className="w-full rounded-2xl border border-amber-900/15 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-coral"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="button"
            onClick={() => {
              selectFrame("all");
              setSearch("");
            }}
            className="btn-ghost w-full rounded-2xl px-3 py-2.5 text-xs font-semibold text-ink"
          >
            Show All ({frames.length})
          </button>
        </div>
      </div>

      {flash && (
        <p role="status" className="flex items-center gap-2 text-xs font-semibold text-jade-deep">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {flash}
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {visibleFrames.map((f) => {
        const draft = drafts[f.slug] ?? toDraft(f);
        const state = saveStates[f.slug] ?? "idle";
        const rowErr = saveErrors[f.slug];
        const changed =
          draft.description !== f.description ||
          draft.category !== f.category ||
          draft.tags !== f.tags.join(", ") ||
          draft.featured !== f.featured ||
          draft.active !== f.active ||
          !settingsEqual(draft.settings, f.settings);

        return (
          <section
            key={f.slug}
            id={`frame-card-${f.slug}`}
            className="glass rounded-3xl p-5 sm:p-6"
            aria-labelledby={`frame-${f.slug}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={`frame-${f.slug}`} className="font-display text-xl font-semibold text-ink">
                    {f.title}
                  </h3>
                  <Link
                    href={`/frames/${f.slug}`}
                    className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-teal-deep hover:text-coral"
                  >
                    Open in Editor <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Slug: <code className="font-mono font-semibold text-ink">/{f.slug}</code> · ID:{" "}
                  <code className="font-mono text-ink-soft">{f.id}</code> · {f.occasion} · art: {f.art}
                  {f.overridden && (
                    <span className="ml-2 rounded-full bg-saffron/15 px-2 py-0.5 font-semibold text-saffron-deep">
                      customised
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={draft.featured}
                    onChange={(e) => patch(f.slug, { featured: e.target.checked })}
                    className="h-4 w-4 accent-saffron"
                  />
                  Featured
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-ink">
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

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Description (SEO &amp; social)
                </span>
                <textarea
                  rows={2}
                  value={draft.description}
                  onChange={(e) => patch(f.slug, { description: e.target.value.slice(0, 320) })}
                  className="w-full resize-y rounded-2xl border border-white/70 bg-white/60 px-4 py-3 text-sm text-ink outline-none transition focus:border-saffron focus:bg-white/80"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Category
                </span>
                <select
                  value={draft.category}
                  onChange={(e) => patch(f.slug, { category: e.target.value })}
                  className="w-full rounded-2xl border border-white/70 bg-white/60 px-4 py-3 text-sm text-ink outline-none transition focus:border-saffron"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Tags (comma separated)
                </span>
                <input
                  value={draft.tags}
                  onChange={(e) => patch(f.slug, { tags: e.target.value })}
                  className="w-full rounded-2xl border border-white/70 bg-white/60 px-4 py-3 text-sm text-ink outline-none transition focus:border-saffron focus:bg-white/80"
                />
              </label>
            </div>

            {/* Numerical & Typography Settings (Supports Decimal Values + Dropdown Presets) */}
            <div className="mt-5 rounded-2xl border border-amber-900/10 bg-white/65 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink">
                  <Sliders className="h-3.5 w-3.5 text-coral" aria-hidden /> Typography &amp; Numerical Settings (Decimal Precision)
                </span>
                <button
                  type="button"
                  onClick={() => resetSettingsToDefault(f.slug)}
                  className="inline-flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-[11px] font-semibold text-ink-soft hover:text-ink"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden /> Reset defaults
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-ink-soft">
                    Font family
                  </span>
                  <select
                    value={draft.settings.font_family}
                    onChange={(e) => patchSetting(f.slug, "font_family", e.target.value)}
                    className="w-full rounded-xl border border-amber-900/15 bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-coral focus:outline-none"
                  >
                    {FRAME_FONTS.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                </label>

                <NumberSelect
                  label="Font size"
                  value={draft.settings.font_size}
                  onChange={(v) => patchSetting(f.slug, "font_size", v)}
                  options={FONT_SIZE_OPTIONS}
                  min={6}
                  max={120}
                  unit="px"
                />

                <NumberSelect
                  label="Line height"
                  value={draft.settings.line_height}
                  onChange={(v) => patchSetting(f.slug, "line_height", v)}
                  options={LINE_HEIGHT_OPTIONS}
                  min={0.5}
                  max={4}
                />

                <NumberSelect
                  label="Letter spacing"
                  value={draft.settings.letter_spacing}
                  onChange={(v) => patchSetting(f.slug, "letter_spacing", v)}
                  options={LETTER_SPACING_OPTIONS}
                  min={-5}
                  max={24}
                  unit="px"
                />

                <NumberSelect
                  label="Text scale"
                  value={draft.settings.text_scale}
                  onChange={(v) => patchSetting(f.slug, "text_scale", v)}
                  options={SCALE_OPTIONS}
                  min={0.25}
                  max={3}
                  unit="×"
                />

                <NumberSelect
                  label="Text X position"
                  value={draft.settings.text_x}
                  onChange={(v) => patchSetting(f.slug, "text_x", v)}
                  options={PERCENT_OPTIONS}
                  min={0}
                  max={100}
                  unit="%"
                />

                <NumberSelect
                  label="Text Y position"
                  value={draft.settings.text_y}
                  onChange={(v) => patchSetting(f.slug, "text_y", v)}
                  options={PERCENT_OPTIONS}
                  min={0}
                  max={100}
                  unit="%"
                />

                <NumberSelect
                  label="Text width"
                  value={draft.settings.text_width}
                  onChange={(v) => patchSetting(f.slug, "text_width", v)}
                  options={PERCENT_OPTIONS}
                  min={10}
                  max={100}
                  unit="%"
                />

                <NumberSelect
                  label="Text opacity"
                  value={draft.settings.text_opacity}
                  onChange={(v) => patchSetting(f.slug, "text_opacity", v)}
                  options={OPACITY_OPTIONS}
                  min={0}
                  max={1}
                />

                <NumberSelect
                  label="Photo scale"
                  value={draft.settings.photo_scale}
                  onChange={(v) => patchSetting(f.slug, "photo_scale", v)}
                  options={SCALE_OPTIONS}
                  min={0.25}
                  max={3}
                  unit="×"
                />

                <NumberSelect
                  label="Border opacity"
                  value={draft.settings.border_opacity}
                  onChange={(v) => patchSetting(f.slug, "border_opacity", v)}
                  options={OPACITY_OPTIONS}
                  min={0}
                  max={1}
                />
              </div>
            </div>

            {rowErr && (
              <p role="alert" className="mt-3 flex items-center gap-2 text-xs font-semibold text-coral">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {rowErr}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void save(f.slug)}
                disabled={state === "saving" || (!changed && state !== "error")}
                className="btn-primary flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
              >
                {state === "saving" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
                  </>
                ) : state === "saved" && !changed ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Saved ✓
                  </>
                ) : state === "error" ? (
                  <>
                    <AlertCircle className="h-4 w-4" aria-hidden /> Save failed
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" aria-hidden /> {changed ? "Save" : "Saved ✓"}
                  </>
                )}
              </button>

              {state === "error" && (
                <button
                  type="button"
                  onClick={() => void save(f.slug)}
                  className="btn-ghost flex items-center gap-1.5 rounded-2xl border border-coral/30 px-4 py-2.5 text-xs font-semibold text-coral"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
