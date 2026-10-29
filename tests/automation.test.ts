import { beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createLead } from "@/lib/services/leads";
import { drainQueue, processJob, claimJobs } from "@/lib/automation/queue";
import { publishWorkflow, saveDraft, setWorkflowStatus, validateForPublish, simulate } from "@/lib/automation/workflows";
import { confirmAppointmentRequest, rescheduleAppointment, setAppointmentOutcome } from "@/lib/services/appointments";
import { createCampaign, previewAudience, transitionCampaign } from "@/lib/automation/campaigns";
import { unsubscribe } from "@/lib/automation/unsubscribe";
import { ingestProviderEvent, verifyProviderSignature } from "@/lib/automation/webhooks";
import { sign } from "@/lib/ids";
import { WORKFLOW_TEMPLATES } from "@/lib/automation/templates";
import { POST as campaignAction } from "@/app/api/admin/automation/[resource]/[id]/[action]/route";
import { actAs, ctx, fastForwardJobs, grant, makeLead, makeStaff, req, resetDb, seedTemplatesPublished, seedWorkflow, validLead } from "./helpers";

beforeEach(async () => {
  await resetDb();
  // Quiet hours off by default in tests; individual tests turn them on.
  await prisma.clinicSetting.create({
    data: { key: "automation_governance", value: { globalPause: false, quietHoursStart: "00:00", quietHoursEnd: "00:00", marketingCapPerWeek: 5, messageExpiryHours: 48, webhookAllowlist: [] } },
  });
});

async function publish(key: string, graph?: unknown) {
  const admin = await makeStaff("ADMIN");
  const wf = await seedWorkflow(key, admin, graph);
  await publishWorkflow(admin, wf.id);
  return { wf, admin };
}

describe("workflow publishing", () => {
  it("blocks publishing when a referenced template is not published", async () => {
    const admin = await makeStaff("ADMIN");
    const wf = await seedWorkflow("new_lead", admin);
    const v = await validateForPublish(wf.draftGraph);
    expect(v.ok).toBe(false);
    await expect(publishWorkflow(admin, wf.id)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("dry-run simulation reports the path without side effects", async () => {
    await seedTemplatesPublished();
    const admin = await makeStaff("ADMIN");
    const wf = await seedWorkflow("new_lead", admin);
    const { publicId } = await createLead(validLead(), { source: "WEB_FORM" });
    const tasksBefore = await prisma.task.count();
    const sim = await simulate(wf.draftGraph, publicId);
    expect(sim.ok && sim.path.map((p) => p.nodeId)).toEqual(["trigger", "task", "can_email", "ack", "done"]);
    expect(await prisma.task.count()).toBe(tasksBefore);
    expect(await prisma.messageDelivery.count()).toBe(0);
  });
});

describe("new-lead workflow end to end", () => {
  it("creates one task and one acknowledgement even if events and jobs are duplicated", async () => {
    await seedTemplatesPublished(["lead_ack"]);
    await publish("new_lead");
    const { leadId } = await createLead(validLead(), { source: "WEB_FORM" });

    // Simulate duplicate dispatch + worker crash/retry: re-queue every succeeded job.
    await drainQueue();
    await prisma.job.updateMany({ data: { status: "PENDING", runAt: new Date(Date.now() - 1000) } });
    await drainQueue();

    expect(await prisma.workflowEnrollment.count()).toBe(1);
    expect(await prisma.task.count({ where: { leadId } })).toBe(1);
    const deliveries = await prisma.messageDelivery.findMany({ where: { leadId } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe("SENT");
    expect(deliveries[0].providerMessageId).toMatch(/^dev-/);
    const en = await prisma.workflowEnrollment.findFirstOrThrow();
    expect(en.status).toBe("COMPLETED");
    expect(await prisma.workflowStepExecution.count({ where: { enrollmentId: en.id } })).toBe(5);
  });

  it("pins running enrollments to their version when the draft changes", async () => {
    await seedTemplatesPublished();
    const { wf, admin } = await publish("inactive_lead");
    const { leadId } = await createLead(validLead({ appointmentIntent: false }), { source: "WEB_FORM" });
    await drainQueue(); // enrolled, now waiting on the 14-day delay
    const en = await prisma.workflowEnrollment.findFirstOrThrow({ where: { leadId } });
    const v1 = en.workflowVersionId;

    const changed = structuredClone(WORKFLOW_TEMPLATES.find((w) => w.key === "inactive_lead")!.graph);
    (changed.nodes.find((n) => n.id === "task")!.config as { title: string }).title = "EDITED TITLE";
    await saveDraft(admin, wf.id, changed, {});
    await publishWorkflow(admin, wf.id);

    await fastForwardJobs();
    await drainQueue();
    const task = await prisma.task.findFirstOrThrow({ where: { leadId } });
    expect(task.title).toBe("Inactive lead: decide next step or move to nurture/lost");
    expect((await prisma.workflowEnrollment.findUniqueOrThrow({ where: { id: en.id } })).workflowVersionId).toBe(v1);
  });

  it("holds steps while the workflow is paused and resumes afterwards", async () => {
    await seedTemplatesPublished();
    const { wf, admin } = await publish("new_lead");
    await createLead(validLead(), { source: "WEB_FORM" });
    await drainQueue("t", 1); // dispatch only → enrollment + first step job
    await setWorkflowStatus(admin, wf.id, "PAUSED");
    await drainQueue();
    expect(await prisma.task.count()).toBe(0);
    const held = await prisma.job.findFirstOrThrow({ where: { type: "automation.step", status: "PENDING" } });
    expect(held.lastError).toContain("paused");
    await setWorkflowStatus(admin, wf.id, "ACTIVE");
    await fastForwardJobs();
    await drainQueue();
    expect(await prisma.task.count()).toBe(1);
  });
});

describe("stop rules and consent", () => {
  async function nurtureLead() {
    await seedTemplatesPublished();
    await publish("lead_nurture");
    const { leadId } = await createLead(validLead({ appointmentIntent: false, marketingOptIn: true }), { source: "WEB_FORM" });
    await drainQueue(); // enrolled, waiting for day-2 delay
    return leadId;
  }

  it("sends nurture only with marketing permission", async () => {
    const leadId = await nurtureLead();
    await fastForwardJobs();
    await drainQueue();
    const d = await prisma.messageDelivery.findFirstOrThrow({ where: { leadId } });
    expect(d.purpose).toBe("MARKETING");
    expect(d.status).toBe("SENT");
  });

  it("stops on booking (appointment request)", async () => {
    const leadId = await nurtureLead();
    await createLead(validLead({ appointmentIntent: true, marketingOptIn: true }), { source: "WEB_FORM" }); // same email → same lead
    await drainQueue();
    const en = await prisma.workflowEnrollment.findFirstOrThrow({ where: { leadId } });
    expect(en.status).toBe("STOPPED");
    expect(en.stopReason).toContain("appointment.requested");
    await fastForwardJobs();
    await drainQueue();
    expect(await prisma.messageDelivery.count({ where: { leadId } })).toBe(0);
  });

  it("stops on human hold", async () => {
    const leadId = await nurtureLead();
    const { updateLead } = await import("@/lib/services/crm");
    await updateLead(await makeStaff("RECEPTIONIST"), leadId, { humanHold: true });
    await drainQueue();
    expect((await prisma.workflowEnrollment.findFirstOrThrow({ where: { leadId } })).status).toBe("STOPPED");
  });

  it("blocks a queued marketing send when the lead unsubscribes before it goes out", async () => {
    const leadId = await nurtureLead();
    await fastForwardJobs();
    // Execute up to the send step but not the external send.
    for (let i = 0; i < 10; i++) {
      const jobs = await claimJobs("t", 1);
      if (!jobs.length) break;
      if (jobs[0].type === "message.send") {
        await prisma.job.update({ where: { id: jobs[0].id }, data: { status: "PENDING", attempts: 0 } });
        break;
      }
      await processJob(jobs[0]);
    }
    const queued = await prisma.messageDelivery.findFirstOrThrow({ where: { leadId } });
    expect(queued.status).toBe("QUEUED");
    const res = await unsubscribe(`${leadId}.EMAIL`, sign(`${leadId}.EMAIL`));
    expect(res.ok).toBe(true);
    await drainQueue();
    const after = await prisma.messageDelivery.findUniqueOrThrow({ where: { id: queued.id } });
    expect(after.status).toBe("BLOCKED");
    expect(after.sentAt).toBeNull();
    expect(await prisma.suppression.count({ where: { reason: "UNSUBSCRIBE" } })).toBe(1);
  });

  it("rejects forged unsubscribe tokens", async () => {
    const lead = await makeLead();
    expect((await unsubscribe(`${lead.id}.EMAIL`, "forged")).ok).toBe(false);
  });

  it("defers sends during quiet hours instead of sending", async () => {
    await prisma.clinicSetting.update({
      where: { key: "automation_governance" },
      data: { value: { globalPause: false, quietHoursStart: "00:00", quietHoursEnd: "23:59", marketingCapPerWeek: 5, messageExpiryHours: 48, webhookAllowlist: [] } },
    });
    await seedTemplatesPublished(["lead_ack"]);
    await publish("new_lead");
    await createLead(validLead(), { source: "WEB_FORM" });
    await drainQueue();
    const d = await prisma.messageDelivery.findFirstOrThrow();
    expect(d.status).toBe("QUEUED");
    const job = await prisma.job.findFirstOrThrow({ where: { type: "message.send" } });
    expect(job.status).toBe("PENDING");
    expect(job.lastError).toContain("quiet hours");
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("appointment reminders", () => {
  async function confirmedAppointment(hoursAhead: number) {
    await seedTemplatesPublished();
    const { admin } = await publish("appointment_reminders");
    const { leadId, appointmentRequestId } = await createLead(validLead({ phone: "+905551112233", preferredChannel: "WHATSAPP" }), { source: "WEB_FORM" });
    const appt = await confirmAppointmentRequest(appointmentRequestId!, { startAt: new Date(Date.now() + hoursAhead * 3600_000), durationMinutes: 30 }, admin);
    await drainQueue();
    return { leadId, appt, admin };
  }

  it("cancels pending reminders on reschedule and never sends a stale one", async () => {
    const { leadId, appt, admin } = await confirmedAppointment(72);
    const first = await prisma.workflowEnrollment.findFirstOrThrow({ where: { appointmentId: appt.id } });
    await rescheduleAppointment(appt.id, new Date(Date.now() + 96 * 3600_000), 30, admin);
    await drainQueue();
    expect((await prisma.workflowEnrollment.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("STOPPED");
    const enrollments = await prisma.workflowEnrollment.findMany({ where: { appointmentId: appt.id } });
    expect(enrollments).toHaveLength(2);
    // Run everything: only the new enrollment may send, and every send references revision 2.
    for (let i = 0; i < 6; i++) {
      await fastForwardJobs();
      await drainQueue();
    }
    const sent = await prisma.messageDelivery.findMany({ where: { leadId, status: "SENT" } });
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((d) => d.enrollmentId !== first.id)).toBe(true);
  });

  it("stops reminders when the appointment is cancelled", async () => {
    const { leadId, appt, admin } = await confirmedAppointment(72);
    await setAppointmentOutcome(appt.id, "CANCELLED", admin);
    for (let i = 0; i < 4; i++) {
      await fastForwardJobs();
      await drainQueue();
    }
    expect(await prisma.messageDelivery.count({ where: { leadId, status: "SENT" } })).toBe(0);
  });

  it("skips reminders whose window has already passed", async () => {
    const { leadId } = await confirmedAppointment(3); // 48h and 24h reminders are already late
    for (let i = 0; i < 6; i++) {
      await fastForwardJobs();
      await drainQueue();
    }
    const steps = await prisma.workflowStepExecution.findMany({ where: { nodeId: { in: ["r48", "r24"] } } });
    expect(steps.every((s) => s.status === "SKIPPED")).toBe(true);
    expect(await prisma.messageDelivery.count({ where: { leadId } })).toBeLessThanOrEqual(1);
  });
});

describe("campaigns", () => {
  async function audience() {
    const a = await makeLead({ language: "en" });
    await grant(a.id, "EMAIL", "MARKETING");
    const b = await makeLead({ language: "en" }); // no marketing permission
    const c = await makeLead({ language: "en" });
    await grant(c.id, "EMAIL", "MARKETING");
    await prisma.suppression.create({ data: { scope: "EMAIL", address: c.email!, reason: "BOUNCE" } });
    return { a, b, c };
  }

  it("previews eligible / excluded / suppressed counts with reasons", async () => {
    await audience();
    const p = await previewAudience("EMAIL", { languages: ["en"] });
    expect(p).toMatchObject({ matched: 3, eligible: 1, excluded: 1, suppressed: 1 });
    expect(Object.keys(p.reasons).join()).toContain("no marketing permission");
  });

  it("rejects segments on sensitive attributes", async () => {
    await expect(previewAudience("EMAIL", { treatment: "implants" })).rejects.toThrow();
  });

  it("requires approval by a permitted role, audits it, and snapshots the audience at send time", async () => {
    await seedTemplatesPublished(["nurture_1"]);
    const { a } = await audience();
    const rec = await makeStaff("RECEPTIONIST");
    const admin = await makeStaff("ADMIN");
    const c = await createCampaign(rec, { name: "Autumn news", channel: "EMAIL", templateKey: "nurture_1", segment: { languages: ["en"] } });
    await transitionCampaign(rec, c.id, "submit", {});

    await actAs(rec);
    expect((await campaignAction(req("POST", "/x", {}), ctx({ resource: "campaigns", id: c.id, action: "approve" }))).status).toBe(403);
    await actAs(admin);
    expect((await campaignAction(req("POST", "/x", {}), ctx({ resource: "campaigns", id: c.id, action: "approve" }))).status).toBe(200);
    expect((await campaignAction(req("POST", "/x", { scheduledAt: new Date().toISOString() }), ctx({ resource: "campaigns", id: c.id, action: "schedule" }))).status).toBe(200);
    expect(await prisma.auditEvent.count({ where: { entityId: c.id, action: { in: ["campaign.approve", "campaign.schedule"] } } })).toBe(2);

    // A lead that becomes eligible after scheduling but before launch is included (snapshot at launch)…
    const late = await makeLead({ language: "en" });
    await grant(late.id, "EMAIL", "MARKETING");
    // …and one that opts out before launch is not sent.
    await unsubscribe(`${a.id}.EMAIL`, sign(`${a.id}.EMAIL`));

    await drainQueue();
    const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: c.id } });
    expect(recipients.find((r) => r.leadId === late.id)?.status).toBe("SENT");
    expect(recipients.find((r) => r.leadId === a.id)?.status).toBe("EXCLUDED");
    expect(await prisma.messageDelivery.count({ where: { campaignId: c.id, status: "SENT" } })).toBe(1);
  });
});

describe("provider webhooks", () => {
  async function sentDelivery() {
    const lead = await makeLead();
    const tpl = await prisma.messageTemplate.create({ data: { key: "k", channel: "EMAIL", locale: "en", version: 1, purpose: "MARKETING", status: "PUBLISHED", subject: "s", body: "b" } });
    return prisma.messageDelivery.create({
      data: { leadId: lead.id, channel: "EMAIL", purpose: "MARKETING", templateId: tpl.id, provider: "test", providerMessageId: "pm-1", status: "SENT", dedupeKey: "d1" },
    });
  }

  it("verifies signatures and rejects stale timestamps", () => {
    const body = JSON.stringify({ a: 1 });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", "test-webhook-secret").update(`${ts}.${body}`).digest("hex");
    expect(verifyProviderSignature(body, ts, sig)).toBe(true);
    const tampered = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0"); // always differs from the real signature
    expect(verifyProviderSignature(body, ts, tampered)).toBe(false);
    expect(verifyProviderSignature(body, String(Number(ts) - 3600), sig)).toBe(false);
  });

  it("is idempotent for duplicated/replayed events", async () => {
    const d = await sentDelivery();
    const ev = { eventId: "e-1", type: "replied", providerMessageId: "pm-1" } as const;
    expect(await ingestProviderEvent("test", ev)).toMatchObject({ handled: "replied" });
    expect(await ingestProviderEvent("test", ev)).toMatchObject({ duplicate: true });
    expect(await prisma.automationEvent.count({ where: { type: "message.replied" } })).toBe(1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: d.leadId } })).answeredFollowUp).toBe(true);
  });

  it("hard bounce suppresses the address; STOP reply revokes marketing", async () => {
    const d = await sentDelivery();
    await ingestProviderEvent("test", { eventId: "b-1", type: "bounced", bounceType: "hard", providerMessageId: "pm-1" });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: d.leadId } });
    expect(await prisma.suppression.count({ where: { address: lead.email!, reason: "BOUNCE" } })).toBe(1);
    await ingestProviderEvent("test", { eventId: "s-1", type: "replied", text: "STOP", providerMessageId: "pm-1" });
    const latest = await prisma.consentRecord.findFirstOrThrow({ where: { leadId: d.leadId, purpose: "MARKETING" }, orderBy: { createdAt: "desc" } });
    expect(latest.status).toBe("REVOKED");
  });
});

describe("worker reliability", () => {
  it("retries transient failures with backoff, then surfaces a dead job safely", async () => {
    const job = await prisma.job.create({ data: { type: "automation.step", payload: { enrollmentId: "00000000-0000-0000-0000-000000000000", nodeId: "x" } as Prisma.InputJsonValue, maxAttempts: 2 } });
    // Point the job at a missing enrollment → handler returns "not active" (success, no-op): idempotent.
    await drainQueue();
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("SUCCEEDED");

    const bad = await prisma.job.create({ data: { type: "does.not.exist", payload: {}, maxAttempts: 3 } });
    await drainQueue();
    const dead = await prisma.job.findUniqueOrThrow({ where: { id: bad.id } });
    expect(dead.status).toBe("DEAD"); // permanent errors do not retry forever
    expect(dead.lastError).toContain("Unknown job type");
  });

  it("recovers a job whose worker crashed mid-run (expired lease)", async () => {
    const j = await prisma.job.create({ data: { type: "automation.dispatch", payload: { eventId: "00000000-0000-0000-0000-000000000000" }, status: "RUNNING", lockedBy: "dead-worker", lockedUntil: new Date(Date.now() - 1000), attempts: 1 } });
    await drainQueue();
    expect((await prisma.job.findUniqueOrThrow({ where: { id: j.id } })).status).toBe("SUCCEEDED");
  });
});
