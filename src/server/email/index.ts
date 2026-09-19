/**
 * Email orchestrator.
 *
 * Provider selection (explicit env wins, otherwise auto-detect):
 *   EMAIL_PROVIDER=resend | smtp | console
 *   auto → resend (RESEND_API_KEY) → smtp (SMTP_HOST) → console
 *
 * Failure policy: a provider failure NEVER throws into a request handler. Auth
 * flows still complete (the user can request another link), the attempt is
 * recorded in `email_deliveries`, and the failure is logged — but never with the
 * message body, so verification/reset tokens can't leak into logs.
 */

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, getDb, nowIso } from "../db";
import { generateToken } from "../passwords";
import { resendConfigured, sendViaResend, type OutboundMail } from "./resend";
import { smtpConfigured, sendViaSmtp } from "./smtp";
import { renderTemplate, type EmailTemplateName } from "./templates";

import type { EmailProviderName } from "./resend";

export type { EmailProviderName };

/** Providers that can actually deliver mail ("none" = render/pre-flight failure). */
export type ActiveProvider = Exclude<EmailProviderName, "none">;

export interface DeliveryResult {
  ok: boolean;
  provider: EmailProviderName;
  detail?: string;
}

export function activeProviderName(): ActiveProvider {
  const explicit = (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  if (explicit === "resend" || explicit === "smtp" || explicit === "console") {
    return explicit;
  }
  if (resendConfigured()) return "resend";
  if (smtpConfigured()) return "smtp";
  return "console";
}

/** Masks the local part so logs carry enough to debug, but not full addresses. */
export function maskEmail(email: string): string {
  const [local, domain = ""] = email.split("@");
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(1, Math.min(local.length - 1, 6)))}@${domain}`;
}

function recordDelivery(input: {
  userId?: string | null;
  template: string;
  to: string;
  provider: string;
  status: string;
  detail?: string | null;
}) {
  try {
    getDb()
      .prepare(
        `INSERT INTO email_deliveries
           (id, user_id, template, to_domain, provider, status, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        generateToken(12),
        input.userId ?? null,
        input.template,
        input.to.split("@")[1] ?? "unknown",
        input.provider,
        input.status,
        (input.detail ?? "").slice(0, 200) || null,
        nowIso()
      );
  } catch {
    /* delivery logging must never break a request */
  }
}

const DEV_MAIL_FILE = path.join(DATA_DIR, ".mail");

/**
 * Dev fallback: writes the full message to data/.mail so verification and reset
 * links are usable without a mail provider. Disabled in production unless
 * ALLOW_DEV_MAIL_LOG=1 is set explicitly (used by the automated test suite).
 */
async function sendViaConsole(
  mail: OutboundMail,
  template: string
): Promise<DeliveryResult> {
  const mayLog = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_MAIL_LOG === "1";
  if (!mayLog) {
    console.warn(
      `[email] No provider configured — "${template}" to ${maskEmail(mail.to)} was NOT sent. ` +
        `Set RESEND_API_KEY (or SMTP_HOST/SMTP_PORT) to enable delivery.`
    );
    return { ok: false, provider: "console", detail: "no provider configured" };
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(
      DEV_MAIL_FILE,
      `[${nowIso()}] to=${mail.to} subject="${mail.subject}"\n${mail.text}\n---\n`
    );
  } catch {
    /* dev log is best-effort */
  }
  console.info(`[email:dev] "${mail.subject}" → ${mail.to}`);
  return { ok: true, provider: "console" };
}

export interface SendTemplateInput {
  template: EmailTemplateName;
  to: string;
  userId?: string | null;
  data: Record<string, string>;
}

/**
 * Renders a template and delivers it. Always resolves — check `ok`.
 * Delivery status is persisted without the token-bearing body.
 */
export async function sendTemplate(
  input: SendTemplateInput
): Promise<DeliveryResult> {
  let parts: { subject: string; html: string; text: string };
  try {
    parts = renderTemplate(input.template, input.data);
  } catch (err) {
    recordDelivery({
      userId: input.userId,
      template: input.template,
      to: input.to,
      provider: "none",
      status: "render_failed",
      detail: err instanceof Error ? err.message : "render error",
    });
    return { ok: false, provider: "none", detail: "template render failed" };
  }

  const mail: OutboundMail = { to: input.to, ...parts };
  const provider = activeProviderName();

  let result: DeliveryResult;
  if (provider === "resend") {
    result = await sendViaResend(mail);
    // If Resend is configured but failing, don't silently swallow it — and if an
    // SMTP fallback is available, try once more before giving up.
    if (!result.ok && smtpConfigured()) {
      const fallback = await sendViaSmtp(mail);
      if (fallback.ok) result = fallback;
    }
  } else if (provider === "smtp") {
    result = await sendViaSmtp(mail);
  } else {
    result = await sendViaConsole(mail, input.template);
  }

  recordDelivery({
    userId: input.userId,
    template: input.template,
    to: input.to,
    provider: result.provider,
    status: result.ok ? "sent" : "failed",
    detail: result.ok ? null : (result.detail ?? "unknown error"),
  });

  if (!result.ok) {
    console.error(
      `[email] ${input.template} to ${maskEmail(input.to)} failed via ${result.provider}: ${
        result.detail ?? "unknown"
      }`
    );
  }

  return result;
}

/** Recent deliveries for the admin panel (no tokens, no full addresses). */
export function recentEmailDeliveries(limit = 10) {
  return getDb()
    .prepare(
      `SELECT template, to_domain, provider, status, detail, created_at
       FROM email_deliveries ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as {
    template: string;
    to_domain: string;
    provider: string;
    status: string;
    detail: string | null;
    created_at: string;
  }[];
}

/** Human-readable provider state for admin/settings panels. */
export function emailProviderStatus(): {
  provider: ActiveProvider;
  ready: boolean;
} {
  const provider = activeProviderName();
  return {
    provider,
    ready:
      provider === "resend"
        ? resendConfigured()
        : provider === "smtp"
          ? smtpConfigured()
          : process.env.NODE_ENV !== "production",
  };
}
