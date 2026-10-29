import { z } from "zod";
import type { ContactChannel, ContactPurpose, Lead, SuppressionScope, SuppressionReason } from "@prisma/client";
import { prisma, type Db } from "../db";
import { ApiError } from "../errors";
import { activity, audit } from "../audit";
import type { Staff } from "../auth/session";
import { emitEvent } from "../jobs";

/** Latest record wins: permission is GRANTED only if the newest record for (channel, purpose) is GRANTED. */
export async function hasPermission(db: Db, leadId: string, channel: ContactChannel, purpose: ContactPurpose): Promise<boolean> {
  const latest = await db.consentRecord.findFirst({ where: { leadId, channel, purpose }, orderBy: { createdAt: "desc" } });
  return latest?.status === "GRANTED";
}

export function addressFor(lead: Pick<Lead, "email" | "phone">, channel: ContactChannel): string | null {
  return channel === "EMAIL" ? lead.email : lead.phone;
}

const scopeFor = (channel: ContactChannel): SuppressionScope => channel as SuppressionScope;

export async function isSuppressed(db: Db, lead: Pick<Lead, "id" | "email" | "phone">, channel: ContactChannel): Promise<SuppressionReason | null> {
  const address = addressFor(lead, channel);
  const row = await db.suppression.findFirst({
    where: { OR: [{ scope: "GLOBAL", address: lead.id }, ...(address ? [{ scope: scopeFor(channel), address }] : [])] },
  });
  return row?.reason ?? null;
}

export type Eligibility = { ok: true } | { ok: false; reason: string; category: "excluded" | "suppressed" };

/**
 * Single gate used by campaign preview, workflow conditions and the final pre-send check.
 * Service messages need SERVICE permission; marketing needs MARKETING permission and no human hold.
 */
export async function checkEligibility(db: Db, lead: Lead, channel: ContactChannel, purpose: ContactPurpose): Promise<Eligibility> {
  const address = addressFor(lead, channel);
  if (!address) return { ok: false, reason: `no ${channel.toLowerCase()} destination`, category: "excluded" };
  const suppressed = await isSuppressed(db, lead, channel);
  if (suppressed) return { ok: false, reason: `suppressed (${suppressed.toLowerCase()})`, category: "suppressed" };
  if (!(await hasPermission(db, lead.id, channel, purpose))) {
    return { ok: false, reason: `no ${purpose.toLowerCase()} permission for ${channel.toLowerCase()}`, category: "excluded" };
  }
  if (purpose === "MARKETING" && lead.humanHold) return { ok: false, reason: "human hold", category: "excluded" };
  return { ok: true };
}

/** Revoke a permission, add a suppression and stop queued marketing — used by unsubscribe, STOP replies and staff. */
export async function revokeAndSuppress(
  db: Db,
  lead: Pick<Lead, "id" | "email" | "phone">,
  channel: ContactChannel,
  opts: { purpose: ContactPurpose; reason: SuppressionReason; source: string; actorId?: string | null; noticeVersion?: string },
) {
  const now = new Date();
  await db.consentRecord.create({
    data: { leadId: lead.id, channel, purpose: opts.purpose, status: "REVOKED", noticeVersion: opts.noticeVersion ?? "n/a", source: opts.source, actorId: opts.actorId ?? null, revokedAt: now },
  });
  const address = addressFor(lead, channel);
  if (address) {
    await db.suppression.upsert({
      where: { scope_address: { scope: scopeFor(channel), address } },
      update: {},
      create: { scope: scopeFor(channel), address, reason: opts.reason, leadId: lead.id },
    });
  }
  // Queued sends on this channel are re-checked before sending anyway; mark them now so the UI is accurate.
  await db.messageDelivery.updateMany({
    where: { leadId: lead.id, channel, status: "QUEUED", ...(opts.purpose === "MARKETING" ? { purpose: "MARKETING" } : {}) },
    data: { status: "BLOCKED", failureCode: `revoked:${opts.reason.toLowerCase()}` },
  });
}

const consentInput = z.object({
  channel: z.enum(["EMAIL", "PHONE", "WHATSAPP", "SMS"]),
  purpose: z.enum(["SERVICE", "MARKETING"]),
  status: z.enum(["GRANTED", "REVOKED"]),
  source: z.string().trim().min(2).max(80), // e.g. "phone call 29 Oct", "paper form"
  evidence: z.string().trim().min(3).max(300),
  noticeVersion: z.string().trim().min(1).max(40),
});

/** Staff-recorded permission change with evidence. Revocation also suppresses and emits an event. */
export async function recordConsent(staff: Staff, leadId: string, raw: unknown, requestId?: string) {
  const input = consentInput.parse(raw);
  await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new ApiError("NOT_FOUND", "Lead not found.");
    if (input.status === "REVOKED") {
      await revokeAndSuppress(tx, lead, input.channel, { purpose: input.purpose, reason: "MANUAL", source: input.source, actorId: staff.id, noticeVersion: input.noticeVersion });
      if (input.purpose === "MARKETING") {
        await emitEvent(tx, { type: "message.unsubscribed", dedupeKey: `unsub:staff:${lead.id}:${input.channel}:${Date.now()}`, leadId, payload: { channel: input.channel } });
      }
    } else {
      // Re-granting does not silently lift a suppression: staff must clear it explicitly after verifying permission.
      await tx.consentRecord.create({
        data: { leadId, channel: input.channel, purpose: input.purpose, status: "GRANTED", noticeVersion: input.noticeVersion, source: input.source, evidence: input.evidence, actorId: staff.id, grantedAt: new Date() },
      });
    }
    await activity(tx, { leadId, actorId: staff.id, type: `consent.${input.status.toLowerCase()}`, data: { channel: input.channel, purpose: input.purpose } });
    await audit(tx, { actorId: staff.id, action: `consent.${input.status.toLowerCase()}`, entityType: "Lead", entityId: leadId, data: { channel: input.channel, purpose: input.purpose, source: input.source }, requestId });
  });
}
