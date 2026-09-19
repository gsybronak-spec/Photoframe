"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flower2, Lock, Mail, ArrowRight, AlertCircle } from "lucide-react";
import { useAuth, authMode } from "@/components/AuthProvider";
import { fbSignIn } from "@/lib/firebase-client";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (authMode() === "firebase") {
        // 1. Sign in with Firebase (client SDK) → 2. exchange the ID token for
        // the HttpOnly app session on our server → 3. proceed exactly as before.
        const cred = await fbSignIn(email.trim(), password);
        const idToken = await cred.user.getIdToken(false);
        const res = await fetch("/api/auth/firebase-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Sign in failed. Please try again.");
          return;
        }
      } else {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Sign in failed. Please try again.");
          return;
        }
      }
      // Auth state lives in the provider — refresh it so the navbar updates
      // immediately instead of after a full reload.
      await refresh();
      const next =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;
      router.push(next && next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Network trouble — check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid min-h-[80vh] max-w-6xl items-stretch gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2">
      {/* Art panel */}
      <div className="glass-dark relative hidden overflow-hidden rounded-[2.5rem] lg:block">
        <div className="absolute -left-20 top-24 h-72 w-72 rounded-full bg-gold/30 blur-3xl" />
        <div className="absolute -right-16 bottom-16 h-80 w-80 rounded-full bg-lotus/25 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-saffron to-coral text-white">
            <Flower2 className="h-7 w-7" />
          </span>
          <div>
            <h2 className="font-display text-4xl font-semibold leading-tight">
              Welcome back to the studio.
            </h2>
            <p className="mt-4 max-w-sm text-lg text-cream/80">
              Your frames, creations and community are exactly where you left
              them. Take a deep breath and sign in.
            </p>
          </div>
          <p className="text-sm text-cream/60">
            “Inhale the future, exhale the past.”
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="glass m-auto w-full max-w-md rounded-[2.5rem] p-8 sm:p-10">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Sign in to your account
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your creations are saved to your private studio.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              Email
            </span>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@studio.com"
                className="w-full rounded-2xl border border-white/70 bg-white/60 py-3.5 pl-11 pr-4 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-saffron focus:bg-white/80"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              Password
            </span>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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
            className="btn-primary flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-semibold disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>
        <div className="mt-6 flex items-center justify-between text-sm">
          <Link
            href="/forgot-password"
            className="text-ink-soft transition hover:text-coral"
          >
            Forgot password?
          </Link>
          <Link href="/signup" className="font-semibold text-coral hover:underline">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
