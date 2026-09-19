"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Send, CheckCircle2, ArrowLeft } from "lucide-react";
import { authMode } from "@/components/AuthProvider";
import { fbSendPasswordReset } from "@/lib/firebase-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (authMode() === "firebase") {
        // Firebase sends its own reset email; the action URL is configured in
        // the Firebase Console (see README "Firebase setup").
        await fbSendPasswordReset(email.trim());
      } else {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Something went wrong. Please try again.");
          return;
        }
      }
      setSent(true);
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
    <div className="mx-auto max-w-md px-4 py-20">
      <Link
        href="/login"
        className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft transition hover:text-coral"
      >
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </Link>

      <div className="glass mt-6 rounded-[2.5rem] p-8 sm:p-10">
        {sent ? (
          <div className="text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-jade/15 text-jade-deep">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <h1 className="mt-5 font-display text-2xl font-semibold text-ink">
              Check your inbox
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              If an account exists for <strong>{email}</strong>, a reset link
              is on its way. It expires in one hour.
            </p>
            {authMode() !== "firebase" && (
              <p className="mt-4 rounded-2xl bg-sand/70 px-4 py-3 text-xs text-ink-soft">
                Dev tip: with the default mailer the link is appended to{" "}
                <code>data/.mail</code>.
              </p>
            )}
          </div>
        ) : (
          <>
            <h1 className="font-display text-3xl font-semibold text-ink">
              Reset your password
            </h1>
            <p className="mt-2 text-sm text-ink-soft">
              Enter your account email and we&apos;ll send you a reset link.
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
              {error && (
                <p role="alert" className="rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="btn-primary flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-semibold disabled:opacity-60"
              >
                {busy ? "Sending…" : "Send reset link"}
                {!busy && <Send className="h-4 w-4" />}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
