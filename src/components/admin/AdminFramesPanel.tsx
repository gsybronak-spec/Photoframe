"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";

interface FrameRow {
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
  overridden: boolean;
  updatedAt: string | null;
}

interface Draft {
  description: string;
  category: string;
  tags: string;
  featured: boolean;
  active: boolean;
}

/**
 * Frame metadata editor. Artwork is code-owned, so this only ever writes
 * description/category/tags/featured/active — a bad edit can't break rendering.
 */
export function AdminFramesPanel() {
  const [frames, setFrames] = useState<FrameRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  /** First statement is an await — see AdminUsersPanel for the rationale. */
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/frames", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not load frames.");
        return;
      }
      setFrames(data.frames);
      setCategories(data.categories);
      setDrafts(
        Object.fromEntries(
          (data.frames as FrameRow[]).map((f) => [
            f.slug,
            {
              description: f.description,
              category: f.category,
              tags: f.tags.join(", "),
              featured: f.featured,
              active: f.active,
            },
          ])
        )
      );
    } catch {
      setError("Network trouble — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-then-set on mount: see AdminUsersPanel for the rationale.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const patch = (slug: string, changes: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [slug]: { ...prev[slug], ...changes } }));

  const save = async (slug: string) => {
    const draft = drafts[slug];
    if (!draft) return;
    setBusy(slug);
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
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not save that frame.");
        return;
      }
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
                overridden: data.frame.overridden,
              }
            : f
        )
      );
      setFlash(`Saved “${slug}”.`);
    } catch {
      setError("Network trouble — check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <p className="glass flex items-center gap-2 rounded-[2rem] p-8 text-sm text-ink-soft" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading frames…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
          <Sparkles className="h-5 w-5 text-saffron-deep" aria-hidden /> Frames
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-soft">
            {frames.length} frames · {frames.filter((f) => f.overridden).length} customised
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

      {frames.map((f) => {
        const draft = drafts[f.slug];
        if (!draft) return null;
        const changed =
          draft.description !== f.description ||
          draft.category !== f.category ||
          draft.tags !== f.tags.join(", ") ||
          draft.featured !== f.featured ||
          draft.active !== f.active;
        return (
          <section key={f.slug} className="glass rounded-3xl p-6" aria-labelledby={`frame-${f.slug}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id={`frame-${f.slug}`} className="font-display text-xl font-semibold text-ink">
                  {f.title}
                </h3>
                <p className="text-xs text-ink-soft">
                  /{f.slug} · {f.occasion} · art: {f.art}
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

            <button
              onClick={() => save(f.slug)}
              disabled={busy === f.slug || !changed}
              className="btn-primary mt-4 flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              {busy === f.slug ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" aria-hidden /> {changed ? "Save frame" : "Saved"}
                </>
              )}
            </button>
          </section>
        );
      })}
    </div>
  );
}
