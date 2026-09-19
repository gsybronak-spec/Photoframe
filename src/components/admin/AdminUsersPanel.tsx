"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MailCheck,
  Search,
  ShieldCheck,
  ShieldOff,
  UserRound,
} from "lucide-react";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  emailVerified: boolean;
  createdAt: string;
  creations: number;
  publicCreations: number;
  plan: string;
  lastSeenAt: string | null;
}

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export function AdminUsersPanel({ currentAdminId }: { currentAdminId: string }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  /**
   * Note the shape: the first statement is an await, so no state is updated
   * synchronously by the effect below (avoids cascading renders). The loading
   * flag is flipped by the user actions that change the query or page.
   */
  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/users?q=${encodeURIComponent(debounced)}&page=${page}&limit=25`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not load users.");
        return;
      }
      setUsers(data.users);
      setPages(data.pages);
      setTotal(data.total);
    } catch {
      setError("Network trouble — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [debounced, page]);

  useEffect(() => {
    // Data loading on mount/dep change: the fetch is awaited before any state
    // update, so this cannot cause a cascading synchronous render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const mutate = async (id: string, patch: { role?: string; status?: string }) => {
    setBusyId(id);
    setFlash("");
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Update failed.");
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                role: (data.user.role as AdminUser["role"]) ?? u.role,
                status: (data.user.status as AdminUser["status"]) ?? u.status,
              }
            : u
        )
      );
      setFlash(
        data.changes?.length
          ? `Updated ${id.slice(0, 6)}… — ${data.changes.join(", ")}`
          : "No changes were needed."
      );
    } catch {
      setError("Network trouble — check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="glass rounded-[2rem] p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
          <UserRound className="h-5 w-5 text-teal" aria-hidden /> Users
        </h2>
        <span className="text-xs text-ink-soft">
          {total} account{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="relative mt-5">
        <Search
          className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
          aria-hidden
        />
        <label htmlFor="admin-user-search" className="sr-only">
          Search users by name or email
        </label>
        <input
          id="admin-user-search"
          value={q}
          onChange={(e) => {
            setLoading(true);
            setQ(e.target.value);
          }}
          placeholder="Search by name or email…"
          className="w-full rounded-2xl border border-white/70 bg-white/60 py-3 pl-11 pr-4 text-sm text-ink outline-none transition placeholder:text-ink-soft/70 focus:border-saffron focus:bg-white/80"
        />
      </div>

      {flash && (
        <p role="status" className="mt-4 flex items-center gap-2 text-xs font-semibold text-jade-deep">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {flash}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-ink-soft" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading users…
        </p>
      ) : users.length === 0 ? (
        <p className="mt-6 text-sm text-ink-soft">
          No accounts match “{debounced}”.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <caption className="sr-only">
              Registered accounts with role, verification and suspension controls
            </caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
                <th scope="col" className="pb-3">Member</th>
                <th scope="col" className="pb-3">Joined</th>
                <th scope="col" className="pb-3">Creations</th>
                <th scope="col" className="pb-3">Role</th>
                <th scope="col" className="pb-3">Status</th>
                <th scope="col" className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/60">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 pr-4">
                    <span className="block font-semibold text-ink">{u.name}</span>
                    <span className="block text-xs text-ink-soft">{u.email}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-soft">
                      {u.emailVerified ? (
                        <span className="flex items-center gap-1 text-jade-deep">
                          <MailCheck className="h-3 w-3" aria-hidden /> verified
                        </span>
                      ) : (
                        <span className="text-saffron-deep">unverified</span>
                      )}
                      <span className="rounded-full bg-white/70 px-2 py-0.5 font-semibold">
                        {u.plan}
                      </span>
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-xs text-ink-soft">{fmt(u.createdAt)}</td>
                  <td className="py-3 pr-4 text-xs text-ink-soft">
                    {u.creations}
                    {u.publicCreations > 0 && (
                      <span className="ml-1 text-jade-deep">({u.publicCreations} public)</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                        u.role === "admin"
                          ? "bg-gold/20 text-gold"
                          : "bg-white/70 text-ink-soft"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                        u.status === "suspended"
                          ? "bg-coral/15 text-coral"
                          : "bg-jade/15 text-jade-deep"
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        onClick={() =>
                          mutate(u.id, { role: u.role === "admin" ? "user" : "admin" })
                        }
                        disabled={busyId === u.id || u.id === currentAdminId}
                        title={
                          u.id === currentAdminId
                            ? "You cannot change your own role"
                            : `Make ${u.role === "admin" ? "user" : "admin"}`
                        }
                        className="flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-teal-deep transition hover:bg-white disabled:opacity-40"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                        {u.role === "admin" ? "Demote" : "Promote"}
                      </button>
                      <button
                        onClick={() =>
                          mutate(u.id, {
                            status: u.status === "suspended" ? "active" : "suspended",
                          })
                        }
                        disabled={busyId === u.id || u.id === currentAdminId}
                        title={
                          u.id === currentAdminId
                            ? "You cannot suspend your own account"
                            : u.status === "suspended"
                              ? "Reactivate this account"
                              : "Suspend this account and sign it out everywhere"
                        }
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                          u.status === "suspended"
                            ? "bg-jade/15 text-jade-deep hover:bg-jade/25"
                            : "bg-coral/10 text-coral hover:bg-coral/20"
                        }`}
                      >
                        <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                        {u.status === "suspended" ? "Reactivate" : "Suspend"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3" aria-label="User pages">
          <button
            onClick={() => {
              setLoading(true);
              setPage((p) => Math.max(1, p - 1));
            }}
            disabled={page <= 1}
            className="btn-ghost rounded-full px-4 py-2 text-xs font-semibold text-ink disabled:opacity-40"
          >
            Previous
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
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
