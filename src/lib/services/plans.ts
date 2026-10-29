import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ApiError } from "../errors";
import { publicId, randomToken } from "../ids";
import { activity, audit } from "../audit";
import { refreshLeadInterest } from "../interest";
import { readUploadFile, UPLOAD_KINDS, type UploadKindName } from "../uploads";
import { providerFor } from "../automation/providers";
import type { Staff } from "../auth/session";
import { createLead } from "./leads";
import { leadScope } from "./crm";

export const MAX_PLAN_FILES = 4;

export const planItemSchema = z.object({
  treatment: z.string().trim().min(1).max(120),
  area: z.string().trim().max(80).default(""),
  qty: z.number().int().min(1).max(32),
  unitMinor: z.number().int().min(0).max(100_000_000),
  currency: z.enum(["EUR", "GBP", "USD", "TRY"]),
});
export type PlanItem = z.infer<typeof planItemSchema>;

export const planUpdateSchema = z.object({
  items: z.array(planItemSchema).max(30),
  notes: z.string().trim().max(3000).optional().nullable(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

/** Totals per currency (a plan may mix currencies; we never convert). */
export function planTotals(items: PlanItem[]) {
  const totals: Record<string, number> = {};
  for (const i of items) totals[i.currency] = (totals[i.currency] ?? 0) + i.qty * i.unitMinor;
  return totals;
}

export function formatMoney(minor: number, currency: string, locale = "en-GB") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
}

/**
 * Public "free treatment plan" request: creates (or matches) the lead, stores the files against it,
 * opens a plan in REQUESTED state and gives the clinical team a task.
 * Files are validated before anything is written, so a bad file never leaves a half-made request.
 */
export async function requestPlan(input: {
  lead: unknown;
  country?: string | null;
  files: { kind: UploadKindName; file: File }[];
  idempotencyKey?: string | null;
}) {
  if (input.files.length === 0) throw new ApiError("VALIDATION_ERROR", "Please add at least one X-ray or photo.");
  if (input.files.length > MAX_PLAN_FILES) throw new ApiError("VALIDATION_ERROR", `Please send up to ${MAX_PLAN_FILES} files.`);
  const files = await Promise.all(input.files.map(async (f) => ({ kind: UPLOAD_KINDS.includes(f.kind) ? f.kind : "OTHER", ...(await readUploadFile(f.file)) })));

  const lead = await createLead(input.lead, { source: "WEB_FORM", sourceDetail: "free-plan", idempotencyKey: input.idempotencyKey });
  const leadRow = await prisma.lead.findUniqueOrThrow({ where: { id: lead.leadId }, select: { treatment: { select: { slug: true } } } });

  const plan = await prisma.$transaction(async (tx) => {
    const plan = await tx.treatmentPlan.create({
      data: {
        publicId: publicId("TP"),
        token: randomToken(24),
        leadId: lead.leadId,
        treatmentSlug: leadRow.treatment?.slug ?? null,
        country: input.country?.trim().slice(0, 60) || null,
      },
    });
    for (const f of files) {
      await tx.upload.create({ data: { leadId: lead.leadId, planId: plan.id, treatmentSlug: plan.treatmentSlug, consentAt: new Date(), ...f } });
    }
    await tx.task.create({
      data: {
        leadId: lead.leadId,
        title: `Prepare free treatment plan ${plan.publicId}`,
        description: `${files.length} file(s) sent. Review them and write the plan in CRM › Plans.`,
        dueAt: new Date(Date.now() + 24 * 3600_000),
        dedupeKey: `plan:${plan.id}`,
      },
    });
    await activity(tx, { leadId: lead.leadId, type: "plan.requested", data: { plan: plan.publicId, files: files.length } });
    return plan;
  });
  await refreshLeadInterest(prisma, lead.leadId);
  return { reference: lead.publicId, plan: plan.publicId };
}

async function scopedPlan(staff: Staff, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new ApiError("NOT_FOUND", "Plan not found.");
  const plan = await prisma.treatmentPlan.findFirst({ where: { id, lead: leadScope(staff) } });
  if (!plan) throw new ApiError("NOT_FOUND", "Plan not found.");
  return plan;
}

export async function updatePlan(staff: Staff, id: string, raw: unknown) {
  const plan = await scopedPlan(staff, id);
  if (plan.status === "SENT" || plan.status === "ACCEPTED") throw new ApiError("CONFLICT", "This plan was already sent. Create a new plan to change it.");
  const input = planUpdateSchema.parse(raw);
  const updated = await prisma.treatmentPlan.update({
    where: { id },
    data: {
      items: input.items as unknown as Prisma.InputJsonValue,
      notes: input.notes ?? null,
      validUntil: input.validUntil ? new Date(`${input.validUntil}T23:59:59Z`) : null,
      status: "DRAFT",
      preparedById: staff.id,
    },
  });
  return updated;
}

/** Marks the plan sent and emails the patient their private link (if they gave an email). */
export async function sendPlan(staff: Staff, id: string, baseUrl: string) {
  const plan = await scopedPlan(staff, id);
  if (plan.status !== "DRAFT") throw new ApiError("CONFLICT", plan.status === "REQUESTED" ? "Add at least one line and save before sending." : "This plan was already sent.");
  const items = z.array(planItemSchema).parse(plan.items);
  if (!items.length) throw new ApiError("VALIDATION_ERROR", "Add at least one line before sending.");
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: plan.leadId }, select: { id: true, fullName: true, email: true, language: true } });
  const link = `${baseUrl.replace(/\/$/, "")}/plan/${plan.token}`;

  await prisma.$transaction(async (tx) => {
    await tx.treatmentPlan.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
    await activity(tx, { leadId: lead.id, actorId: staff.id, type: "plan.sent", data: { plan: plan.publicId } });
    await audit(tx, { actorId: staff.id, action: "plan.sent", entityType: "TreatmentPlan", entityId: id });
    await tx.task.updateMany({ where: { dedupeKey: `plan:${id}`, status: "OPEN" }, data: { status: "DONE", completedAt: new Date() } });
  });

  let emailed = false;
  if (lead.email) {
    const tr = lead.language === "tr";
    try {
      const provider = providerFor("EMAIL");
      await provider.send({
        channel: "EMAIL",
        to: lead.email,
        locale: lead.language,
        subject: tr ? "Dent Flex tedavi planınız hazır" : "Your Dent Flex treatment plan is ready",
        body: tr
          ? `Merhaba ${lead.fullName.split(" ")[0]},\n\nDiş hekimimiz gönderdiğiniz görüntülere göre size özel bir tedavi planı hazırladı:\n${link}\n\nBu bir ön değerlendirmedir; kesin plan muayeneden sonra belirlenir.\n\nDent Flex`
          : `Hi ${lead.fullName.split(" ")[0]},\n\nOur dentist has prepared a personal treatment plan based on the images you sent:\n${link}\n\nThis is an estimate; your final plan is confirmed after an examination.\n\nDent Flex`,
      });
      // The development/console adapter only logs: never claim it reached the patient.
      emailed = !provider.name.endsWith("console");
    } catch (err) {
      console.warn(`[plans] email not sent for ${plan.publicId}: ${(err as Error).message}`);
    }
  }
  return { link, emailed };
}

/** Patient view by private link. Records the first view. */
export async function planByToken(token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const plan = await prisma.treatmentPlan.findUnique({
    where: { token },
    include: { lead: { select: { id: true, fullName: true, publicId: true, language: true } } },
  });
  if (!plan || (plan.status !== "SENT" && plan.status !== "ACCEPTED")) return null;
  if (!plan.viewedAt) {
    await prisma.treatmentPlan.update({ where: { id: plan.id }, data: { viewedAt: new Date() } });
    await activity(prisma, { leadId: plan.leadId, type: "plan.viewed", data: { plan: plan.publicId } });
  }
  return { ...plan, items: z.array(planItemSchema).catch([]).parse(plan.items) };
}

/** Patient tapped "Book a consultation" on their plan. */
export async function acceptPlan(token: string) {
  const plan = await prisma.treatmentPlan.findUnique({ where: { token } });
  if (!plan || (plan.status !== "SENT" && plan.status !== "ACCEPTED")) throw new ApiError("NOT_FOUND", "Plan not found.");
  if (plan.status === "SENT") {
    await prisma.$transaction(async (tx) => {
      await tx.treatmentPlan.update({ where: { id: plan.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      await activity(tx, { leadId: plan.leadId, type: "plan.accepted", data: { plan: plan.publicId } });
      await tx.task.upsert({
        where: { dedupeKey: `plan-accepted:${plan.id}` },
        update: {},
        create: { leadId: plan.leadId, title: `Patient wants to book from plan ${plan.publicId}`, dueAt: new Date(), dedupeKey: `plan-accepted:${plan.id}` },
      });
      await tx.lead.update({ where: { id: plan.leadId }, data: { appointmentIntent: true, lastActivityAt: new Date() } });
    });
  }
  return { ok: true };
}
