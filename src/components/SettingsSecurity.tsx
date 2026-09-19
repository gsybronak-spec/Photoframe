"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  KeyRound,
  Loader2,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { describeUserAgent } from "@/lib/image-client";

export interface SessionItem {
  id: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string | null;
  user_agent: string | null;
  current: boolean;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function SettingsSecurity({ sessions: initialSessions }: { sessions: SessionItem[] }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [sessions, setSessions] = useState(initialSessions);
  const [busyId, setBusyId] = useState<string | null>(null);

  /* ---- password ---- */
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwState, setPwState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pwMessage, setPwMessage] = useState("");

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwState("saving");
    setPwMessage("");
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPwState("error");
        setPwMessage(data.error ?? "Could not change your password.");
        return;
      }
      setPwState("saved");
      setPwMessage(data.message ?? "Password updated.");
      setCurrent("");
      setNext("");
      const refreshed = await fetch("/api/profile/sessions", { cache: "no-store" });
      const list = await refreshed.json();
      if (list.ok) setSessions(list.sessions);
      router.refresh();
    } catch {
      setPwState("error");
      setPwMessage("Network trouble — check your connection and try again.");
    }
  };

  /* ---- sessions ---- */
  const revoke = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/profile/sessions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const revokeAll = async () => {
    setBusyId("all");
    try {
      await fetch("/api/profile/sessions", { method: "DELETE" });
      await logout();
    } finally {
      setBusyId(null);
    }
  };

  /* ---- danger zone ---- */
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [delState, setDelState] = useState<"idle" | "deleting" | "error">("idle");
  const [delMessage, setDelMessage] = useState("");

  const deleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDelState("deleting");
    setDelMessage("");
    try {
      const res = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirm }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setDelState("error");
        setDelMessage(data.error ?? "Could not delete your account.");
        return;
      }
      // Account is gone — a full replace avoids any stale authenticated data.
      router.replace("/?deleted=1");
      router.refresh();
    } catch {
      setDelState("error");
      setDelMessage("Network trouble — check your connection and try again.");
    }
  };

  const others = sessions.filter((s) => !s.current);

  return (
    <div className="space-y-6">
      {/* Password */}
      <section className="glass rounded-[2rem] p-6 sm:p-8" aria-labelledby="pw-heading">
        <h2
          id="pw-heading"
          className="flex items-center gap-2 font-display text-2xl font-semibold text-ink"
        >
          <KeyRound className="h-5 w-5 text-teal" aria-hidden /> Change password
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          For safety, every other device is signed out when you change your password.
        </p>
        <form onSubmit={changePassword} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              Current password
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="w-full rounded-2xl border border-white/70 bg-white/60 px-4 py-3 text-sm text-ink outline-none transition focus:border-saffron focus:bg-white/80"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              New password
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="8+ characters with a letter and number"
              className="w-full rounded-2xl border border-white/70 bg-white/60 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-saffron focus:bg-white/80"
            />
          </label>
          {pwMessage && (
            <p
              role={pwState === "error" ? "alert" : "status"}
              className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm sm:col-span-2 ${
                pwState === "error" ? "bg-coral/10 text-coral" : "bg-jade/10 text-jade-deep"
              }`}
            >
              {pwState === "error" ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              {pwMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={pwState === "saving" || !current || !next}
            className="btn-primary flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold disabled:opacity-50 sm:col-span-2 sm:justify-start"
          >
            {pwState === "saving" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Updating…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" aria-hidden /> Update password
              </>
            )}
          </button>
        </form>
      </section>

      {/* Sessions */}
      <section className="glass rounded-[2rem] p-6 sm:p-8" aria-labelledby="sessions-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="sessions-heading"
              className="flex items-center gap-2 font-display text-2xl font-semibold text-ink"
            >
              <MonitorSmartphone className="h-5 w-5 text-teal" aria-hidden /> Active
              sessions
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {sessions.length} device{sessions.length === 1 ? "" : "s"} signed in to your
              account.
            </p>
          </div>
          {others.length > 0 && (
            <button
              onClick={revokeAll}
              disabled={busyId === "all"}
              className="flex items-center gap-2 rounded-full border border-coral/30 px-4 py-2.5 text-sm font-semibold text-coral transition hover:bg-coral/10 disabled:opacity-50"
            >
              {busyId === "all" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <LogOut className="h-4 w-4" aria-hidden />
              )}
              Sign out everywhere
            </button>
          )}
        </div>

        {sessions.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">No active sessions found.</p>
        ) : (
          <ul className="mt-5 divide-y divide-white/60">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {describeUserAgent(s.user_agent)}
                    {s.current && (
                      <span className="ml-2 rounded-full bg-jade/15 px-2 py-0.5 text-[11px] font-bold uppercase text-jade-deep">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-soft">
                    Started {when(s.created_at)}
                    {s.last_seen_at ? ` · last active ${when(s.last_seen_at)}` : ""}
                  </p>
                </div>
                {!s.current && (
                  <button
                    onClick={() => revoke(s.id)}
                    disabled={busyId === s.id}
                    className="rounded-full bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-coral transition hover:bg-white disabled:opacity-50"
                  >
                    {busyId === s.id ? "Revoking…" : "Sign out"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Danger zone */}
      <section
        className="rounded-[2rem] border border-coral/30 bg-coral/5 p-6 sm:p-8"
        aria-labelledby="danger-heading"
      >
        <h2
          id="danger-heading"
          className="flex items-center gap-2 font-display text-2xl font-semibold text-coral"
        >
          <TriangleAlert className="h-5 w-5" aria-hidden /> Danger zone
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Deleting your account permanently removes your creations, images, saved frames and
          sessions. You&apos;ll be asked to type <strong>DELETE</strong> to confirm, and we
          verify your password before anything is removed.
        </p>
        <form onSubmit={deleteAccount} className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm text-ink outline-none transition focus:border-coral"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              Type DELETE to confirm
            </span>
            <input
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm text-ink outline-none transition focus:border-coral"
            />
          </label>
          {delMessage && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral sm:col-span-2"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {delMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={delState === "deleting" || confirm !== "DELETE" || !password}
            className="flex items-center justify-center gap-2 rounded-2xl bg-coral px-6 py-3 text-sm font-semibold text-white transition hover:bg-coral/90 disabled:opacity-50 sm:col-span-2 sm:justify-start"
          >
            {delState === "deleting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Deleting…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" aria-hidden /> Delete my account
              </>
            )}
          </button>
        </form>
      </section>
    </div>
  );
}
