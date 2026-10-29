import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ApiError } from "../errors";
import { audit } from "../audit";
import type { Staff } from "../auth/session";
import { validateGraph, templateKeysUsed, nextNodes, type GraphIssue, type WorkflowGraph } from "./graph";
import { checkEligibility } from "./consent";

/** Schema + structure + database checks (referenced templates must be published with the right purpose). */
export async function validateForPublish(raw: unknown): Promise<{ ok: true; graph: WorkflowGraph } | { ok: false; issues: GraphIssue[] }> {
  const v = validateGraph(raw);
  if (!v.ok) return v;
  const issues: GraphIssue[] = [];
  for (const t of templateKeysUsed(v.graph)) {
    const tpl = await prisma.messageTemplate.findFirst({ where: { key: t.key, channel: t.channel, status: "PUBLISHED" } });
    if (!tpl) issues.push({ message: `Template "${t.key}" (${t.channel}) is not published.` });
    else if (tpl.purpose !== t.purpose) issues.push({ message: `Template "${t.key}" is a ${tpl.purpose.toLowerCase()} template but the node sends ${t.purpose.toLowerCase()}.` });
  }
  return issues.length ? { ok: false, issues } : v;
}

export async function saveDraft(staff: Staff, id: string, rawGraph: unknown, meta: { name?: string; description?: string }) {
  const v = validateGraph(rawGraph); // drafts may be invalid, but must at least be JSON-shaped
  const wf = await prisma.workflow.update({
    where: { id },
    data: { draftGraph: rawGraph as Prisma.InputJsonValue, ...(meta.name ? { name: meta.name } : {}), ...(meta.description !== undefined ? { description: meta.description } : {}) },
  });
  await audit(prisma, { actorId: staff.id, action: "workflow.draft_saved", entityType: "Workflow", entityId: id });
  return { workflow: wf, validation: v.ok ? { ok: true as const } : v };
}

/**
 * Dry run against a real lead without side effects: evaluates conditions read-only and
 * reports the path, delays and actions that *would* run. Nothing is sent or written.
 */
export async function simulate(rawGraph: unknown, leadPublicId: string) {
  const v = validateGraph(rawGraph);
  if (!v.ok) return { ok: false as const, issues: v.issues };
  const lead = await prisma.lead.findUnique({ where: { publicId: leadPublicId } });
  if (!lead) throw new ApiError("NOT_FOUND", "No lead with that reference.");
  const g = v.graph;
  const path: { nodeId: string; type: string; outcome: string }[] = [];
  let current: string | undefined = g.nodes.find((n) => n.type === "trigger")!.id;
  let guard = 0;
  while (current && guard++ < 100) {
    const node = g.nodes.find((n) => n.id === current)!;
    let outcome = "";
    let branch: boolean | undefined;
    if (node.type === "trigger") outcome = `on ${node.config.events.join(" / ")}`;
    if (node.type === "delay") outcome = node.config.mode === "duration" ? `wait ${node.config.minutes} min` : node.config.mode === "clinic_time" ? `wait until day +${node.config.afterDays} at ${node.config.time} clinic time` : `until ${node.config.minutes} min before appointment`;
    if (node.type === "condition") {
      const c = node.config;
      if (c.check === "has_permission") {
        const e = await checkEligibility(prisma, lead, c.channel, c.purpose);
        branch = e.ok;
        outcome = e.ok ? "eligible" : e.reason;
      } else if (c.check === "lead_status_in") {
        branch = c.statuses.includes(lead.status);
        outcome = lead.status;
      } else if (c.check === "score_band_in") {
        branch = c.bands.includes(lead.scoreBand);
        outcome = lead.scoreBand;
      } else {
        branch = true;
        outcome = `${c.check}: assumed true in simulation`;
      }
      outcome = `${branch ? "TRUE" : "FALSE"} — ${outcome}`;
    }
    if (node.type === "action") outcome = `would ${node.config.action.replace(/_/g, " ")}${"templateKey" in node.config ? ` "${node.config.templateKey}"` : ""}`;
    if (node.type === "exit") outcome = `exit: ${node.config.reason}`;
    path.push({ nodeId: node.id, type: node.type, outcome });
    current = nextNodes(g, node.id, node.type === "condition" ? branch : undefined)[0];
  }
  return { ok: true as const, lead: lead.publicId, path };
}

export async function publishWorkflow(staff: Staff, id: string, requestId?: string) {
  const wf = await prisma.workflow.findUnique({ where: { id } });
  if (!wf) throw new ApiError("NOT_FOUND", "Workflow not found.");
  const v = await validateForPublish(wf.draftGraph);
  if (!v.ok) throw new ApiError("VALIDATION_ERROR", "Fix the workflow before publishing.", Object.fromEntries(v.issues.map((i, n) => [i.nodeId ?? `issue${n}`, i.message])));
  return prisma.$transaction(async (tx) => {
    const last = await tx.workflowVersion.findFirst({ where: { workflowId: id }, orderBy: { version: "desc" } });
    const trigger = v.graph.nodes.find((n) => n.type === "trigger")!;
    const version = await tx.workflowVersion.create({
      data: {
        workflowId: id, version: (last?.version ?? 0) + 1, graph: v.graph as unknown as Prisma.InputJsonValue,
        triggerTypes: trigger.type === "trigger" ? trigger.config.events : [], publishedById: staff.id,
      },
    });
    // Running enrollments stay pinned to the version they started on.
    await tx.workflow.update({ where: { id }, data: { activeVersionId: version.id, status: "ACTIVE" } });
    await audit(tx, { actorId: staff.id, action: "workflow.published", entityType: "Workflow", entityId: id, data: { version: version.version }, requestId });
    return version;
  });
}

export async function setWorkflowStatus(staff: Staff, id: string, status: "PAUSED" | "ACTIVE" | "ARCHIVED", requestId?: string) {
  const wf = await prisma.workflow.findUnique({ where: { id } });
  if (!wf) throw new ApiError("NOT_FOUND", "Workflow not found.");
  if (status === "ACTIVE" && !wf.activeVersionId) throw new ApiError("INVALID_TRANSITION", "Publish a version first.");
  await prisma.workflow.update({ where: { id }, data: { status } });
  await audit(prisma, { actorId: staff.id, action: `workflow.${status.toLowerCase()}`, entityType: "Workflow", entityId: id, requestId });
}

export async function stopEnrollment(staff: Staff, enrollmentId: string, requestId?: string) {
  await prisma.$transaction(async (tx) => {
    const en = await tx.workflowEnrollment.findUnique({ where: { id: enrollmentId } });
    if (!en) throw new ApiError("NOT_FOUND", "Enrollment not found.");
    if (en.status !== "ACTIVE") throw new ApiError("INVALID_TRANSITION", "Enrollment is not active.");
    await tx.workflowEnrollment.update({ where: { id: en.id }, data: { status: "STOPPED", stopReason: `stopped by ${staff.name}` } });
    await tx.job.updateMany({ where: { status: { in: ["PENDING", "FAILED"] }, dedupeKey: { startsWith: `step:${en.id}:` } }, data: { status: "CANCELLED" } });
    await tx.messageDelivery.updateMany({ where: { enrollmentId: en.id, status: "QUEUED" }, data: { status: "BLOCKED", failureCode: "enrollment_stopped" } });
    await audit(tx, { actorId: staff.id, action: "enrollment.stopped", entityType: "WorkflowEnrollment", entityId: en.id, requestId });
  });
}

/** Controlled retry of a dead job: one more attempt, audited. */
export async function retryDeadJob(staff: Staff, jobId: string, requestId?: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new ApiError("NOT_FOUND", "Job not found.");
  if (job.status !== "DEAD") throw new ApiError("INVALID_TRANSITION", "Only failed (dead) jobs can be retried.");
  await prisma.$transaction(async (tx) => {
    await tx.job.update({ where: { id: jobId }, data: { status: "PENDING", runAt: new Date(), maxAttempts: job.attempts + 1, lastError: null } });
    const p = job.payload as Record<string, string>;
    if (job.type === "automation.step") {
      await tx.workflowEnrollment.updateMany({ where: { id: p.enrollmentId, status: "FAILED" }, data: { status: "ACTIVE", stopReason: null } });
    }
    if (job.type === "message.send") {
      await tx.messageDelivery.updateMany({ where: { id: p.deliveryId, status: "FAILED", failureCode: "retries_exhausted" }, data: { status: "QUEUED", failureCode: null } });
    }
    await audit(tx, { actorId: staff.id, action: "job.retried", entityType: "Job", entityId: jobId, requestId });
  });
}
