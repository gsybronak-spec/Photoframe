/**
 * Email templates — plain HTML with inline styles (no external CSS, no images
 * that need hosting) so they render reliably in Gmail/Outlook/Apple Mail.
 *
 * Every template returns `{ subject, html, text }`. Tokens live only inside the
 * generated URL inside the body — they are never part of the subject, and they
 * are never logged (see ../email/index.ts).
 */

export interface TemplateParts {
  subject: string;
  html: string;
  text: string;
}

export type EmailTemplateName =
  | "verify_email"
  | "password_reset"
  | "welcome"
  | "password_changed";

const CREAM = "#FBF7F1";
const INK = "#243033";
const INK_SOFT = "#5C6B6E";
const SAFFRON = "#F59E0B";
const CORAL = "#FF7E67";
const TEAL = "#0F766E";

function layout(opts: {
  preheader: string;
  heading: string;
  body: string;
  cta?: { label: string; url: string };
  footnote?: string;
}): string {
  const { preheader, heading, body, cta, footnote } = opts;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${CREAM};color:${INK};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
    <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${escapeHtml(
      preheader
    )}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid rgba(15,118,110,0.12);">
            <tr>
              <td style="background:linear-gradient(120deg,${SAFFRON},${CORAL});padding:22px 32px;">
                <span style="font-size:18px;font-weight:700;letter-spacing:0.14em;color:#ffffff;">ZENFRAME</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:${INK};font-family:Georgia,'Times New Roman',serif;font-weight:600;">${escapeHtml(
                  heading
                )}</h1>
                <div style="font-size:15px;line-height:1.65;color:${INK_SOFT};">${body}</div>
                ${
                  cta
                    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
                        <tr>
                          <td style="border-radius:999px;background:${TEAL};">
                            <a href="${escapeAttr(cta.url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(
                              cta.label
                            )}</a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${INK_SOFT};word-break:break-all;">
                        Button not working? Paste this link into your browser:<br />
                        <a href="${escapeAttr(cta.url)}" style="color:${TEAL};">${escapeHtml(
                          cta.url
                        )}</a>
                      </p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px;border-top:1px solid rgba(15,118,110,0.12);font-size:12px;line-height:1.6;color:${INK_SOFT};">
                ${
                  footnote
                    ? `<p style="margin:0 0 10px;">${escapeHtml(footnote)}</p>`
                    : ""
                }
                <p style="margin:0;">ZenFrame · yoga photo frames &amp; wellness campaigns</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

export function verifyEmailTemplate(input: {
  name: string;
  url: string;
  hours?: number;
}): TemplateParts {
  const hours = input.hours ?? 24;
  return {
    subject: "Verify your ZenFrame email",
    html: layout({
      preheader: `Confirm your email to unlock saving and sharing (link valid ${hours}h).`,
      heading: `One breath to confirm, ${input.name}`,
      body: `<p style="margin:0 0 12px;">Welcome to the studio. Confirm this email address and your creations will save straight to your account — private until you decide to share them.</p>
        <p style="margin:0;">This link expires in ${hours} hours and can only be used once.</p>`,
      cta: { label: "Verify my email", url: input.url },
      footnote: "If you didn't create a ZenFrame account, you can ignore this message.",
    }),
    text: `Namaste ${input.name},

Confirm your ZenFrame email address:
${input.url}

The link expires in ${hours} hours and can only be used once.
If you didn't create an account, you can ignore this message.

— ZenFrame`,
  };
}

export function passwordResetTemplate(input: {
  name: string;
  url: string;
  minutes?: number;
}): TemplateParts {
  const minutes = input.minutes ?? 60;
  return {
    subject: "Reset your ZenFrame password",
    html: layout({
      preheader: `A password reset link is ready — valid for ${minutes} minutes.`,
      heading: "Reset your password",
      body: `<p style="margin:0 0 12px;">Hi ${escapeHtml(input.name)}, we received a request to reset your ZenFrame password.</p>
        <p style="margin:0;">The link below expires in ${minutes} minutes and can only be used once. For your safety, every other signed-in device stays signed in until you use it — then we sign them all out.</p>`,
      cta: { label: "Choose a new password", url: input.url },
      footnote:
        "Didn't request this? No action needed — your password stays unchanged.",
    }),
    text: `Hi ${input.name},

Reset your ZenFrame password:
${input.url}

This link expires in ${minutes} minutes and can only be used once.
If you didn't request it, no action is needed.

— ZenFrame`,
  };
}

export function welcomeTemplate(input: {
  name: string;
  url: string;
}): TemplateParts {
  return {
    subject: "Welcome to ZenFrame 🧘",
    html: layout({
      preheader: "Your mat is rolled out — here's how to make your first frame.",
      heading: `Welcome, ${input.name}`,
      body: `<p style="margin:0 0 12px;">You're in. Pick a hand-crafted frame, drop in a photo, add an intention, and download a 1000×1250 share-ready image.</p>
        <p style="margin:0;">Everything is edited in your browser; saved creations live privately in your studio until you choose to share them.</p>`,
      cta: { label: "Browse the gallery", url: input.url },
      footnote: "Tip: bookmark frames you love for quick access later.",
    }),
    text: `Welcome, ${input.name}!

Your ZenFrame studio is ready. Browse hand-crafted yoga frames, add your photo,
write an intention and download a share-ready 1000x1250 image.

${input.url}

— ZenFrame`,
  };
}

export function passwordChangedTemplate(input: {
  name: string;
  when: string;
  url: string;
}): TemplateParts {
  return {
    subject: "Your ZenFrame password was changed",
    html: layout({
      preheader: "Security notice — your password was changed.",
      heading: "Your password was changed",
      body: `<p style="margin:0 0 12px;">Hi ${escapeHtml(input.name)}, the password on your ZenFrame account was changed on <strong>${escapeHtml(
        input.when
      )}</strong>.</p>
        <p style="margin:0;">All other sessions were signed out as a precaution. If this wasn't you, reset your password immediately and contact us.</p>`,
      cta: { label: "Reset password now", url: input.url },
      footnote: "This is an automated security notification.",
    }),
    text: `Hi ${input.name},

The password on your ZenFrame account was changed on ${input.when}.
All other sessions were signed out as a precaution.

If this wasn't you, reset your password immediately:
${input.url}

— ZenFrame`,
  };
}

export function renderTemplate(
  name: EmailTemplateName,
  data: Record<string, string>
): TemplateParts {
  switch (name) {
    case "verify_email":
      return verifyEmailTemplate({
        name: data.name ?? "there",
        url: data.url,
        hours: data.hours ? Number(data.hours) : undefined,
      });
    case "password_reset":
      return passwordResetTemplate({
        name: data.name ?? "there",
        url: data.url,
        minutes: data.minutes ? Number(data.minutes) : undefined,
      });
    case "welcome":
      return welcomeTemplate({ name: data.name ?? "there", url: data.url });
    case "password_changed":
      return passwordChangedTemplate({
        name: data.name ?? "there",
        when: data.when ?? new Date().toUTCString(),
        url: data.url,
      });
  }
}
