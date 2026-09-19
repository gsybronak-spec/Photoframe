"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Lock, AlertCircle, CheckCircle2 } from "lucide-react";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Reset failed. Please try again.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Network trouble — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!token)
    return (
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">
          This link is missing its token
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          Request a fresh reset link and open it from your email.
        </p>
        <Link
          href="/forgot-password"
          className="btn-primary mt-6 inline-block rounded-full px-6 py-3 text-sm font-semibold"
        >
          Request new link
        </Link>
      </div>
    );

  if (done)
    return (
      <div className="text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-jade/15 text-jade-deep">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold text-ink">
          Password updated
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          All sessions were signed out. Taking you to sign in…
        </p>
      </div>
    );

  return (
    <>
      <h1 className="font-display text-3xl font-semibold text-ink">
        Choose a new password
      </h1>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">
            New password
          </span>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters with a number"
              className="w-full rounded-2xl border border-white/70 bg-white/60 py-3.5 pl-11 pr-4 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-saffron focus:bg-white/80"
            />
          </div>
        </label>
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full rounded-2xl py-4 font-semibold disabled:opacity-60"
        >
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <div className="glass rounded-[2.5rem] p-8 sm:p-10">
        <Suspense
          fallback={
            <p className="text-center text-sm text-ink-soft">Loading…</p>
          }
        >
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
