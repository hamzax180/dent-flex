import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ApiError } from "../errors";
import { emitEvent } from "../jobs";
import { activity } from "../audit";
import { revokeAndSuppress } from "./consent";

const REPLAY_WINDOW_MS = 5 * 60_000;

/**
 * Verify HMAC-SHA256(secret, `${timestamp}.${rawBody}`) and reject stale timestamps.
 * Real providers (Postmark, SES, Meta Cloud API, …) each sign differently: their adapter should
 * verify natively, then normalise to `providerEventSchema` below.
 */
export function verifyProviderSignature(rawBody: string, timestamp: string | null, signature: string | null, now = Date.now()) {
  const secret = process.env.PROVIDER_WEBHOOK_SECRET;
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts * 1000) > REPLAY_WINDOW_MS) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const providerEventSchema = z.object({
  eventId: z.string().min(1).max(200),
  type: z.enum(["delivered", "bounced", "failed", "clicked", "replied", "opt_out", "complaint"]),
  providerMessageId: z.string().min(1).max(200),
  bounceType: z.enum(["hard", "soft"]).optional(),
  text: z.string().max(500).optional(), // reply text, only used to detect STOP keywords; not stored
});

const STOP_WORDS = /^\s*(stop|unsubscribe|dur|iptal|abonelik(ten)? çık)\s*$/i;

/** Idempotent: a replayed or duplicated provider event is recorded once and has no further effect. */
export async function ingestProviderEvent(provider: string, raw: unknown) {
  const e = providerEventSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    try {
      await tx.providerEvent.create({ data: { provider, providerEventId: e.eventId, type: e.type, payload: { providerMessageId: e.providerMessageId, bounceType: e.bounceType } } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { duplicate: true };
      throw err;
    }
    const d = await tx.messageDelivery.findUnique({ where: { providerMessageId: e.providerMessageId }, include: { lead: true } });
    if (!d) return { unmatched: true };
    await tx.providerEvent.update({ where: { provider_providerEventId: { provider, providerEventId: e.eventId } }, data: { deliveryId: d.id } });

    const isStop = e.type === "opt_out" || (e.type === "replied" && e.text && STOP_WORDS.test(e.text));
    const base = { leadId: d.leadId, payload: { deliveryId: d.id, channel: d.channel } };
    if (isStop || e.type === "complaint") {
      await revokeAndSuppress(tx, d.lead, d.channel, { purpose: "MARKETING", reason: e.type === "complaint" ? "COMPLAINT" : "OPT_OUT", source: `${provider}_webhook` });
      await activity(tx, { leadId: d.leadId, type: "consent.revoked", data: { channel: d.channel, via: e.type } });
      await emitEvent(tx, { type: "message.unsubscribed", dedupeKey: `pe:${provider}:${e.eventId}`, ...base });
      return { handled: "opt_out" };
    }
    switch (e.type) {
      case "delivered":
        await tx.messageDelivery.updateMany({ where: { id: d.id, status: { in: ["SENT", "QUEUED"] } }, data: { status: "DELIVERED" } });
        await emitEvent(tx, { type: "message.delivered", dedupeKey: `pe:${provider}:${e.eventId}`, ...base });
        break;
      case "bounced":
        await tx.messageDelivery.update({ where: { id: d.id }, data: { status: "BOUNCED", failureCode: `bounce_${e.bounceType ?? "unknown"}` } });
        if (e.bounceType !== "soft") {
          const address = d.channel === "EMAIL" ? d.lead.email : d.lead.phone;
          if (address) {
            await tx.suppression.upsert({
              where: { scope_address: { scope: d.channel as "EMAIL" | "WHATSAPP", address } },
              update: {},
              create: { scope: d.channel as "EMAIL" | "WHATSAPP", address, reason: "BOUNCE", leadId: d.leadId },
            });
          }
        }
        await emitEvent(tx, { type: "message.bounced", dedupeKey: `pe:${provider}:${e.eventId}`, ...base });
        break;
      case "failed":
        await tx.messageDelivery.update({ where: { id: d.id }, data: { status: "FAILED", failureCode: "provider_failed" } });
        break;
      case "clicked":
        await tx.messageDelivery.update({ where: { id: d.id }, data: { clickedAt: d.clickedAt ?? new Date() } });
        await emitEvent(tx, { type: "message.clicked", dedupeKey: `pe:${provider}:${e.eventId}`, ...base });
        break;
      case "replied":
        await tx.messageDelivery.update({ where: { id: d.id }, data: { repliedAt: d.repliedAt ?? new Date() } });
        await tx.lead.update({ where: { id: d.leadId }, data: { answeredFollowUp: true, lastActivityAt: new Date() } });
        await activity(tx, { leadId: d.leadId, type: "message.replied", data: { channel: d.channel } });
        await emitEvent(tx, { type: "message.replied", dedupeKey: `pe:${provider}:${e.eventId}`, ...base });
        break;
    }
    return { handled: e.type };
  });
}

export function assertKnownProvider(p: string) {
  if (!/^[a-z0-9-]{2,30}$/.test(p)) throw new ApiError("NOT_FOUND", "Unknown provider.");
}
