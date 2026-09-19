/**
 * Resend provider (primary). Uses the REST API directly via fetch — no SDK
 * dependency, and the API key never leaves the server.
 *
 * Env:
 *   RESEND_API_KEY   required
 *   MAIL_FROM        e.g. "ZenFrame <hello@yourdomain.com>"
 */

export interface OutboundMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailProviderName = "resend" | "smtp" | "console" | "none";

export interface SendResult {
  ok: boolean;
  provider: EmailProviderName;
  detail?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendViaResend(mail: OutboundMail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, provider: "resend", detail: "RESEND_API_KEY missing" };
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? "ZenFrame <onboarding@resend.dev>",
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Resend returns a JSON error body; keep only the short message so an
      // upstream HTML error page or key fragment can never reach our logs.
      const body = await res.text().catch(() => "");
      const detail =
        body.slice(0, 300).replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]") ||
        `HTTP ${res.status}`;
      return { ok: false, provider: "resend", detail };
    }
    return { ok: true, provider: "resend" };
  } catch (err) {
    return {
      ok: false,
      provider: "resend",
      detail: err instanceof Error ? err.message.slice(0, 200) : "network error",
    };
  }
}
