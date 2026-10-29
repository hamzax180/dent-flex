import { z } from "zod";
import { clinicDateTime } from "../validation/dates";
import { Prisma, type Lead } from "@prisma/client";
import { prisma, type Db } from "../db";
import { ApiError } from "../errors";
import { audit } from "../audit";
import { enqueueJob } from "../jobs";
import type { Staff } from "../auth/session";
import { checkEligibility } from "./consent";
import { findPublishedTemplate } from "./engine";
import { providerFor, renderTemplate } from "./providers";

/**
 * Segments may only use permitted, non-sensitive operational attributes.
 * Treatment interest, symptoms and other health data are deliberately absent.
 */
export const segmentSchema = z
  .object({
    statuses: z.array(z.enum(["NEW", "CONTACTED", "QUALIFIED", "APPOINTMENT_REQUESTED", "APPOINTMENT_CONFIRMED", "VISITED", "TREATMENT_PROPOSED", "WON", "LOST", "NURTURE"])).optional(),
    languages: z.array(z.enum(["en", "tr"])).optional(),
    sources: z.array(z.string().max(40)).optional(),
    utmCampaign: z.string().max(80).optional(),
    tags: z.array(z.string().max(40)).optional(),
    ownerId: z.string().uuid().optional(),
    appointmentState: z.enum(["any", "none", "requested", "confirmed"]).default("any"),
  })
  .strict();
export type Segment = z.infer<typeof segmentSchema>;

function segmentWhere(s: Segment): Prisma.LeadWhereInput {
  return {
    AND: [
      s.statuses?.length ? { status: { in: s.statuses } } : {},
      s.languages?.length ? { language: { in: s.languages } } : {},
      s.sources?.length ? { source: { in: s.sources as never } } : {},
      s.utmCampaign ? { utmCampaign: s.utmCampaign } : {},
      s.tags?.length ? { tags: { hasSome: s.tags } } : {},
      s.ownerId ? { ownerId: s.ownerId } : {},
      s.appointmentState === "none" ? { appointmentRequests: { none: {} }, appointments: { none: {} } } : {},
      s.appointmentState === "requested" ? { appointmentRequests: { some: { status: { in: ["REQUESTED", "IN_REVIEW"] } } } } : {},
      s.appointmentState === "confirmed" ? { appointments: { some: { status: "CONFIRMED" } } } : {},
    ],
  };
}

export type AudiencePreview = {
  matched: number;
  eligible: number;
  excluded: number;
  suppressed: number;
  reasons: Record<string, number>;
  sample: { publicId: string; reason: string | null }[];
};

async function evaluateAudience(db: Db, channel: "EMAIL" | "WHATSAPP", segment: Segment) {
  const leads = await db.lead.findMany({ where: segmentWhere(segment), take: 5000 });
  const out: { lead: Lead; ok: boolean; reason: string | null; category: "eligible" | "excluded" | "suppressed" }[] = [];
  for (const lead of leads) {
    const e = await checkEligibility(db, lead, channel, "MARKETING");
    out.push(e.ok ? { lead, ok: true, reason: null, category: "eligible" } : { lead, ok: false, reason: e.reason, category: e.category });
  }
  return out;
}

export async function previewAudience(channel: "EMAIL" | "WHATSAPP", rawSegment: unknown): Promise<AudiencePreview> {
  const segment = segmentSchema.parse(rawSegment);
  const rows = await evaluateAudience(prisma, channel, segment);
  const reasons: Record<string, number> = {};
  for (const r of rows) if (r.reason) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  return {
    matched: rows.length,
    eligible: rows.filter((r) => r.category === "eligible").length,
    excluded: rows.filter((r) => r.category === "excluded").length,
    suppressed: rows.filter((r) => r.category === "suppressed").length,
    reasons,
    sample: rows.slice(0, 10).map((r) => ({ publicId: r.lead.publicId, reason: r.reason })),
  };
}

export const campaignInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  channel: z.enum(["EMAIL", "WHATSAPP"]),
  templateKey: z.string().trim().min(1).max(80),
  segment: segmentSchema,
});

export async function createCampaign(staff: Staff, raw: unknown, requestId?: string) {
  const input = campaignInputSchema.parse(raw);
  const c = await prisma.campaign.create({
    data: { name: input.name, channel: input.channel, templateKey: input.templateKey, segment: input.segment as Prisma.InputJsonValue, createdById: staff.id },
  });
  await audit(prisma, { actorId: staff.id, action: "campaign.created", entityType: "Campaign", entityId: c.id, requestId });
  return c;
}

type Transition = "submit" | "approve" | "schedule" | "pause" | "resume" | "cancel";
const RULES: Record<Transition, { from: string[]; to: string; perm: "campaigns:draft" | "campaigns:approve" }> = {
  submit: { from: ["DRAFT"], to: "PENDING_APPROVAL", perm: "campaigns:draft" },
  approve: { from: ["PENDING_APPROVAL"], to: "APPROVED", perm: "campaigns:approve" },
  schedule: { from: ["APPROVED"], to: "SCHEDULED", perm: "campaigns:approve" },
  pause: { from: ["SCHEDULED", "SENDING"], to: "PAUSED", perm: "campaigns:approve" },
  resume: { from: ["PAUSED"], to: "SENDING", perm: "campaigns:approve" },
  cancel: { from: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SCHEDULED", "SENDING", "PAUSED"], to: "CANCELLED", perm: "campaigns:approve" },
};
export const campaignTransitionPermission = (t: Transition) => RULES[t].perm;

export async function transitionCampaign(staff: Staff, id: string, t: Transition, raw: unknown, requestId?: string) {
  const rule = RULES[t];
  return prisma.$transaction(async (tx) => {
    const c = await tx.campaign.findUnique({ where: { id } });
    if (!c) throw new ApiError("NOT_FOUND", "Campaign not found.");
    if (!rule.from.includes(c.status)) throw new ApiError("INVALID_TRANSITION", `Cannot ${t} a ${c.status.toLowerCase()} campaign.`);
    const data: Prisma.CampaignUpdateInput = { status: rule.to as never };
    if (t === "submit" || t === "approve") {
      const tpl = await findPublishedTemplate(tx, c.templateKey, c.channel, "en");
      if (!tpl) throw new ApiError("VALIDATION_ERROR", `Publish the "${c.templateKey}" ${c.channel.toLowerCase()} template first.`);
      if (tpl.purpose !== "MARKETING") throw new ApiError("VALIDATION_ERROR", "Campaigns must use a marketing-purpose template.");
    }
    if (t === "approve") Object.assign(data, { approvedById: staff.id, approvedAt: new Date() });
    if (t === "schedule") {
      const { scheduledAt } = z.object({ scheduledAt: clinicDateTime }).parse(raw);
      const at = scheduledAt < new Date() ? new Date() : scheduledAt;
      data.scheduledAt = at;
      await enqueueJob(tx, "campaign.launch", { campaignId: id }, { runAt: at, dedupeKey: `campaign:${id}` });
    }
    if (t === "cancel") {
      await tx.job.updateMany({ where: { dedupeKey: `campaign:${id}`, status: "PENDING" }, data: { status: "CANCELLED" } });
      await tx.messageDelivery.updateMany({ where: { campaignId: id, status: "QUEUED" }, data: { status: "BLOCKED", failureCode: "campaign_cancelled" } });
    }
    const updated = await tx.campaign.update({ where: { id }, data });
    await audit(tx, { actorId: staff.id, action: `campaign.${t}`, entityType: "Campaign", entityId: id, requestId });
    return updated;
  });
}

/** Snapshot the audience at send time and queue one delivery per eligible recipient (rate-spaced). */
export async function launchCampaign(campaignId: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c || c.status !== "SCHEDULED") return { skipped: c?.status ?? "missing" };
  const rows = await evaluateAudience(prisma, c.channel as "EMAIL" | "WHATSAPP", segmentSchema.parse(c.segment));
  let queued = 0;
  const spacingMs = 1500;
  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({ where: { id: c.id }, data: { status: "SENDING" } });
    for (const r of rows) {
      const recipient = await tx.campaignRecipient.upsert({
        where: { campaignId_leadId: { campaignId: c.id, leadId: r.lead.id } },
        update: {},
        create: { campaignId: c.id, leadId: r.lead.id, status: r.ok ? "QUEUED" : "EXCLUDED", reason: r.reason },
      });
      if (!r.ok || recipient.deliveryId) continue;
      const tpl = await findPublishedTemplate(tx, c.templateKey, c.channel, r.lead.language);
      if (!tpl) {
        await tx.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "EXCLUDED", reason: "no template for language" } });
        continue;
      }
      const d = await tx.messageDelivery.create({
        data: { leadId: r.lead.id, channel: c.channel, purpose: "MARKETING", templateId: tpl.id, provider: providerFor(c.channel).name, campaignId: c.id, dedupeKey: `camp:${c.id}:${r.lead.id}` },
      });
      await tx.campaignRecipient.update({ where: { id: recipient.id }, data: { deliveryId: d.id } });
      await enqueueJob(tx, "message.send", { deliveryId: d.id }, { runAt: new Date(Date.now() + queued * spacingMs), dedupeKey: `send:${d.id}` });
      queued++;
    }
  }, { timeout: 120_000 });
  return { queued, matched: rows.length };
}

/** Test send to a staff address using the dev/console provider path; never touches real recipients. */
export async function testSendCampaign(staff: Staff, id: string) {
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) throw new ApiError("NOT_FOUND", "Campaign not found.");
  const tpl = await findPublishedTemplate(prisma, c.templateKey, c.channel, "en");
  if (!tpl) throw new ApiError("VALIDATION_ERROR", "Publish the template before a test send.");
  if (c.channel !== "EMAIL") throw new ApiError("VALIDATION_ERROR", "WhatsApp test sends require a registered test number in the provider console.");
  const vars = { firstName: staff.name.split(" ")[0], reference: "DF-TEST-0000", appointmentTime: "" };
  const res = await providerFor("EMAIL").send({
    channel: "EMAIL", to: staff.email, subject: `[TEST] ${renderTemplate(tpl.subject ?? "", vars)}`, body: renderTemplate(tpl.body, vars), locale: tpl.locale,
  });
  await audit(prisma, { actorId: staff.id, action: "campaign.test_send", entityType: "Campaign", entityId: id });
  return res;
}
