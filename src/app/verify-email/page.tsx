"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MailCheck,
  Send,
  ShieldQuestion,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

type Status = "idle" | "verified" | "already" | "invalid" | "expired" | "used";

const COPY: Record<
  Exclude<Status, "idle">,
  { icon: typeof MailCheck; tone: "ok" | "warn" | "bad"; title: string; body: string }
> = {
  verified: {
    icon: CheckCircle2,
    tone: "ok",
    title: "Email verified",
    body: "Thank you — saving creations and public sharing are now unlocked. We also sent you a welcome email.",
  },
  already: {
    icon: CheckCircle2,
    tone: "ok",
    title: "Already verified",
    body: "This address was verified earlier, so you're all set. Nothing else to do.",
  },
  invalid: {
    icon: ShieldQuestion,
    tone: "bad",
    title: "This link isn't valid",
    body: "The link may have been truncated by your email client. Request a fresh one below.",
  },
  expired: {
    icon: Clock,
    tone: "warn",
    title: "This link has expired",
    body: "Verification links are valid for 24 hours. Request a new one and it'll arrive in a moment.",
  },
  used: {
    icon: AlertCircle,
    tone: "bad",
    title: "This link was already used",
    body: "For safety each link works once. Request a new one to finish verifying.",
  },
};

function VerifyInner() {
  const params = useSearchParams();
  const { user, refresh } = useAuth();
  const raw = params.get("status") ?? "";
  const status: Status =
    raw === "verified" || raw === "already" || raw === "invalid" || raw === "expired" || raw === "used"
      ? raw
      : "idle";

  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (status === "verified" || status === "already") void refresh();
  }, [status, refresh]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const resend = async () => {
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/auth/verify-email", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setState("error");
        setMessage(data.error ?? "Could not send the email. Please try again.");
        if (data.retryAfter) setCooldown(Number(data.retryAfter) || 60);
        return;
      }
      setState("sent");
      setMessage(data.message ?? "Verification email sent — check your inbox.");
      setCooldown(60);
      await refresh();
    } catch {
      setState("error");
      setMessage("Network trouble — check your connection and try again.");
    }
  };

  const banner = status === "idle" ? null : COPY[status];
  const tone =
    banner?.tone === "ok"
      ? "bg-jade/15 text-jade-deep"
      : banner?.tone === "warn"
        ? "bg-saffron/15 text-saffron-deep"
        : "bg-coral/15 text-coral";

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <div className="glass rounded-[2.5rem] p-8 text-center sm:p-10">
        <span
          className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${
            banner ? tone : "bg-saffron/15 text-saffron-deep"
          }`}
        >
          {banner ? (
            <banner.icon className="h-8 w-8" aria-hidden />
          ) : (
            <MailCheck className="h-8 w-8" aria-hidden />
          )}
        </span>

        <h1 className="mt-5 font-display text-3xl font-semibold text-ink">
          {banner ? banner.title : "Verify your email"}
        </h1>

        {banner && (
          <p
            role={banner.tone === "ok" ? "status" : "alert"}
            className="mt-4 text-sm leading-relaxed text-ink-soft"
          >
            {banner.body}
          </p>
        )}

        {!banner && (
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            {user
              ? user.emailVerified
                ? "Your email is already verified — nothing more to do."
                : `We sent a confirmation link to ${user.email}. Click it to unlock saving and sharing.`
              : "Open the confirmation link from your inbox. Links expire after 24 hours."}
          </p>
        )}

        {/* Resend — only meaningful for a signed-in, unverified account */}
        {user && !user.emailVerified && (
          <>
            {state === "sent" && (
              <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-jade/10 px-4 py-3 text-sm text-jade-deep">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> {message}
              </p>
            )}
            {state === "error" && (
              <p
                role="alert"
                className="mt-4 flex items-start justify-center gap-2 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {message}
              </p>
            )}
            <button
              onClick={resend}
              disabled={state === "sending" || cooldown > 0}
              className="btn-primary mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {state === "sending"
                ? "Sending…"
                : cooldown > 0
                  ? `Resend available in ${cooldown}s`
                  : "Resend verification email"}
              {state !== "sending" && <Send className="h-4 w-4" aria-hidden />}
            </button>
            <p className="mt-3 text-xs text-ink-soft">
              We limit resends to one per minute so inboxes stay calm.
            </p>
          </>
        )}

        {!user && (
          <Link
            href="/login?next=/verify-email"
            className="btn-primary mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold"
          >
            Sign in to resend the link
          </Link>
        )}

        <p className="mt-6 text-sm text-ink-soft">
          <Link href="/dashboard" className="font-semibold text-coral hover:underline">
            Continue to your studio
          </Link>{" "}
          — you can browse, edit and download without verifying.
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-20 text-center text-sm text-ink-soft">
          Checking your link…
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  );
}
