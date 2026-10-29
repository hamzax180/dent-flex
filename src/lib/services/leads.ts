import { refreshLeadInterest } from "../interest";
import { Prisma, type Lead, type LeadSource, type LeadStatus, type ContactChannel } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { ApiError } from "../errors";
import { publicId, sha256 } from "../ids";
import { calculateScore, type ScoreFacts } from "../scoring";
import { leadInputSchema, PRIVACY_NOTICE_VERSION, type LeadInput } from "../validation/lead";
import { activity } from "../audit";
import { emitEvent } from "../jobs";

const DEDUPE_WINDOW_DAYS = 30;

export function scoreFactsFromLead(lead: Pick<Lead,
  "appointmentIntent" | "bookingTimeframe" | "email" | "phone" | "treatmentId" | "treatmentNotSure" |
  "preferredChannel" | "preferredTime" | "answeredFollowUp" | "nextStepRequested">): ScoreFacts {
  return {
    appointmentIntent: lead.appointmentIntent,
    bookingTimeframe: lead.bookingTimeframe,
    hasValidEmail: Boolean(lead.email),
    hasValidPhone: Boolean(lead.phone),
    hasTreatmentInterest: Boolean(lead.treatmentId) && !lead.treatmentNotSure,
    preferredChannel: lead.preferredChannel,
    preferredTime: lead.preferredTime,
    answeredFollowUp: lead.answeredFollowUp,
    nextStepRequested: lead.nextStepRequested,
  };
}

/** Recalculate and persist the score. Emits lead.score_changed when the band changes. */
export async function rescoreLead(tx: Tx, leadId: string, reason: string) {
  const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
  const result = calculateScore(scoreFactsFromLead(lead));
  const changed = result.total !== lead.scoreTotal || result.band !== lead.scoreBand;
  const latest = await tx.leadScore.findFirst({ where: { leadId }, orderBy: { calculatedAt: "desc" } });
  if (changed || !latest) {
    const score = await tx.leadScore.create({
      data: { leadId, version: result.version, total: result.total, band: result.band, factors: result.factors as unknown as Prisma.InputJsonValue },
    });
    await tx.lead.update({ where: { id: leadId }, data: { scoreTotal: result.total, scoreBand: result.band } });
    if (latest && lead.scoreBand !== result.band) {
      await emitEvent(tx, {
        type: "lead.score_changed",
        dedupeKey: `score:${score.id}`,
        leadId,
        payload: { from: lead.scoreBand, to: result.band, reason },
      });
    }
  }
  return result;
}

export type CreateLeadOptions = {
  source: LeadSource;
  idempotencyKey?: string | null;
  conversationId?: string | null;
  sourceDetail?: string;
  /** Staff-entered leads: who recorded it and how the privacy notice was given. */
  actorId?: string | null;
  consentEvidence?: string;
  ownerId?: string | null;
};

export type CreateLeadResult = { publicId: string; leadId: string; duplicate: boolean; appointmentRequestId: string | null };

/**
 * The single lead-creation service used by the web form, text assistant and voice assistant.
 * Validates, deduplicates, records notice/consent, scores, logs activity and emits events — all in one transaction.
 */
export async function createLead(raw: LeadInput | unknown, opts: CreateLeadOptions): Promise<CreateLeadResult> {
  const input = leadInputSchema.parse(raw);
  if (input.website) throw new ApiError("VALIDATION_ERROR", "Invalid submission.");

  const requestHash = sha256(JSON.stringify({ ...input, website: undefined }));
  const idemKey = opts.idempotencyKey ? `lead:${opts.idempotencyKey.slice(0, 100)}` : null;

  if (idemKey) {
    const prior = await prisma.idempotencyKey.findUnique({ where: { key: idemKey } });
    if (prior) return replay(prior.requestHash, requestHash, prior.resultRef);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      if (idemKey) await tx.idempotencyKey.create({ data: { key: idemKey, scope: "lead.create", requestHash } });

      const treatment =
        input.treatmentSlug && input.treatmentSlug !== "not-sure"
          ? await tx.treatment.findFirst({ where: { slug: input.treatmentSlug, active: true, approved: true } })
          : null;

      const email = input.email || null;
      const phone = input.phone || null;
      const now = new Date();

      const existing = await tx.lead.findFirst({
        where: {
          status: { notIn: ["WON", "LOST"] },
          createdAt: { gte: new Date(now.getTime() - DEDUPE_WINDOW_DAYS * 86400_000) },
          OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
        },
        orderBy: { createdAt: "desc" },
      });

      let lead: Lead;
      let duplicate = false;
      if (existing) {
        duplicate = true;
        lead = await tx.lead.update({
          where: { id: existing.id },
          data: {
            email: existing.email ?? email,
            phone: existing.phone ?? phone,
            treatmentId: treatment?.id ?? existing.treatmentId,
            treatmentNotSure: treatment ? false : existing.treatmentNotSure,
            preferredChannel: input.preferredChannel ?? existing.preferredChannel,
            preferredTime: input.preferredTime || existing.preferredTime,
            bookingTimeframe: input.bookingTimeframe || existing.bookingTimeframe,
            appointmentIntent: existing.appointmentIntent || input.appointmentIntent,
            nextStepRequested: input.nextStepRequested ?? existing.nextStepRequested,
            // A repeat inquiry from the same person answers our implicit "are you still interested?"
            answeredFollowUp: existing.status !== "NEW" ? true : existing.answeredFollowUp,
            lastActivityAt: now,
          },
        });
        await activity(tx, { leadId: lead.id, type: "lead.repeat_inquiry", data: { source: opts.source } });
      } else {
        lead = await tx.lead.create({
          data: {
            publicId: publicId(),
            fullName: input.fullName,
            email,
            phone,
            language: input.language,
            treatmentId: treatment?.id ?? null,
            treatmentNotSure: input.treatmentSlug === "not-sure",
            source: opts.source,
            sourceDetail: opts.sourceDetail,
            utmSource: input.utm?.source,
            utmMedium: input.utm?.medium,
            utmCampaign: input.utm?.campaign,
            preferredChannel: input.preferredChannel ?? null,
            preferredTime: input.preferredTime || null,
            bookingTimeframe: input.bookingTimeframe || null,
            appointmentIntent: input.appointmentIntent,
            nextStepRequested: input.nextStepRequested ?? null,
            ownerId: opts.ownerId ?? null,
          },
        });
        await activity(tx, { leadId: lead.id, actorId: opts.actorId ?? null, type: "lead.created", data: { source: opts.source } });
        await tx.attributionTouch.create({
          data: { leadId: lead.id, source: input.utm?.source ?? opts.source.toLowerCase(), medium: input.utm?.medium, campaign: input.utm?.campaign },
        });
      }

      if (opts.conversationId) {
        await tx.conversation.update({ where: { id: opts.conversationId }, data: { leadId: lead.id } });
        await refreshLeadInterest(tx, lead.id);
      }

      // Notice + permissions. Service contact = replying to this inquiry on the channels given.
      const channels: ContactChannel[] = [...(email ? (["EMAIL"] as const) : []), ...(phone ? (["PHONE"] as const) : [])];
      if (input.preferredChannel === "WHATSAPP" && phone) channels.push("WHATSAPP");
      const consentSource = opts.source.toLowerCase();
      await tx.consentRecord.createMany({
        data: channels.map((channel) => ({
          leadId: lead.id, channel, purpose: "SERVICE" as const, status: "GRANTED" as const,
          noticeVersion: PRIVACY_NOTICE_VERSION, source: consentSource, grantedAt: now, actorId: opts.actorId ?? null,
          evidence: opts.consentEvidence ?? "Privacy notice acknowledged on submission",
        })),
      });
      if (input.marketingOptIn) {
        await tx.consentRecord.createMany({
          data: channels.filter((c) => c !== "PHONE").map((channel) => ({
            leadId: lead.id, channel, purpose: "MARKETING" as const, status: "GRANTED" as const,
            noticeVersion: PRIVACY_NOTICE_VERSION, source: consentSource, grantedAt: now, actorId: opts.actorId ?? null,
            evidence: opts.actorId ? "Marketing permission given verbally to staff" : "Separate, unticked-by-default marketing opt-in checkbox",
          })),
        });
      }

      if (input.message) {
        // Free text may contain health details: kept on the restricted timeline only.
        await activity(tx, { leadId: lead.id, type: "inquiry.message", data: { text: input.message } });
      }

      let appointmentRequestId: string | null = null;
      if (input.appointmentIntent) {
        const req = await tx.appointmentRequest.create({
          data: {
            publicId: publicId("AR"),
            leadId: lead.id,
            preferredDate: input.preferredDate || null,
            preferredWindow: input.preferredTime || null,
            source: opts.source,
          },
        });
        appointmentRequestId = req.id;
        if (["NEW", "CONTACTED", "QUALIFIED", "NURTURE"].includes(lead.status)) {
          await tx.lead.update({ where: { id: lead.id }, data: { status: "APPOINTMENT_REQUESTED" } });
        }
        await activity(tx, { leadId: lead.id, type: "appointment.requested", data: { requestId: req.publicId } });
        await emitEvent(tx, { type: "appointment.requested", dedupeKey: `apptreq:${req.id}`, leadId: lead.id, payload: { requestId: req.id } });
      }

      await rescoreLead(tx, lead.id, duplicate ? "repeat inquiry" : "created");
      if (!duplicate) {
        await emitEvent(tx, { type: "lead.created", dedupeKey: `lead.created:${lead.id}`, leadId: lead.id, payload: { source: opts.source } });
      }
      if (idemKey) await tx.idempotencyKey.update({ where: { key: idemKey }, data: { resultRef: lead.publicId } });

      return { publicId: lead.publicId, leadId: lead.id, duplicate, appointmentRequestId };
    });
  } catch (err) {
    // Concurrent retry with the same idempotency key: the other request won.
    if (idemKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const prior = await prisma.idempotencyKey.findUnique({ where: { key: idemKey } });
      if (prior) return replay(prior.requestHash, requestHash, prior.resultRef);
    }
    throw err;
  }
}

async function replay(priorHash: string, hash: string, ref: string | null): Promise<CreateLeadResult> {
  if (priorHash !== hash) throw new ApiError("CONFLICT", "This request was already submitted with different details.");
  if (!ref) throw new ApiError("CONFLICT", "Your request is still being processed. Please wait a moment.");
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { publicId: ref },
    include: { appointmentRequests: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } },
  });
  return { publicId: lead.publicId, leadId: lead.id, duplicate: true, appointmentRequestId: lead.appointmentRequests[0]?.id ?? null };
}

// ───────────── Pipeline transitions ─────────────

/**
 * Allowed manual transitions. APPOINTMENT_CONFIRMED is reachable only through the
 * appointment-confirmation service so a request can never be mislabelled as booked.
 */
export const TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["CONTACTED", "QUALIFIED", "APPOINTMENT_REQUESTED", "LOST", "NURTURE"],
  CONTACTED: ["QUALIFIED", "APPOINTMENT_REQUESTED", "LOST", "NURTURE"],
  QUALIFIED: ["CONTACTED", "APPOINTMENT_REQUESTED", "LOST", "NURTURE"],
  APPOINTMENT_REQUESTED: ["CONTACTED", "QUALIFIED", "LOST", "NURTURE"],
  APPOINTMENT_CONFIRMED: ["VISITED", "LOST", "NURTURE"],
  VISITED: ["TREATMENT_PROPOSED", "WON", "LOST", "NURTURE"],
  TREATMENT_PROPOSED: ["WON", "LOST", "NURTURE"],
  WON: [],
  LOST: ["CONTACTED", "NURTURE"],
  NURTURE: ["CONTACTED", "QUALIFIED", "APPOINTMENT_REQUESTED", "LOST"],
};

export function canTransition(from: LeadStatus, to: LeadStatus) {
  return from === to || TRANSITIONS[from].includes(to);
}
