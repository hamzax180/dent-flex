import type { Prisma } from "@prisma/client";
import type { Db, Tx } from "./db";

export type JobType =
  | "automation.dispatch" // route a business event to matching workflows
  | "automation.step" // execute one workflow node for an enrollment
  | "message.send" // perform an external send for a MessageDelivery
  | "campaign.launch"; // snapshot recipients and queue deliveries

/**
 * Enqueue a durable job. Pass the business transaction so the job row commits
 * atomically with the change that caused it (transactional outbox).
 * A dedupeKey makes the enqueue idempotent.
 */
export async function enqueueJob(
  db: Db,
  type: JobType,
  payload: Prisma.InputJsonValue,
  opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {},
) {
  if (opts.dedupeKey) {
    const existing = await db.job.findUnique({ where: { dedupeKey: opts.dedupeKey } });
    if (existing) return existing;
  }
  return db.job.create({
    data: { type, payload, runAt: opts.runAt ?? new Date(), dedupeKey: opts.dedupeKey, maxAttempts: opts.maxAttempts ?? 5 },
  });
}

export type AutomationEventType =
  | "lead.created"
  | "lead.assigned"
  | "lead.status_changed"
  | "lead.score_changed"
  | "lead.human_hold"
  | "appointment.requested"
  | "appointment.confirmed"
  | "appointment.rescheduled"
  | "appointment.cancelled"
  | "appointment.completed"
  | "appointment.no_show"
  | "task.overdue"
  | "message.delivered"
  | "message.bounced"
  | "message.clicked"
  | "message.replied"
  | "message.unsubscribed"
  | "workflow.manual_start"
  | "booking.abandoned";

export const AUTOMATION_EVENT_TYPES: AutomationEventType[] = [
  "lead.created", "lead.assigned", "lead.status_changed", "lead.score_changed", "lead.human_hold",
  "appointment.requested", "appointment.confirmed", "appointment.rescheduled", "appointment.cancelled",
  "appointment.completed", "appointment.no_show", "task.overdue", "message.delivered", "message.bounced",
  "message.clicked", "message.replied", "message.unsubscribed", "workflow.manual_start", "booking.abandoned",
];

/**
 * Record a business event and its dispatch job inside the caller's transaction.
 * A crash after commit cannot lose the event; a retry with the same dedupeKey is a no-op.
 */
export async function emitEvent(
  tx: Tx,
  e: { type: AutomationEventType; dedupeKey: string; leadId?: string | null; appointmentId?: string | null; payload?: Prisma.InputJsonValue },
) {
  const existing = await tx.automationEvent.findUnique({ where: { dedupeKey: e.dedupeKey } });
  if (existing) return existing;
  const event = await tx.automationEvent.create({
    data: { type: e.type, dedupeKey: e.dedupeKey, leadId: e.leadId ?? null, appointmentId: e.appointmentId ?? null, payload: e.payload },
  });
  await enqueueJob(tx, "automation.dispatch", { eventId: event.id }, { dedupeKey: `dispatch:${event.id}` });
  return event;
}
