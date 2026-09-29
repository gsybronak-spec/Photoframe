"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SearchX, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { frameTags, type CatalogFrame, type Occasion } from "@/lib/frames";
import { FrameCard } from "@/components/FrameCard";
import { Reveal } from "@/components/Reveal";
import { trackClient } from "@/lib/analytics-client";

interface Props {
  frames: CatalogFrame[];
  occasions: Occasion[];
}

/** Search relevance: title prefix > title substring > category/slug > tagline/tags/description. */
function relevance(frame: CatalogFrame, q: string): number {
  if (!q) return 0;
  const needle = q.trim().toLowerCase();
  if (!needle) return 0;
  const title = (frame.title || "").toLowerCase();
  const slug = (frame.slug || "").toLowerCase();
  const category = (frame.category || frame.occasion || "General").toLowerCase();
  const tagline = (frame.tagline || "").toLowerCase();
  const description = (frame.description || "").toLowerCase();
  const art = (frame.art || "").toLowerCase();
  const motif = (frame.style?.motif || "").toLowerCase();

  if (title.startsWith(needle) || slug.startsWith(needle)) return 4;
  if (title.includes(needle) || slug.includes(needle)) return 3;
  if (category.includes(needle)) return 2;
  if (tagline.includes(needle)) return 2;
  if (frameTags(frame).some((t) => String(t).toLowerCase().includes(needle))) return 1;
  if (description.includes(needle) || art.includes(needle) || motif.includes(needle)) return 1;
  return 0;
}

/**
 * Gallery grid. Frames arrive as props (server-read, so admin changes apply
 * without a deploy) and filtering is instant + mirrored into the URL so results
 * are shareable and back/forward works.
 */
export function GalleryGrid({ frames, occasions }: Props) {
  const params = useSearchParams();
  const router = useRouter();
  const rawOccasion = params.get("occasion") ?? "All";
  // Ensure an unknown/stale ?occasion= URL param falls back to "All" rather than hiding all frames
  const matchedOccasion = useMemo(() => {
    if (!rawOccasion || rawOccasion.toLowerCase() === "all") return "All";
    const found = occasions.find(
      (o) => o.toLowerCase() === rawOccasion.trim().toLowerCase()
    );
    return found ?? "All";
  }, [rawOccasion, occasions]);
  const occasion = matchedOccasion;
  const query = params.get("q") ?? "";

  const [input, setInput] = useState(query);
  const [committedQuery, setCommittedQuery] = useState(query);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in sync when the URL changes (back/forward, reset, links).
  if (committedQuery !== query) {
    setCommittedQuery(query);
    setInput(query);
  }

  const setParam = useCallback(
    (key: string, value: string, opts: { logSearch?: boolean } = {}) => {
      const next = new URLSearchParams(params);
      if (!value || value === "All") next.delete(key);
      else next.set(key, value);
      const qs = next.toString();
      router.replace(qs ? `/frames?${qs}` : "/frames", { scroll: false });
      if (opts.logSearch) {
        const needle = value.trim().toLowerCase();
        const matches = needle
          ? frames.filter(
              (f) =>
                relevance(f, needle) > 0 ||
                frameTags(f).some((t) => String(t).toLowerCase().includes(needle))
            ).length
          : frames.length;
        // No free text is ever sent — only a length bucket and the result count.
        trackClient("frame_search", {
          results: matches,
          term_length: Math.min(value.trim().length, 20),
        });
      }
    },
    [params, router, frames]
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const targetOccasion = occasion.toLowerCase();
    return frames
      .map((f) => ({ f, score: relevance(f, q) }))
      .filter(({ f, score }) => {
        const frameCat = (f.category || f.occasion || "General").toLowerCase();
        const frameOcc = (f.occasion || f.category || "General").toLowerCase();
        const matchOccasion =
          occasion === "All" ||
          frameCat === targetOccasion ||
          frameOcc === targetOccasion;
        const matchQuery =
          !q ||
          score > 0 ||
          frameTags(f).some((t) => String(t).toLowerCase().includes(q));
        return matchOccasion && matchQuery;
      })
      .sort((a, b) => b.score - a.score || a.f.title.localeCompare(b.f.title))
      .map(({ f }) => f);
  }, [frames, occasion, query]);

  const clearAll = () => {
    setInput("");
    router.replace("/frames", { scroll: false });
  };

  return (
    <div>
      {/* Filter bar */}
      <Reveal delay={0.1}>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (debounceRef.current) clearTimeout(debounceRef.current);
            setParam("q", input, { logSearch: true });
          }}
          className="glass mt-10 flex flex-col gap-4 rounded-3xl p-5 sm:flex-row sm:items-center"
        >
          <div className="relative flex-1">
            <Search
              className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
              aria-hidden
            />
            <label htmlFor="frame-search" className="sr-only">
              Search frames by name, occasion or tag
            </label>
            <input
              id="frame-search"
              type="search"
              value={input}
              onChange={(e) => {
                const value = e.target.value;
                setInput(value);
                // Live filtering: debounce the URL commit so typing stays smooth.
                if (debounceRef.current) clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(
                  () => setParam("q", value, { logSearch: value.length >= 3 }),
                  250
                );
              }}
              placeholder="Search frames, tags, moods…"
              className="w-full rounded-2xl border border-white/70 bg-white/60 py-3 pl-11 pr-10 text-sm text-ink outline-none transition placeholder:text-ink-soft/70 focus:border-saffron focus:bg-white/80"
            />
            {input && (
              <button
                type="button"
                onClick={() => {
                  setInput("");
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  setParam("q", "");
                }}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ink-soft transition hover:bg-white/70 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
            <div
              role="group"
              aria-label="Filter by occasion"
              className="flex gap-2"
              onKeyDown={(e) => {
                // Left/right arrows move between filters, like a tablist.
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const buttons = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>("button")
                );
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                if (index === -1) return;
                e.preventDefault();
                const next = e.key === "ArrowRight" ? index + 1 : index - 1;
                buttons[(next + buttons.length) % buttons.length]?.focus();
              }}
            >
              {["All", ...occasions].map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={occasion === o}
                  onClick={() => setParam("occasion", o)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                    occasion === o
                      ? "bg-gradient-to-r from-saffron to-coral text-white shadow-glass"
                      : "bg-white/60 text-ink-soft hover:bg-white/90 hover:text-ink"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        </form>
      </Reveal>

      {/* Result summary (announced to screen readers as filters change) */}
      <p className="mt-4 text-center text-xs font-semibold text-ink-soft" role="status" aria-live="polite">
        {filtered.length} of {frames.length} frames
        {query ? ` matching “${query}”` : ""}
        {occasion !== "All" ? ` in ${occasion}` : ""}
      </p>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((f, i) => (
            <Reveal key={f.slug} delay={Math.min(i * 0.05, 0.4)}>
              <FrameCard frame={f} />
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="glass mt-8 rounded-3xl p-16 text-center" role="status">
          <SearchX className="mx-auto h-10 w-10 text-teal/50" aria-hidden />
          <p className="mt-4 font-display text-2xl text-ink">
            No frames found in this corner of the studio…
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            {query
              ? `Nothing matches “${query}”${occasion !== "All" ? ` in ${occasion}` : ""}. Try a broader word like “sun” or “calm”.`
              : "Try a different category, or clear your filters."}
          </p>
          <button
            onClick={clearAll}
            className="btn-primary mt-6 rounded-full px-6 py-3 text-sm font-semibold"
          >
            Reset filters
          </button>
        </div>
      )}

      <p className="mt-10 flex items-center justify-center gap-2 text-xs text-ink-soft">
        <Sparkles className="h-3.5 w-3.5 text-saffron-deep" aria-hidden />
        New frames are added every season — bookmark your favourites.
      </p>
    </div>
  );
}
