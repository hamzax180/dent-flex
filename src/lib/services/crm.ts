import { z } from "zod";
import { clinicDateTime } from "../validation/dates";
import { Prisma, type LeadStatus } from "@prisma/client";
import { prisma } from "../db";
import { ApiError } from "../errors";
import { activity, audit } from "../audit";
import { emitEvent } from "../jobs";
import { can, maskEmail, maskPhone } from "../auth/rbac";
import type { Staff } from "../auth/session";
import { canTransition, rescoreLead } from "./leads";
import { SCORE_EXPLAINER, type ScoreFactor } from "../scoring";

// ───────────── Access scoping ─────────────

/** Row-level scope: clinicians only see leads they own or have an appointment with. */
export function leadScope(staff: Staff): Prisma.LeadWhereInput {
  if (staff.role === "CLINICIAN") {
    return { OR: [{ ownerId: staff.id }, { appointments: { some: { clinicianId: staff.id } } }] };
  }
  return {};
}

async function loadScopedLead(staff: Staff, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new ApiError("NOT_FOUND", "Lead not found.");
  const lead = await prisma.lead.findFirst({ where: { AND: [{ id }, leadScope(staff)] } });
  // Same response for "missing" and "not yours" so IDs can't be probed.
  if (!lead) throw new ApiError("NOT_FOUND", "Lead not found.");
  return lead;
}

// ───────────── Inbox ─────────────

export const leadFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "APPOINTMENT_REQUESTED", "APPOINTMENT_CONFIRMED", "VISITED", "TREATMENT_PROPOSED", "WON", "LOST", "NURTURE"]).optional(),
  band: z.enum(["HOT", "WARM", "LOW_INFORMATION"]).optional(),
  source: z.enum(["WEB_FORM", "TEXT_ASSISTANT", "VOICE_ASSISTANT", "PHONE", "WALK_IN", "REFERRAL", "CAMPAIGN", "IMPORT", "OTHER"]).optional(),
  treatment: z.string().max(80).optional(),
  owner: z.string().max(40).optional(), // uuid | "me" | "none"
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  sort: z.enum(["newest", "oldest", "score"]).default("newest"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});
export type LeadFilters = z.infer<typeof leadFilterSchema>;

export async function listLeads(staff: Staff, raw: Record<string, string | undefined>) {
  const f = leadFilterSchema.parse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== "" && v != null)));
  const where: Prisma.LeadWhereInput = {
    AND: [
      leadScope(staff),
      f.status ? { status: f.status } : {},
      f.band ? { scoreBand: f.band } : {},
      f.source ? { source: f.source } : {},
      f.treatment ? { treatment: { slug: f.treatment } } : {},
      f.owner === "me" ? { ownerId: staff.id } : f.owner === "none" ? { ownerId: null } : f.owner ? { ownerId: f.owner } : {},
      f.from ? { createdAt: { gte: new Date(`${f.from}T00:00:00Z`) } } : {},
      f.to ? { createdAt: { lt: new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86400_000) } } : {},
      f.q
        ? {
            OR: [
              { fullName: { contains: f.q, mode: "insensitive" } },
              { publicId: { contains: f.q.toUpperCase() } },
              ...(can(staff.role, "leads:contact")
                ? [{ email: { contains: f.q.toLowerCase() } }, { phone: { contains: f.q.replace(/[^\d+]/g, "") || f.q } }]
                : []),
            ],
          }
        : {},
    ],
  };
  const orderBy: Prisma.LeadOrderByWithRelationInput[] =
    f.sort === "score" ? [{ scoreTotal: "desc" }, { createdAt: "desc" }] : [{ createdAt: f.sort === "oldest" ? "asc" : "desc" }];
  const [total, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where, orderBy, skip: (f.page - 1) * f.pageSize, take: f.pageSize,
      select: {
        id: true, publicId: true, fullName: true, email: true, phone: true, status: true, source: true, scoreTotal: true, scoreBand: true,
        scoreOverride: true, createdAt: true, language: true, treatment: { select: { nameEn: true } }, owner: { select: { name: true } },
      },
    }),
  ]);
  const showContact = can(staff.role, "leads:contact");
  return {
    filters: f,
    total,
    pages: Math.max(1, Math.ceil(total / f.pageSize)),
    rows: rows.map((r) => ({ ...r, email: showContact ? r.email : maskEmail(r.email), phone: showContact ? r.phone : maskPhone(r.phone) })),
  };
}

// ───────────── Detail ─────────────

export async function getLeadDetail(staff: Staff, id: string) {
  const base = await loadScopedLead(staff, id);
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: base.id },
    include: {
      treatment: { select: { slug: true, nameEn: true } },
      owner: { select: { id: true, name: true } },
      scores: { orderBy: { calculatedAt: "desc" }, take: 5 },
      consents: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      tasks: { orderBy: { dueAt: "asc" }, include: { owner: { select: { name: true } } } },
      appointmentRequests: { orderBy: { createdAt: "desc" } },
      appointments: { orderBy: { startAt: "desc" }, include: { clinician: { select: { name: true } } } },
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
      conversations: { orderBy: { startedAt: "desc" }, select: { id: true, channel: true, status: true, summary: true, startedAt: true, handoffReason: true } },
      enrollments: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, workflowId: true, status: true, stopReason: true, createdAt: true } },
      deliveries: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, channel: true, purpose: true, status: true, createdAt: true, failureCode: true } },
    },
  });
  const showContact = can(staff.role, "leads:contact");
  const suppressions = showContact
    ? await prisma.suppression.findMany({
        where: { OR: [{ scope: "GLOBAL", address: lead.id }, ...(lead.email ? [{ scope: "EMAIL" as const, address: lead.email }] : []), ...(lead.phone ? [{ scope: { in: ["WHATSAPP", "SMS", "PHONE"] as ("WHATSAPP" | "SMS" | "PHONE")[] }, address: lead.phone }] : [])] },
      })
    : [];
  return {
    ...lead,
    email: showContact ? lead.email : maskEmail(lead.email),
    phone: showContact ? lead.phone : maskPhone(lead.phone),
    // Free-text inquiry messages may contain health details; restrict to contact-permitted roles.
    activities: showContact ? lead.activities : lead.activities.filter((a) => a.type !== "inquiry.message"),
    latestFactors: ((lead.scores[0]?.factors ?? []) as unknown as ScoreFactor[]),
    scoreExplainer: SCORE_EXPLAINER,
    suppressions,
    canContact: showContact,
  };
}

// ───────────── Updates ─────────────

export const leadPatchSchema = z
  .object({
    status: leadFilterSchema.shape.status.unwrap().optional(),
    ownerId: z.string().uuid().nullable().optional(),
    preferredChannel: z.enum(["EMAIL", "PHONE", "WHATSAPP"]).nullable().optional(),
    preferredTime: z.string().trim().max(120).nullable().optional(),
    bookingTimeframe: z.string().trim().max(120).nullable().optional(),
    appointmentIntent: z.boolean().optional(),
    answeredFollowUp: z.boolean().optional(),
    nextStepRequested: z.enum(["PRICE_INFO", "CONSULTATION_DETAILS", "CALLBACK"]).nullable().optional(),
    treatmentSlug: z.string().max(80).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    humanHold: z.boolean().optional(),
    lostReason: z.string().trim().max(200).optional(),
  })
  .strict();

export async function updateLead(staff: Staff, id: string, raw: unknown, requestId?: string) {
  const patch = leadPatchSchema.parse(raw);
  const lead = await loadScopedLead(staff, id);
  if (patch.status === "APPOINTMENT_CONFIRMED") {
    throw new ApiError("INVALID_TRANSITION", "Confirm the appointment from its request so a real date and time is recorded.");
  }
  if (patch.status && !canTransition(lead.status, patch.status)) {
    throw new ApiError("INVALID_TRANSITION", `Cannot move a lead from ${lead.status} to ${patch.status}.`);
  }
  return prisma.$transaction(async (tx) => {
    let treatmentId: string | null | undefined;
    if (patch.treatmentSlug !== undefined) {
      treatmentId = patch.treatmentSlug ? (await tx.treatment.findUnique({ where: { slug: patch.treatmentSlug } }))?.id ?? null : null;
    }
    if (patch.ownerId) {
      const owner = await tx.staffUser.findFirst({ where: { id: patch.ownerId, active: true } });
      if (!owner) throw new ApiError("VALIDATION_ERROR", "Unknown staff member.", { ownerId: "Unknown staff member" });
    }
    const now = new Date();
    const firstContact = patch.status === "CONTACTED" && !lead.firstResponseAt;
    const updated = await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: patch.status, ownerId: patch.ownerId, preferredChannel: patch.preferredChannel, preferredTime: patch.preferredTime,
        bookingTimeframe: patch.bookingTimeframe, appointmentIntent: patch.appointmentIntent, answeredFollowUp: patch.answeredFollowUp,
        nextStepRequested: patch.nextStepRequested, tags: patch.tags, humanHold: patch.humanHold,
        ...(treatmentId !== undefined ? { treatmentId, treatmentNotSure: false } : {}),
        ...(firstContact ? { firstResponseAt: now } : {}),
        lastActivityAt: now,
      },
    });
    const changes = Object.keys(patch);
    await activity(tx, { leadId: lead.id, actorId: staff.id, type: "lead.updated", data: { fields: changes, ...(patch.status ? { from: lead.status, to: patch.status } : {}), ...(patch.lostReason ? { lostReason: patch.lostReason } : {}) } });
    await audit(tx, { actorId: staff.id, action: "lead.updated", entityType: "Lead", entityId: lead.id, data: { fields: changes }, requestId });
    if (patch.status && patch.status !== lead.status) {
      await emitEvent(tx, { type: "lead.status_changed", dedupeKey: `status:${lead.id}:${now.getTime()}`, leadId: lead.id, payload: { from: lead.status, to: patch.status } });
    }
    if (patch.ownerId && patch.ownerId !== lead.ownerId) {
      await emitEvent(tx, { type: "lead.assigned", dedupeKey: `assigned:${lead.id}:${now.getTime()}`, leadId: lead.id, payload: { ownerId: patch.ownerId } });
    }
    if (patch.humanHold === true && !lead.humanHold) {
      await emitEvent(tx, { type: "lead.human_hold", dedupeKey: `hold:${lead.id}:${now.getTime()}`, leadId: lead.id });
    }
    await rescoreLead(tx, lead.id, "staff update");
    return updated;
  });
}

export async function addNote(staff: Staff, leadId: string, body: string) {
  const text = z.string().trim().min(1, "Note cannot be empty.").max(4000).parse(body);
  const lead = await loadScopedLead(staff, leadId);
  return prisma.$transaction(async (tx) => {
    const note = await tx.note.create({ data: { leadId: lead.id, authorId: staff.id, body: text } });
    await activity(tx, { leadId: lead.id, actorId: staff.id, type: "note.added", data: { noteId: note.id } });
    await tx.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } });
    return note;
  });
}

export const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  dueAt: clinicDateTime,
  ownerId: z.string().uuid().nullable().optional(),
});

export async function createTask(staff: Staff, leadId: string | null, raw: unknown, requestId?: string) {
  const input = taskInputSchema.parse(raw);
  if (leadId) await loadScopedLead(staff, leadId);
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: { leadId, title: input.title, description: input.description, dueAt: input.dueAt, ownerId: input.ownerId ?? staff.id, createdById: staff.id },
    });
    if (leadId) await activity(tx, { leadId, actorId: staff.id, type: "task.created", data: { taskId: task.id, title: task.title } });
    await audit(tx, { actorId: staff.id, action: "task.created", entityType: "Task", entityId: task.id, requestId });
    return task;
  });
}

export async function updateTask(staff: Staff, id: string, raw: unknown) {
  const p = z.object({ status: z.enum(["OPEN", "DONE", "CANCELLED"]).optional(), dueAt: clinicDateTime.optional(), ownerId: z.string().uuid().nullable().optional() }).strict().parse(raw);
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new ApiError("NOT_FOUND", "Task not found.");
  if (task.leadId) await loadScopedLead(staff, task.leadId);
  return prisma.$transaction(async (tx) => {
    const t = await tx.task.update({ where: { id }, data: { ...p, completedAt: p.status === "DONE" ? new Date() : p.status ? null : undefined } });
    if (task.leadId && p.status) await activity(tx, { leadId: task.leadId, actorId: staff.id, type: `task.${p.status.toLowerCase()}`, data: { taskId: id, title: task.title } });
    return t;
  });
}

export async function overrideScore(staff: Staff, leadId: string, raw: unknown, requestId?: string) {
  const p = z.object({ total: z.number().int().min(0).max(100).nullable(), reason: z.string().trim().min(5, "Give a short reason.").max(300) }).parse(raw);
  const lead = await loadScopedLead(staff, leadId);
  return prisma.$transaction(async (tx) => {
    const latest = await tx.leadScore.findFirst({ where: { leadId }, orderBy: { calculatedAt: "desc" } });
    if (latest) await tx.leadScore.update({ where: { id: latest.id }, data: { overrideTotal: p.total, overrideReason: p.reason, overrideById: staff.id } });
    await tx.lead.update({ where: { id: lead.id }, data: { scoreOverride: p.total } });
    await activity(tx, { leadId, actorId: staff.id, type: "score.override", data: { total: p.total, reason: p.reason } });
    await audit(tx, { actorId: staff.id, action: "score.override", entityType: "Lead", entityId: leadId, data: { total: p.total, reason: p.reason }, requestId });
  });
}

// ───────────── Dashboard ─────────────

export async function overview(staff: Staff, from: Date, to: Date) {
  const scope = leadScope(staff);
  const inRange = { createdAt: { gte: from, lt: to } };
  const [newLeads, hot, requested, confirmed, overdue, byStatus, upcoming] = await Promise.all([
    prisma.lead.count({ where: { AND: [scope, inRange] } }),
    prisma.lead.count({ where: { AND: [scope, { scoreBand: "HOT", status: { notIn: ["WON", "LOST"] } }] } }),
    prisma.appointmentRequest.count({ where: { status: { in: ["REQUESTED", "IN_REVIEW"] }, lead: scope } }),
    prisma.appointment.count({ where: { status: "CONFIRMED", startAt: { gte: new Date() }, lead: scope } }),
    prisma.task.count({ where: { status: "OPEN", dueAt: { lt: new Date() }, ...(staff.role === "CLINICIAN" ? { ownerId: staff.id } : {}) } }),
    prisma.lead.groupBy({ by: ["status"], where: { AND: [scope] }, _count: true }),
    prisma.appointment.findMany({
      where: { status: "CONFIRMED", startAt: { gte: new Date() }, lead: scope }, orderBy: { startAt: "asc" }, take: 8,
      include: { lead: { select: { id: true, fullName: true, publicId: true } }, clinician: { select: { name: true } } },
    }),
  ]);
  return { newLeads, hot, requested, confirmed, overdue, byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count])) as Partial<Record<LeadStatus, number>>, upcoming };
}
