import { Prisma, type Job, type Lead, type WorkflowEnrollment } from "@prisma/client";
import { createHmac } from "node:crypto";
import { prisma, type Tx } from "../db";
import { enqueueJob } from "../jobs";
import { activity } from "../audit";
import { getSetting, clinicTimezone } from "../settings";
import { sign } from "../ids";
import { canTransition } from "../services/leads";
import { graphSchema, nextNodes, type WorkflowGraph, type WorkflowNode } from "./graph";
import { checkEligibility } from "./consent";
import { clinicTimeAfter, nextAllowedSendTime, inQuietHours } from "./time";
import { providerFor, renderTemplate, PermanentSendError } from "./providers";

/** Thrown by a handler to put its job back in the queue for later without counting a failed attempt. */
export class RescheduleJob extends Error {
  constructor(public runAt: Date, public why: string) {
    super(why);
  }
}

const PAUSE_RETRY_MS = 15 * 60_000;

// ───────────────────────────── Dispatch ─────────────────────────────

type EnrollmentContext = { appointmentRevision?: number; appointmentStartAt?: string };

async function stopEnrollments(tx: Tx, ids: string[], status: "STOPPED" | "COMPLETED", reason: string, goal = false) {
  if (!ids.length) return;
  await tx.workflowEnrollment.updateMany({
    where: { id: { in: ids } },
    data: { status, stopReason: reason, ...(goal ? { goalReachedAt: new Date() } : {}) },
  });
  for (const id of ids) {
    await tx.job.updateMany({ where: { status: { in: ["PENDING", "FAILED"] }, dedupeKey: { startsWith: `step:${id}:` } }, data: { status: "CANCELLED" } });
  }
  await tx.messageDelivery.updateMany({ where: { enrollmentId: { in: ids }, status: "QUEUED" }, data: { status: "BLOCKED", failureCode: "enrollment_stopped" } });
}

function triggerMatches(node: WorkflowNode, eventType: string, lead: Lead | null, payload: Record<string, unknown>): boolean {
  if (node.type !== "trigger" || !node.config.events.includes(eventType as never)) return false;
  const f = node.config.filters;
  if (!f) return true;
  if (f.sources?.length && (!lead || !f.sources.includes(lead.source))) return false;
  if (f.scoreBands?.length && (!lead || !f.scoreBands.includes(lead.scoreBand))) return false;
  if (f.toStatuses?.length && !f.toStatuses.includes(payload.to as never)) return false;
  return true;
}

/** Route one business event: apply stop/goal rules to running enrollments, then start matching workflows. */
export async function dispatchEvent(eventId: string) {
  await prisma.$transaction(async (tx) => {
    const event = await tx.automationEvent.findUnique({ where: { id: eventId } });
    if (!event || event.processedAt) return;
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const lead = event.leadId ? await tx.lead.findUnique({ where: { id: event.leadId } }) : null;

    // 1. Stop / goal rules on active enrollments for this lead.
    if (lead) {
      const active = await tx.workflowEnrollment.findMany({
        where: { leadId: lead.id, status: "ACTIVE" },
        include: { workflowVersion: { select: { graph: true } } },
      });
      for (const en of active) {
        const g = en.workflowVersion.graph as unknown as WorkflowGraph;
        if (event.type === "lead.status_changed" && g.settings.goalStatuses?.includes(payload.to as never)) {
          await stopEnrollments(tx, [en.id], "COMPLETED", `goal reached (${String(payload.to)})`, true);
        } else if (g.settings.stopOn?.includes(event.type as never) && en.triggerEventId !== event.id) {
          await stopEnrollments(tx, [en.id], "STOPPED", `stopped by ${event.type}`);
        }
      }
    }

    // 2. Start workflows whose published version listens for this event.
    const versions = await tx.workflowVersion.findMany({
      where: { triggerTypes: { has: event.type }, workflow: { status: "ACTIVE" } },
      include: { workflow: { select: { id: true, activeVersionId: true } } },
    });
    for (const v of versions) {
      if (v.workflow.activeVersionId !== v.id) continue;
      const graph = v.graph as unknown as WorkflowGraph;
      const trigger = graph.nodes.find((n) => n.type === "trigger")!;
      if (!triggerMatches(trigger, event.type, lead, payload)) continue;
      if (!graph.settings.allowReenrollment && lead) {
        const running = await tx.workflowEnrollment.findFirst({
          where: { workflowId: v.workflowId, leadId: lead.id, status: "ACTIVE", ...(event.appointmentId ? { appointmentId: event.appointmentId } : {}) },
        });
        if (running) continue;
      }
      const context: EnrollmentContext = {};
      if (typeof payload.revision === "number") context.appointmentRevision = payload.revision;
      if (typeof payload.startAt === "string") context.appointmentStartAt = payload.startAt;
      const enrollment = await tx.workflowEnrollment.upsert({
        where: { dedupeKey: `${v.workflowId}:${event.id}` },
        update: {},
        create: {
          workflowVersionId: v.id, workflowId: v.workflowId, leadId: event.leadId, appointmentId: event.appointmentId,
          triggerEventId: event.id, dedupeKey: `${v.workflowId}:${event.id}`, context: context as Prisma.InputJsonValue,
        },
      });
      await enqueueJob(tx, "automation.step", { enrollmentId: enrollment.id, nodeId: trigger.id }, { dedupeKey: `step:${enrollment.id}:${trigger.id}` });
    }
    await tx.automationEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
  });
}

// ───────────────────────────── Step execution ─────────────────────────────

type StepPayload = { enrollmentId: string; nodeId: string; late?: boolean };

async function evaluateCondition(tx: Tx, node: Extract<WorkflowNode, { type: "condition" }>, en: WorkflowEnrollment, lead: Lead): Promise<{ result: boolean; detail: string }> {
  const c = node.config;
  switch (c.check) {
    case "has_permission": {
      const e = await checkEligibility(tx, lead, c.channel, c.purpose);
      return { result: e.ok, detail: e.ok ? "eligible" : e.reason };
    }
    case "lead_status_in":
      return { result: c.statuses.includes(lead.status), detail: lead.status };
    case "score_band_in":
      return { result: c.bands.includes(lead.scoreBand), detail: lead.scoreBand };
    case "has_tag":
      return { result: lead.tags.includes(c.tag), detail: lead.tags.join(",") };
    case "language_is":
      return { result: lead.language === c.language, detail: lead.language };
    case "source_in":
      return { result: c.sources.includes(lead.source), detail: lead.source };
    case "owner_assigned":
      return { result: Boolean(lead.ownerId), detail: lead.ownerId ? "assigned" : "unassigned" };
    case "contact_valid":
      return { result: Boolean(c.channel === "EMAIL" ? lead.email : lead.phone), detail: c.channel };
    case "appointment_status_is": {
      if (!en.appointmentId) return { result: false, detail: "no appointment" };
      const appt = await tx.appointment.findUnique({ where: { id: en.appointmentId } });
      const ctx = (en.context ?? {}) as EnrollmentContext;
      const fresh = appt && (ctx.appointmentRevision == null || appt.revision === ctx.appointmentRevision);
      return { result: Boolean(fresh && appt!.status === c.status), detail: appt ? `${appt.status} r${appt.revision}` : "missing" };
    }
    case "replied_since_enrollment": {
      const n = await tx.messageDelivery.count({ where: { leadId: lead.id, repliedAt: { gte: en.createdAt } } });
      return { result: n > 0, detail: `${n} replies` };
    }
    case "human_responded":
      return { result: Boolean(lead.firstResponseAt), detail: lead.firstResponseAt ? "yes" : "no" };
  }
}

async function computeDelay(tx: Tx, node: Extract<WorkflowNode, { type: "delay" }>, en: WorkflowEnrollment): Promise<Date> {
  const c = node.config;
  const now = new Date();
  if (c.mode === "duration") return new Date(now.getTime() + c.minutes * 60_000);
  if (c.mode === "clinic_time") return clinicTimeAfter(now, c.afterDays, c.time, clinicTimezone());
  const appt = en.appointmentId ? await tx.appointment.findUnique({ where: { id: en.appointmentId } }) : null;
  if (!appt) return now;
  return new Date(appt.startAt.getTime() - c.minutes * 60_000);
}

export async function executeStep(payload: StepPayload) {
  const en = await prisma.workflowEnrollment.findUnique({
    where: { id: payload.enrollmentId },
    include: { workflowVersion: true },
  });
  if (!en || en.status !== "ACTIVE") return { skipped: "enrollment not active" };

  const [gov, workflow] = await Promise.all([getSetting("automation_governance"), prisma.workflow.findUnique({ where: { id: en.workflowId } })]);
  if (gov.globalPause) throw new RescheduleJob(new Date(Date.now() + PAUSE_RETRY_MS), "automation globally paused");
  if (workflow?.status === "PAUSED") throw new RescheduleJob(new Date(Date.now() + PAUSE_RETRY_MS), "workflow paused");

  const graph = graphSchema.parse(en.workflowVersion.graph);
  const node = graph.nodes.find((n) => n.id === payload.nodeId);
  if (!node) throw new PermanentSendError("unknown_node", `Node ${payload.nodeId} not in version`);

  // Webhooks do network I/O, so they run before (outside) the transaction and are idempotent by header.
  if (node.type === "action" && node.config.action === "webhook" && !payload.late) {
    const done = await prisma.workflowStepExecution.findUnique({ where: { enrollmentId_nodeId: { enrollmentId: en.id, nodeId: node.id } } });
    if (done?.status !== "SUCCEEDED") await callWebhook(node.config.url, en, gov.webhookAllowlist);
  }

  return prisma.$transaction(async (tx) => {
    const prior = await tx.workflowStepExecution.findUnique({ where: { enrollmentId_nodeId: { enrollmentId: en.id, nodeId: node.id } } });
    if (prior && ["SUCCEEDED", "SKIPPED"].includes(prior.status)) {
      // Already done (worker retry after commit): only make sure the follow-up job exists.
      await scheduleNext(tx, en, graph, node, prior.result as Record<string, unknown>);
      return { replay: true };
    }
    const lead = en.leadId ? await tx.lead.findUnique({ where: { id: en.leadId } }) : null;
    if (!lead) {
      await stopEnrollments(tx, [en.id], "STOPPED", "lead deleted");
      return { stopped: true };
    }

    let status: "SUCCEEDED" | "SKIPPED" = "SUCCEEDED";
    let result: Record<string, unknown> = {};
    let late = payload.late ?? false;

    switch (node.type) {
      case "trigger":
        break;
      case "condition": {
        const r = await evaluateCondition(tx, node, en, lead);
        result = { branch: r.result, detail: r.detail };
        break;
      }
      case "delay": {
        const at = await computeDelay(tx, node, en);
        late = node.config.mode === "before_appointment" && at.getTime() < Date.now() - 5 * 60_000;
        result = { resumeAt: at.toISOString(), late };
        break;
      }
      case "action": {
        if (late) {
          status = "SKIPPED";
          result = { reason: "send window already passed" };
          break;
        }
        result = await runAction(tx, node, en, lead);
        if (result.skipped) status = "SKIPPED";
        break;
      }
      case "exit":
        await tx.workflowEnrollment.update({ where: { id: en.id }, data: { status: "COMPLETED", stopReason: node.config.reason } });
        break;
    }
    result.late = late;

    await tx.workflowStepExecution.upsert({
      where: { enrollmentId_nodeId: { enrollmentId: en.id, nodeId: node.id } },
      update: { status, result: result as Prisma.InputJsonValue, attempts: { increment: 1 }, finishedAt: new Date(), error: null },
      create: { enrollmentId: en.id, nodeId: node.id, nodeType: node.type, status, result: result as Prisma.InputJsonValue, attempts: 1, finishedAt: new Date() },
    });
    if (node.type !== "exit") await scheduleNext(tx, en, graph, node, result);
    return result;
  });
}

async function scheduleNext(tx: Tx, en: WorkflowEnrollment, graph: WorkflowGraph, node: WorkflowNode, result: Record<string, unknown>) {
  if (node.type === "exit") return;
  const targets = node.type === "condition" ? nextNodes(graph, node.id, Boolean(result.branch)) : nextNodes(graph, node.id);
  if (!targets.length) {
    await tx.workflowEnrollment.updateMany({ where: { id: en.id, status: "ACTIVE" }, data: { status: "COMPLETED", stopReason: "end of path" } });
    return;
  }
  const runAt = node.type === "delay" && typeof result.resumeAt === "string" ? new Date(result.resumeAt) : new Date();
  for (const to of targets) {
    await enqueueJob(tx, "automation.step", { enrollmentId: en.id, nodeId: to, late: Boolean(result.late) }, { runAt, dedupeKey: `step:${en.id}:${to}` });
  }
}

async function runAction(tx: Tx, node: Extract<WorkflowNode, { type: "action" }>, en: WorkflowEnrollment, lead: Lead): Promise<Record<string, unknown>> {
  const c = node.config;
  const key = `wf:${en.id}:${node.id}`;
  switch (c.action) {
    case "send_message": {
      const elig = await checkEligibility(tx, lead, c.channel, c.purpose);
      if (!elig.ok) return { skipped: true, reason: elig.reason };
      const template = await findPublishedTemplate(tx, c.templateKey, c.channel, lead.language);
      if (!template) return { skipped: true, reason: `no published ${c.channel.toLowerCase()} template "${c.templateKey}"` };
      const delivery = await tx.messageDelivery.upsert({
        where: { dedupeKey: key },
        update: {},
        create: { leadId: lead.id, channel: c.channel, purpose: c.purpose, templateId: template.id, provider: providerFor(c.channel).name, enrollmentId: en.id, dedupeKey: key },
      });
      await enqueueJob(tx, "message.send", { deliveryId: delivery.id }, { dedupeKey: `send:${delivery.id}` });
      return { deliveryId: delivery.id, templateVersion: template.version };
    }
    case "create_task": {
      const task = await tx.task.upsert({
        where: { dedupeKey: key },
        update: {},
        create: { leadId: lead.id, title: c.title, dueAt: new Date(Date.now() + c.dueInMinutes * 60_000), ownerId: c.assignTo === "owner" ? lead.ownerId : null, dedupeKey: key },
      });
      await activity(tx, { leadId: lead.id, type: "automation.task_created", data: { taskId: task.id, workflowId: en.workflowId } });
      return { taskId: task.id };
    }
    case "add_tag":
    case "remove_tag": {
      const tags = c.action === "add_tag" ? Array.from(new Set([...lead.tags, c.tag])) : lead.tags.filter((t) => t !== c.tag);
      await tx.lead.update({ where: { id: lead.id }, data: { tags } });
      return { tags };
    }
    case "set_status": {
      if (!canTransition(lead.status, c.status)) return { skipped: true, reason: `transition ${lead.status}→${c.status} not allowed` };
      await tx.lead.update({ where: { id: lead.id }, data: { status: c.status } });
      await activity(tx, { leadId: lead.id, type: "lead.updated", data: { from: lead.status, to: c.status, by: "automation" } });
      return { status: c.status };
    }
    case "notify_staff": {
      const task = await tx.task.upsert({
        where: { dedupeKey: key },
        update: {},
        create: { leadId: lead.id, title: c.message, dueAt: new Date(), ownerId: lead.ownerId, dedupeKey: key },
      });
      return { taskId: task.id };
    }
    case "webhook":
      return { called: true };
    case "mark_goal":
      await tx.workflowEnrollment.update({ where: { id: en.id }, data: { goalReachedAt: new Date() } });
      return { goal: true };
  }
}

export async function findPublishedTemplate(tx: Tx, key: string, channel: "EMAIL" | "WHATSAPP" | "PHONE" | "SMS", language: string) {
  for (const locale of [language, "en"]) {
    const t = await tx.messageTemplate.findFirst({ where: { key, channel, locale, status: "PUBLISHED" }, orderBy: { version: "desc" } });
    if (t) return t;
  }
  return null;
}

async function callWebhook(url: string, en: WorkflowEnrollment, allowlist: string[]) {
  if (!allowlist.some((prefix) => url.startsWith(prefix))) throw new PermanentSendError("webhook_not_allowlisted", "Webhook URL is not on the allowlist.");
  // Minimal payload: no contact details.
  const body = JSON.stringify({ workflowId: en.workflowId, enrollmentId: en.id, at: new Date().toISOString() });
  const sig = createHmac("sha256", process.env.APP_SECRET ?? "").update(body).digest("hex");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-dentflex-signature": sig, "idempotency-key": `${en.id}` },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status >= 500 || res.status === 429) throw new Error(`webhook transient ${res.status}`);
  if (!res.ok) throw new PermanentSendError("webhook_rejected", `Webhook returned ${res.status}`);
}

// ───────────────────────────── Sending ─────────────────────────────

export function unsubscribeUrl(leadId: string, channel: string) {
  const token = `${leadId}.${channel}`;
  return `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/unsubscribe?t=${encodeURIComponent(token)}&s=${sign(token)}`;
}

/** Final gate before an external send. Re-checks everything, because state may have changed since queueing. */
export async function sendDelivery(deliveryId: string) {
  const d = await prisma.messageDelivery.findUnique({ where: { id: deliveryId }, include: { lead: true } });
  if (!d || d.status !== "QUEUED") return { skipped: "not queued" };
  const gov = await getSetting("automation_governance");
  const tz = clinicTimezone();
  const block = async (code: string) => {
    await prisma.messageDelivery.update({ where: { id: d.id }, data: { status: "BLOCKED", failureCode: code } });
    if (d.campaignId) await prisma.campaignRecipient.updateMany({ where: { campaignId: d.campaignId, leadId: d.leadId }, data: { status: "BLOCKED", reason: code } });
    return { blocked: code };
  };

  if (gov.globalPause) throw new RescheduleJob(new Date(Date.now() + PAUSE_RETRY_MS), "automation globally paused");
  if (d.campaignId) {
    const c = await prisma.campaign.findUnique({ where: { id: d.campaignId } });
    if (!c || c.status === "CANCELLED") return block("campaign_cancelled");
    if (c.status === "PAUSED") throw new RescheduleJob(new Date(Date.now() + PAUSE_RETRY_MS), "campaign paused");
  }
  if (d.enrollmentId) {
    const en = await prisma.workflowEnrollment.findUnique({ where: { id: d.enrollmentId } });
    if (!en || en.status === "STOPPED" || en.status === "FAILED") return block("enrollment_stopped");
    if (en.appointmentId) {
      const appt = await prisma.appointment.findUnique({ where: { id: en.appointmentId } });
      const ctx = (en.context ?? {}) as EnrollmentContext;
      if (!appt || appt.status !== "CONFIRMED" || (ctx.appointmentRevision != null && appt.revision !== ctx.appointmentRevision)) return block("stale_appointment");
    }
  }
  if (Date.now() - d.createdAt.getTime() > gov.messageExpiryHours * 3600_000) return block("expired");
  const elig = await checkEligibility(prisma, d.lead, d.channel, d.purpose);
  if (!elig.ok) return block(`ineligible:${elig.reason}`);
  if (inQuietHours(new Date(), gov.quietHoursStart, gov.quietHoursEnd, tz)) {
    throw new RescheduleJob(nextAllowedSendTime(new Date(), gov.quietHoursStart, gov.quietHoursEnd, tz), "quiet hours");
  }
  if (d.purpose === "MARKETING") {
    const recent = await prisma.messageDelivery.count({
      where: { leadId: d.leadId, purpose: "MARKETING", status: { in: ["SENT", "DELIVERED"] }, sentAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
    });
    if (recent >= gov.marketingCapPerWeek) return block("contact_cap");
  }

  const template = await prisma.messageTemplate.findUnique({ where: { id: d.templateId } });
  if (!template || template.status !== "PUBLISHED") return block("template_unpublished");
  const lead = d.lead;
  let appointmentTime = "";
  if (d.enrollmentId) {
    const en = await prisma.workflowEnrollment.findUnique({ where: { id: d.enrollmentId } });
    const appt = en?.appointmentId ? await prisma.appointment.findUnique({ where: { id: en.appointmentId } }) : null;
    if (appt) appointmentTime = new Intl.DateTimeFormat(lead.language === "tr" ? "tr-TR" : "en-GB", { dateStyle: "full", timeStyle: "short", timeZone: tz }).format(appt.startAt);
  }
  const vars = { firstName: lead.fullName.split(/\s+/)[0] ?? "", reference: lead.publicId, appointmentTime };
  let body = renderTemplate(template.body, vars);
  const headers: Record<string, string> = {};
  if (d.channel === "EMAIL" && d.purpose === "MARKETING") {
    const url = unsubscribeUrl(lead.id, "EMAIL");
    body += `\n\n—\n${lead.language === "tr" ? "Abonelikten çık" : "Unsubscribe"}: ${url}`;
    headers["List-Unsubscribe"] = `<${url}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  if (d.channel === "WHATSAPP" && d.purpose === "MARKETING") body += lead.language === "tr" ? "\n\nAlmak istemiyorsanız DUR yazın." : "\n\nReply STOP to opt out.";

  try {
    const res = await providerFor(d.channel).send({
      channel: d.channel, to: d.channel === "EMAIL" ? lead.email! : lead.phone!, subject: template.subject ? renderTemplate(template.subject, vars) : undefined,
      body, providerTemplateName: template.providerTemplateName ?? undefined, locale: template.locale, headers,
    });
    await prisma.messageDelivery.update({ where: { id: d.id }, data: { status: "SENT", providerMessageId: res.providerMessageId, sentAt: new Date() } });
    if (d.campaignId) await prisma.campaignRecipient.updateMany({ where: { campaignId: d.campaignId, leadId: d.leadId }, data: { status: "SENT" } });
    await activity(prisma, { leadId: lead.id, type: "message.sent", data: { channel: d.channel, purpose: d.purpose, templateKey: template.key } });
    return { sent: res.providerMessageId };
  } catch (err) {
    if (err instanceof PermanentSendError) {
      await prisma.messageDelivery.update({ where: { id: d.id }, data: { status: "FAILED", failureCode: err.code } });
      if (d.campaignId) await prisma.campaignRecipient.updateMany({ where: { campaignId: d.campaignId, leadId: d.leadId }, data: { status: "FAILED", reason: err.code } });
      return { failed: err.code };
    }
    throw err; // transient: worker retries with backoff
  }
}

// ───────────────────────────── Job routing ─────────────────────────────

export async function runJob(job: Pick<Job, "type" | "payload">) {
  const p = job.payload as Record<string, unknown>;
  switch (job.type) {
    case "automation.dispatch":
      return dispatchEvent(String(p.eventId));
    case "automation.step":
      return executeStep(p as unknown as StepPayload);
    case "message.send":
      return sendDelivery(String(p.deliveryId));
    case "campaign.launch": {
      const { launchCampaign } = await import("./campaigns");
      return launchCampaign(String(p.campaignId));
    }
    default:
      throw new PermanentSendError("unknown_job", `Unknown job type ${job.type}`);
  }
}

/** Called when a job exhausts retries: surface the failure on the enrollment/delivery. */
export async function onJobDead(job: Pick<Job, "type" | "payload" | "lastError">) {
  const p = job.payload as Record<string, unknown>;
  if (job.type === "automation.step") {
    const enrollmentId = String(p.enrollmentId), nodeId = String(p.nodeId);
    const en = await prisma.workflowEnrollment.findUnique({ where: { id: enrollmentId }, include: { workflowVersion: true } });
    if (!en) return;
    const node = graphSchema.parse(en.workflowVersion.graph).nodes.find((n) => n.id === nodeId);
    await prisma.workflowStepExecution.upsert({
      where: { enrollmentId_nodeId: { enrollmentId, nodeId } },
      update: { status: "FAILED", error: job.lastError?.slice(0, 500), finishedAt: new Date() },
      create: { enrollmentId, nodeId, nodeType: node?.type ?? "unknown", status: "FAILED", error: job.lastError?.slice(0, 500), finishedAt: new Date() },
    });
    await prisma.workflowEnrollment.update({ where: { id: enrollmentId }, data: { status: "FAILED", stopReason: `step ${nodeId} failed` } });
  }
  if (job.type === "message.send") {
    await prisma.messageDelivery.updateMany({ where: { id: String(p.deliveryId), status: "QUEUED" }, data: { status: "FAILED", failureCode: "retries_exhausted" } });
  }
}
