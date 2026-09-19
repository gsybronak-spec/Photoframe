/**
 * Mailer facade.
 *
 * All delivery goes through ./email (Resend → SMTP → dev console). This module
 * exists so route handlers have one obvious import.
 */

import { sendTemplate, type DeliveryResult } from "./email";
import type { EmailTemplateName } from "./email/templates";

export type { DeliveryResult };
export {
  activeProviderName,
  emailProviderStatus,
  recentEmailDeliveries,
} from "./email";

/** Send a rendered template. Never throws — inspect `result.ok`. */
export function sendTemplatedEmail(input: {
  template: EmailTemplateName;
  to: string;
  userId?: string | null;
  data: Record<string, string>;
}): Promise<DeliveryResult> {
  return sendTemplate(input);
}
