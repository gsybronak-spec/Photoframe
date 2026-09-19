"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Flower2,
  Lock,
  Mail,
  User,
  ArrowRight,
  Check,
  AlertCircle,
  MailWarning,
} from "lucide-react";
import { useAuth, authMode } from "@/components/AuthProvider";
import { fbSignUp, fbSendVerification } from "@/lib/firebase-client";

const BENEFITS = [
  "Save your creations to your private studio",
  "Bookmark favorite frames for quick access",
  "Early access to new occasion frames",
];

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [emailWarning, setEmailWarning] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const problems: string[] = [];
  if (password && password.length < 8) problems.push("8+ characters");
  if (password && !/[a-zA-Z]/.test(password)) problems.push("a letter");
  if (password && !/[0-9]/.test(password)) problems.push("a number");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (authMode() === "firebase") {
        // Firebase owns account creation + the verification email.
        const cred = await fbSignUp(email.trim(), password);
        if (cred.user.email && name) {
          // Keep display name in Firebase too (used in its emails).
          const { updateProfile } = await import("firebase/auth");
          const { clientAuth } = await import("@/lib/firebase-client");
          await updateProfile(clientAuth().currentUser!, { displayName: name });
        }
        await fbSendVerification(cred.user).catch(() => {
          setEmailWarning(
            "Account created, but the verification email couldn't be sent just now — use “Resend” on your dashboard."
          );
        });
        // Sync the app session + provision the application user record.
        const idToken = await cred.user.getIdToken(false);
        await fetch("/api/auth/firebase-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, name }),
        });
      } else {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Signup failed. Please try again.");
          return;
        }
        if (data.emailSent === false) {
          // Account exists and is usable — the verification mail just didn't go
          // out, so tell the user how to recover instead of failing silently.
          setEmailWarning(
            data.message ??
              "We couldn't send the verification email. Use “Resend email” from your dashboard."
          );
        }
      }
      await refresh();
      router.push("/dashboard?welcome=1");
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
      <div className="glass order-2 m-auto w-full max-w-md rounded-[2.5rem] p-8 sm:p-10 lg:order-1">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Create a new account
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Free plan available · no credit card required
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">Name</span>
            <div className="relative">
              <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <input
                required
                minLength={2}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ananya Rao"
                className="w-full rounded-2xl border border-white/70 bg-white/60 py-3.5 pl-11 pr-4 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-saffron focus:bg-white/80"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">Email</span>
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
            <span className="mb-1.5 block text-sm font-semibold text-ink">Password</span>
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
          {password && problems.length > 0 && (
            <p className="text-xs text-ink-soft">
              Password needs {problems.join(", ")}.
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
          {emailWarning && (
            <p className="flex items-start gap-2 rounded-2xl bg-saffron/10 px-4 py-3 text-sm text-saffron-deep">
              <MailWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {emailWarning}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-primary flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-semibold disabled:opacity-60"
          >
            {busy ? "Creating your studio…" : "Start free"}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-soft">
          Already practicing with us?{" "}
          <Link href="/login" className="font-semibold text-coral hover:underline">
            Sign in
          </Link>
        </p>
      </div>

      <div className="glass-dark relative order-1 overflow-hidden rounded-[2.5rem] lg:order-2">
        <div className="absolute -right-20 top-20 h-72 w-72 rounded-full bg-jade/30 blur-3xl" />
        <div className="absolute -left-16 bottom-16 h-80 w-80 rounded-full bg-saffron/25 blur-3xl" />
        <div className="relative flex h-full min-h-[420px] flex-col justify-between p-12">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-jade to-teal text-white">
            <Flower2 className="h-7 w-7" />
          </span>
          <div>
            <h2 className="font-display text-4xl font-semibold leading-tight">
              Begin your journey in under a minute.
            </h2>
            <ul className="mt-6 space-y-3">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-center gap-3 text-cream/90">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold/25">
                    <Check className="h-3.5 w-3.5 text-gold" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-cream/60">
            “The quieter you become, the more you can hear.”
          </p>
        </div>
      </div>
    </div>
  );
}
