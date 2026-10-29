import { prisma } from "../db";

/**
 * Reporting with explicit definitions. Attribution here is a simple last-touch model
 * within a 30-day window: it describes association, not causality.
 */
export const DEFINITIONS = {
  uniqueLeads: "Distinct lead records created in the period (repeat inquiries from the same contact within 30 days are merged).",
  conversion: "Leads created in the period that now have at least one CONFIRMED/COMPLETED appointment (requests alone do not count).",
  firstResponse: "Median minutes from lead creation to the first human status change to Contacted. Automatic acknowledgements are excluded.",
  attribution: "Last-touch: a confirmed appointment is attributed to the campaign of the most recent message clicked or replied to within 30 days before confirmation. A model, not proof of causality.",
  opens: "Email opens are not tracked or used: they are unreliable and not proof of intent.",
};

export async function leadReport(from: Date, to: Date) {
  const leads = await prisma.lead.findMany({
    where: { createdAt: { gte: from, lt: to } },
    select: { id: true, source: true, scoreBand: true, createdAt: true, firstResponseAt: true, appointments: { where: { status: { in: ["CONFIRMED", "COMPLETED"] } }, select: { id: true } } },
  });
  const bySource: Record<string, { leads: number; confirmed: number }> = {};
  const byBand: Record<string, { leads: number; confirmed: number }> = {};
  const responseMinutes: number[] = [];
  for (const l of leads) {
    const ok = l.appointments.length > 0;
    for (const [bucket, key] of [[bySource, l.source], [byBand, l.scoreBand]] as const) {
      bucket[key] ??= { leads: 0, confirmed: 0 };
      bucket[key].leads++;
      if (ok) bucket[key].confirmed++;
    }
    if (l.firstResponseAt) responseMinutes.push((l.firstResponseAt.getTime() - l.createdAt.getTime()) / 60_000);
  }
  responseMinutes.sort((a, b) => a - b);
  const median = responseMinutes.length ? responseMinutes[Math.floor(responseMinutes.length / 2)] : null;
  const confirmed = leads.filter((l) => l.appointments.length).length;
  return { total: leads.length, confirmed, conversionRate: leads.length ? confirmed / leads.length : 0, medianFirstResponseMinutes: median, bySource, byBand };
}

export async function automationReport(from: Date, to: Date) {
  const range = { createdAt: { gte: from, lt: to } };
  const [deliveries, enrollments, deadJobs, campaigns, usage] = await Promise.all([
    prisma.messageDelivery.groupBy({ by: ["status", "channel", "purpose"], where: range, _count: true }),
    prisma.workflowEnrollment.groupBy({ by: ["workflowId", "status"], where: range, _count: true }),
    prisma.job.count({ where: { status: "DEAD" } }),
    prisma.campaign.findMany({
      where: range,
      select: { id: true, name: true, status: true, channel: true, recipients: { select: { status: true } } },
    }),
    prisma.aiUsageEvent.groupBy({ by: ["kind"], where: range, _sum: { estCostMicroUsd: true, inputTokens: true, outputTokens: true, durationSeconds: true }, _count: true }),
  ]);
  const unsubscribes = await prisma.consentRecord.count({ where: { status: "REVOKED", purpose: "MARKETING", createdAt: { gte: from, lt: to } } });
  const replied = await prisma.messageDelivery.count({ where: { ...range, repliedAt: { not: null } } });
  const clicked = await prisma.messageDelivery.count({ where: { ...range, clickedAt: { not: null } } });
  const goals = await prisma.workflowEnrollment.count({ where: { ...range, goalReachedAt: { not: null } } });
  const workflows = await prisma.workflow.findMany({ select: { id: true, name: true } });
  const names = Object.fromEntries(workflows.map((w) => [w.id, w.name]));
  return {
    deliveries, replied, clicked, unsubscribes, goals, deadJobs,
    enrollments: enrollments.map((e) => ({ workflow: names[e.workflowId] ?? e.workflowId, status: e.status, count: e._count })),
    campaigns: campaigns.map((c) => ({
      id: c.id, name: c.name, status: c.status, channel: c.channel,
      counts: c.recipients.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {}),
    })),
    usage: usage.map((u) => ({ kind: u.kind, events: u._count, estUsd: (u._sum.estCostMicroUsd ?? 0) / 1e6, inputTokens: u._sum.inputTokens ?? 0, outputTokens: u._sum.outputTokens ?? 0, seconds: u._sum.durationSeconds ?? 0 })),
  };
}
