import { z } from "zod";
import { prisma } from "../db";
import { sha256 } from "../ids";
import { getSetting } from "../settings";
import { getPublicTreatments, describePrice, getPriceComparisons, formatMoney } from "../services/pricing";
import { createLead } from "../services/leads";
import { activity } from "../audit";
import { PRIVACY_NOTICE_VERSION } from "../validation/lead";

/**
 * Allowlisted tool gateway. The model can only *propose* these calls; the server validates
 * arguments, checks the session context, applies idempotency and executes. No SQL, no other tables.
 */

export type ToolContext = {
  conversationId: string;
  language: "en" | "tr";
  /** Set only when the visitor ticked the in-widget contact/privacy checkbox. */
  contactConsent: boolean;
  channel: "TEXT_ASSISTANT" | "VOICE_ASSISTANT";
};

const leadArgs = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().max(254).optional(),
  phone: z.string().max(40).optional(),
  treatmentSlug: z.string().max(80).optional(),
  preferredChannel: z.enum(["EMAIL", "PHONE", "WHATSAPP"]).optional(),
  preferredTime: z.string().max(120).optional(),
  bookingTimeframe: z.string().max(120).optional(),
  nextStepRequested: z.enum(["PRICE_INFO", "CONSULTATION_DETAILS", "CALLBACK"]).optional(),
});

export const TOOL_SCHEMAS = {
  searchClinicFAQ: z.object({ query: z.string().min(1).max(200) }),
  getPublishedTreatmentPrices: z.object({ treatment: z.string().max(80).optional() }),
  getClinicInfo: z.object({}),
  getPriceComparison: z.object({ treatment: z.string().max(80).optional(), market: z.string().regex(/^[A-Za-z]{2}$/).optional() }),
  getWhyChooseUs: z.object({}),
  createLead: leadArgs,
  createAppointmentRequest: leadArgs.extend({ preferredDate: z.string().max(60).optional() }),
  handoffToStaff: z.object({ reason: z.enum(["clinical_question", "unknown_answer", "complaint", "visitor_request", "emergency", "other"]), note: z.string().max(300).optional() }),
  recordConversationSummary: z.object({ summary: z.string().min(5).max(600) }),
} as const;
export type ToolName = keyof typeof TOOL_SCHEMAS;

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  searchClinicFAQ: "Search the clinic's published FAQ. Use for any question about how the clinic works.",
  getPublishedTreatmentPrices: "Get published treatments and their currently published prices (may be none). Never state a price that is not returned here.",
  getClinicInfo: "Get the clinic's published address, phone, email and opening hours.",
  getPriceComparison:
    "Compare our published price with sourced reference prices in another country (market = ISO code like GB, US, DE). Use whenever price, cost, savings or 'why Turkey' comes up. Quote ONLY the numbers returned, mention the source, and say final prices follow an examination.",
  getWhyChooseUs: "Get the clinic-approved reasons to choose Dent Flex and the services included around treatment. Use these — never invent claims.",
  createLead: "Send the visitor's contact request to reception. Only after the visitor has given a name and phone or email AND ticked the consent box.",
  createAppointmentRequest: "Send an appointment REQUEST to reception (not a confirmed booking). Same requirements as createLead.",
  handoffToStaff: "Flag the conversation for a human (clinical questions, complaints, unknown answers, or when asked).",
  recordConversationSummary: "Save a short, non-clinical summary of the conversation for staff.",
};

function words(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2);
}

export async function executeTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<Record<string, unknown>> {
  if (!(name in TOOL_SCHEMAS)) return { error: "unknown_tool" };
  const parsed = TOOL_SCHEMAS[name as ToolName].safeParse(rawArgs ?? {});
  if (!parsed.success) return { error: "invalid_arguments", details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const args = parsed.data as Record<string, unknown>;

  switch (name as ToolName) {
    case "searchClinicFAQ": {
      const faqs = await prisma.faq.findMany({ where: { status: "PUBLISHED" } });
      const q = new Set(words(String(args.query)));
      const scored = faqs
        .map((f) => {
          const text = ctx.language === "tr" ? `${f.questionTr} ${f.answerTr}` : `${f.questionEn} ${f.answerEn}`;
          const hits = words(text).filter((w) => q.has(w)).length;
          return { hits, question: ctx.language === "tr" ? f.questionTr : f.questionEn, answer: ctx.language === "tr" ? f.answerTr : f.answerEn };
        })
        .filter((x) => x.hits > 0)
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 3);
      return scored.length ? { results: scored.map(({ question, answer }) => ({ question, answer })) } : { results: [], note: "No approved answer found. Offer handoff." };
    }
    case "getPublishedTreatmentPrices": {
      const all = await getPublicTreatments();
      const filter = typeof args.treatment === "string" ? args.treatment.toLowerCase() : null;
      const list = filter
        ? all.filter((t) => t.slug.includes(filter) || t.name.en.toLowerCase().includes(filter) || t.name.tr.toLowerCase().includes(filter))
        : all;
      return {
        treatments: list.map((t) => ({
          slug: t.slug,
          name: t.name[ctx.language],
          publishedPrice: t.price ? describePrice(t.price, ctx.language) : null,
          inclusions: t.price?.inclusions ?? null,
          exclusions: t.price?.exclusions ?? null,
        })),
        rule: "If publishedPrice is null, say the clinic has not published a price and offer a consultation. Final prices need an examination.",
      };
    }
    case "getClinicInfo": {
      const c = await getSetting("clinic_info");
      return { ...c, note: c.isPlaceholder ? "These details are placeholders not yet confirmed by the clinic; say so." : undefined };
    }
    case "getPriceComparison": {
      const list = await getPriceComparisons({ treatment: args.treatment as string | undefined, market: args.market as string | undefined });
      if (!list.length) {
        return {
          comparisons: [],
          rule: "No sourced comparison is published for this. Do not estimate. Offer the published price if any, or a free-of-pressure consultation request to get an exact quote.",
        };
      }
      return {
        comparisons: list.slice(0, 6).map((c) => ({
          treatment: c.treatment[ctx.language],
          market: c.marketLabel,
          ourPrice: c.clinic.isFrom ? `from ${formatMoney(c.clinic.minMinor, c.currency.split("/")[0], ctx.language)}` : `${formatMoney(c.clinic.minMinor, c.currency.split("/")[0], ctx.language)}–${formatMoney(c.clinic.maxMinor, c.currency.split("/")[0], ctx.language)}`,
          typicalThere: `${formatMoney(c.elsewhere.minMinor, c.currency.split("/").at(-1)!, ctx.language)}–${formatMoney(c.elsewhere.maxMinor, c.currency.split("/").at(-1)!, ctx.language)}`,
          savings: c.savings ? `${formatMoney(c.savings.minMinor, c.currency, ctx.language)}–${formatMoney(c.savings.maxMinor, c.currency, ctx.language)} (about ${c.savings.percentMid}% less)` : null,
          source: `${c.source.name}, checked ${c.source.checkedAt.slice(0, 10)}`,
        })),
        rule: "Quote these exact figures with the source. Savings are indicative; a final plan and price follow an examination. Travel and accommodation are not included unless listed in getWhyChooseUs.",
      };
    }
    case "getWhyChooseUs": {
      const s = await getSetting("sales_profile");
      return { reasons: s.sellingPoints, includedServices: s.includedServices, rule: "Use only these points. No superlatives like 'best' or 'cheapest' and no guarantees of results." };
    }
    case "createLead":
    case "createAppointmentRequest": {
      if (!ctx.contactConsent) {
        return { error: "consent_required", message: "Ask the visitor to tick the box agreeing that the clinic may contact them (privacy notice) before sending details." };
      }
      const a = args as z.infer<typeof leadArgs> & { preferredDate?: string };
      try {
        const res = await createLead(
          {
            fullName: a.fullName, email: a.email ?? "", phone: a.phone ?? "", language: ctx.language, treatmentSlug: a.treatmentSlug,
            preferredChannel: a.preferredChannel, preferredTime: a.preferredTime, bookingTimeframe: a.bookingTimeframe,
            nextStepRequested: a.nextStepRequested, preferredDate: a.preferredDate,
            appointmentIntent: name === "createAppointmentRequest", privacyNoticeAccepted: true, marketingOptIn: false,
          },
          {
            source: ctx.channel,
            conversationId: ctx.conversationId,
            // Same args in the same conversation never create a second lead.
            idempotencyKey: `assistant:${ctx.conversationId}:${sha256(JSON.stringify({ name, a }))}`,
          },
        );
        return {
          ok: true, reference: res.publicId,
          status: name === "createAppointmentRequest" ? "appointment_requested_not_confirmed" : "contact_request_sent",
          noticeVersion: PRIVACY_NOTICE_VERSION,
        };
      } catch (err) {
        const fields = (err as { fields?: Record<string, string> }).fields;
        return { error: "validation_failed", fields: fields ?? { _: "Could not save the request." } };
      }
    }
    case "handoffToStaff": {
      const conv = await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: "HANDOFF_REQUESTED", handoffReason: String(args.reason) },
      });
      if (conv.leadId) {
        await prisma.task.upsert({
          where: { dedupeKey: `handoff:${conv.id}` },
          update: {},
          create: { leadId: conv.leadId, title: `Assistant handoff: ${String(args.reason).replace(/_/g, " ")}`, dueAt: new Date(), dedupeKey: `handoff:${conv.id}` },
        });
        await activity(prisma, { leadId: conv.leadId, type: "assistant.handoff", data: { reason: String(args.reason) } });
      }
      return { ok: true, message: "A team member will follow up. The visitor can also use the contact form or call the clinic." };
    }
    case "recordConversationSummary": {
      const privacy = await getSetting("privacy");
      if (!privacy.storeTranscripts) return { ok: false, reason: "summary retention not enabled by the clinic" };
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { summary: String(args.summary), retentionUntil: new Date(Date.now() + privacy.transcriptRetentionDays * 86400_000) },
      });
      return { ok: true };
    }
  }
}

/** Deterministic pre-check: urgent symptoms bypass the model entirely and get clinic-approved text. */
const EMERGENCY = [
  /can'?t breathe|difficulty (breathing|swallowing)|trouble breathing/i,
  /heavy bleeding|won'?t stop bleeding|bleeding (a lot|heavily)/i,
  /swelling.*(eye|neck|throat|face)|(face|neck|jaw) (is )?swollen/i,
  /(knocked|broke|broken).*(tooth|teeth|jaw)|accident|trauma/i,
  /severe pain|unbearable pain|fever/i,
  /nefes (alam|darl)|yutkun/i,
  /kanama (durm|çok)|çok kan/i,
  /şişlik|şişti/i,
  /dayanılmaz ağrı|şiddetli ağrı|ateş/i,
  /\bacil\b|\bemergency\b|\burgent\b/i,
];
export function looksUrgent(text: string) {
  return EMERGENCY.some((re) => re.test(text));
}
