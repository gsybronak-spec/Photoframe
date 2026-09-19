"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, MailCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

/**
 * Verification status + resend, shown wherever the user hits the verified-only
 * product surface (dashboard, settings, editor). The server enforces the same
 * rule, so this banner is UX, not security.
 */
export function VerificationBanner({ compact = false }: { compact?: boolean }) {
  const { user, refresh } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  if (!user || user.emailVerified) return null;

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
      setMessage(data.message ?? "Verification email sent.");
      setCooldown(60);
      void refresh();
    } catch {
      setState("error");
      setMessage("Network trouble — check your connection and try again.");
    }
  };

  return (
    <div
      className={`glass-tint flex flex-wrap items-center gap-3 rounded-2xl border border-saffron/30 ${
        compact ? "px-4 py-3" : "px-5 py-4"
      }`}
      role="status"
    >
      <MailCheck className="h-5 w-5 shrink-0 text-saffron-deep" aria-hidden />
      <div className="min-w-[12rem] flex-1">
        <p className="text-sm font-semibold text-teal-deep">
          Verify your email to save &amp; share
        </p>
        <p className="text-xs leading-relaxed text-ink-soft">
          {state === "sent" || state === "error"
            ? message
            : `Confirm ${user.email} to unlock saving and public sharing. Nothing arrived? Resend and it'll be on its way.`}
        </p>
      </div>
      {state === "sent" ? (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-jade-deep">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Sent
        </span>
      ) : (
        <button
          onClick={resend}
          disabled={state === "sending" || cooldown > 0}
          className="btn-primary rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
        >
          {state === "sending"
            ? "Sending…"
            : cooldown > 0
              ? `Resend in ${cooldown}s`
              : "Resend email"}
        </button>
      )}
      {state === "error" && (
        <AlertCircle className="h-4 w-4 shrink-0 text-coral" aria-hidden />
      )}
    </div>
  );
}
