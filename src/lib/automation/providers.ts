import type { ContactChannel } from "@prisma/client";
import { randomUUID } from "node:crypto";

// Provider adapters. Workflow and campaign logic only sees this interface, so a provider
// can be swapped (e.g. Postmark/SES for email, Meta Cloud API/Twilio for WhatsApp) without
// touching business rules. Only the official WhatsApp Business Platform is acceptable.

export type OutboundMessage = {
  channel: ContactChannel;
  to: string;
  subject?: string;
  body: string;
  providerTemplateName?: string; // WhatsApp approved template
  locale: string;
  headers?: Record<string, string>;
};

export type SendResult = { providerMessageId: string };

export class PermanentSendError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export interface MessagingProvider {
  name: string;
  send(msg: OutboundMessage): Promise<SendResult>;
}

/** Development adapter: logs a redacted line and pretends to send. Never used to claim real delivery. */
class ConsoleProvider implements MessagingProvider {
  constructor(public name: string) {}
  async send(msg: OutboundMessage): Promise<SendResult> {
    const masked = msg.to.replace(/^(.{2}).*(.{2})$/, "$1***$2");
    console.info(`[${this.name}] (dev, not sent) ${msg.channel} to ${masked} subject=${JSON.stringify(msg.subject ?? msg.providerTemplateName ?? "")} chars=${msg.body.length}`);
    return { providerMessageId: `dev-${randomUUID()}` };
  }
}

export function providerFor(channel: ContactChannel): MessagingProvider {
  if (channel === "EMAIL") {
    const p = process.env.EMAIL_PROVIDER ?? "console";
    if (p === "console") return new ConsoleProvider("email-console");
    throw new PermanentSendError("provider_not_configured", `Email provider "${p}" has no adapter yet. See README › Messaging providers.`);
  }
  if (channel === "WHATSAPP") {
    const p = process.env.WHATSAPP_PROVIDER ?? "console";
    if (p === "console") return new ConsoleProvider("whatsapp-console");
    throw new PermanentSendError("provider_not_configured", `WhatsApp provider "${p}" has no adapter yet. See README › Messaging providers.`);
  }
  throw new PermanentSendError("channel_disabled", `${channel} sending is disabled.`);
}

/** Minimal, safe placeholder rendering. Unknown placeholders are left blank rather than leaking data. */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}
