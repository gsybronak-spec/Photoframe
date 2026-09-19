"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Activity, Loader2 } from "lucide-react";

interface EventRow {
  id: string;
  type: string;
  message: string;
  userId: string | null;
  actorId: string | null;
  createdAt: string;
}

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "auth", label: "Authentication" },
  { id: "creation", label: "Creations" },
  { id: "admin", label: "Admin actions" },
] as const;

const TONE: Record<string, string> = {
  signin: "bg-teal/10 text-teal-deep",
  signout: "bg-white/70 text-ink-soft",
  signin_blocked: "bg-coral/15 text-coral",
  account_created: "bg-saffron/15 text-saffron-deep",
  account_verified: "bg-jade/15 text-jade-deep",
  account_deleted: "bg-coral/15 text-coral",
  password_changed: "bg-lotus/20 text-ink",
  password_reset: "bg-lotus/20 text-ink",
  creation_saved: "bg-jade/10 text-jade-deep",
  creation_deleted: "bg-coral/10 text-coral",
  creation_shared: "bg-saffron/15 text-saffron-deep",
  creation_unshared: "bg-white/70 text-ink-soft",
  admin_action: "bg-gold/20 text-gold",
};

export function AdminActivityPanel() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [pages, setPages] = useState(1);
  const [totalLogged, setTotalLogged] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /** First statement is an await — see AdminUsersPanel for the rationale. */
  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/activity?filter=${filter}&page=${page}&limit=30`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not load the activity log.");
        return;
      }
      setEvents(data.events);
      setPages(data.pages);
      setTotalLogged(data.totalLogged);
    } catch {
      setError("Network trouble — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    // Fetch-then-set on mount: see AdminUsersPanel for the rationale.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div className="glass rounded-[2rem] p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
          <Activity className="h-5 w-5 text-teal" aria-hidden /> Activity log
        </h2>
        <span className="text-xs text-ink-soft">{totalLogged} events recorded</span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter activity">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => {
              setLoading(true);
              setFilter(f.id);
              setPage(1);
            }}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              filter === f.id
                ? "bg-gradient-to-r from-saffron to-coral text-white shadow-glass"
                : "bg-white/60 text-ink-soft hover:bg-white/90 hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-ink-soft" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading events…
        </p>
      ) : events.length === 0 ? (
        <p className="mt-6 text-sm text-ink-soft">No events for this filter yet.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-3 rounded-2xl bg-white/50 px-4 py-3">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                  TONE[e.type] ?? "bg-white/70 text-ink-soft"
                }`}
              >
                {e.type.replace(/_/g, " ")}
              </span>
              <div className="min-w-[12rem] flex-1">
                <p className="text-sm text-ink">{e.message}</p>
                <p className="text-xs text-ink-soft">
                  {new Date(e.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {e.actorId && ` · by admin ${e.actorId.slice(0, 6)}…`}
                  {e.userId && e.userId !== e.actorId && ` · subject ${e.userId.slice(0, 6)}…`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Activity pages">
          <button
            onClick={() => {
              setLoading(true);
              setPage((p) => Math.max(1, p - 1));
            }}
            disabled={page <= 1}
            className="btn-ghost rounded-full px-4 py-2 text-xs font-semibold text-ink disabled:opacity-40"
          >
            Newer
          </button>
          <span className="text-xs text-ink-soft">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => {
              setLoading(true);
              setPage((p) => Math.min(pages, p + 1));
            }}
            disabled={page >= pages}
            className="btn-ghost rounded-full px-4 py-2 text-xs font-semibold text-ink disabled:opacity-40"
          >
            Older
          </button>
        </nav>
      )}
    </div>
  );
}
