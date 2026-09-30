"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LayoutTemplate, Loader2, Save } from "lucide-react";
import { FEATURED_LIMIT_OPTIONS, NumberSelect } from "@/components/ui/NumberSelect";

interface Settings {
  hero_tagline: string;
  featured_limit: number;
}

export function AdminContentPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [featured, setFeatured] = useState<{ slug: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  /** First statement is an await — see AdminUsersPanel for the rationale. */
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/content", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not load content settings.");
        return;
      }
      setSettings(data.settings);
      setFeatured(data.featured);
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

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError("");
    setFlash("");
    try {
      const res = await fetch("/api/admin/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not save content settings.");
        return;
      }
      setSettings(data.settings);
      setFlash("Homepage content saved.");
    } catch {
      setError("Network trouble — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <p className="glass flex items-center gap-2 rounded-[2rem] p-8 text-sm text-ink-soft" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading content settings…
      </p>
    );
  }

  return (
    <div className="glass rounded-[2rem] p-6 sm:p-8">
      <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
        <LayoutTemplate className="h-5 w-5 text-teal" aria-hidden /> Homepage content
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        The featured rail is driven by the frames you mark as featured (Frames tab).
      </p>

      <form onSubmit={save} className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Homepage tagline
          </span>
          <input
            value={settings.hero_tagline}
            onChange={(e) =>
              setSettings({ ...settings, hero_tagline: e.target.value.slice(0, 120) })
            }
            className="w-full rounded-2xl border border-white/70 bg-white/60 px-4 py-3 text-sm text-ink outline-none transition focus:border-saffron focus:bg-white/80"
          />
        </label>
        <div className="block">
          <NumberSelect
            label="Featured frames on homepage (1–8)"
            value={settings.featured_limit}
            onChange={(v) => setSettings({ ...settings, featured_limit: Math.round(v) })}
            options={FEATURED_LIMIT_OPTIONS.filter((n) => n <= 8)}
            min={1}
            max={8}
            step={1}
            size="md"
          />
        </div>

        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Currently featured
          </p>
          {featured.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              No frames are featured yet — mark some in the Frames tab.
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {featured.map((f) => (
                <li
                  key={f.slug}
                  className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-teal-deep"
                >
                  {f.title}
                </li>
              ))}
            </ul>
          )}
        </div>

        {flash && (
          <p role="status" className="flex items-center gap-2 text-xs font-semibold text-jade-deep sm:col-span-2">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {flash}
          </p>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral sm:col-span-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="btn-primary flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold disabled:opacity-50 sm:col-span-2 sm:justify-self-start"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" aria-hidden /> Save content
            </>
          )}
        </button>
      </form>
    </div>
  );
}
