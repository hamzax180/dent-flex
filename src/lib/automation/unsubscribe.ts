import { prisma } from "../db";
import { verifySignature } from "../ids";
import { emitEvent } from "../jobs";
import { activity } from "../audit";
import { revokeAndSuppress } from "./consent";

/** Token format: `${leadId}.${channel}` signed with APP_SECRET. Idempotent. */
export async function unsubscribe(token: string, sig: string) {
  if (!token || !sig || !verifySignature(token, sig)) return { ok: false as const };
  const [leadId, channel] = token.split(".");
  if (channel !== "EMAIL" && channel !== "WHATSAPP") return { ok: false as const };
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: true as const }; // don't reveal whether the record exists
  await prisma.$transaction(async (tx) => {
    const latest = await tx.consentRecord.findFirst({ where: { leadId, channel, purpose: "MARKETING" }, orderBy: { createdAt: "desc" } });
    if (latest?.status === "REVOKED") return;
    await revokeAndSuppress(tx, lead, channel, { purpose: "MARKETING", reason: "UNSUBSCRIBE", source: "unsubscribe_link" });
    await activity(tx, { leadId, type: "consent.revoked", data: { channel, via: "unsubscribe_link" } });
    await emitEvent(tx, { type: "message.unsubscribed", dedupeKey: `unsub:link:${leadId}:${channel}:${latest?.id ?? "none"}`, leadId, payload: { channel } });
  });
  return { ok: true as const };
}
