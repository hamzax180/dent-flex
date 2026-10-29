import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageStaff } from "@/lib/auth/page";
import { can } from "@/lib/auth/rbac";
import { getLeadDetail } from "@/lib/services/crm";
import { TRANSITIONS } from "@/lib/services/leads";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { Badge, Card, Empty, PageHeader, STATUS_LABEL, ScoreBadge, fmt } from "@/components/crm/ui";
import { ActionButton } from "@/components/crm/actions";
import { LeadExtras } from "./extras";
import { LeadEditor, NoteForm, TaskForm, OverrideForm, ConsentForm, ConfirmRequestForm } from "./forms";

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePageStaff("leads:read");
  const { id } = await params;
  let lead;
  try {
    lead = await getLeadDetail(staff, id);
  } catch (e) {
    if (e instanceof ApiError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const [staffList, treatments, clinicians] = await Promise.all([
    prisma.staffUser.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.treatment.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, nameEn: true } }),
    prisma.staffUser.findMany({ where: { active: true, role: "CLINICIAN" }, select: { id: true, name: true } }),
  ]);
  const write = can(staff.role, "leads:write");
  const latestConsent = new Map<string, (typeof lead.consents)[number]>();
  for (const c of lead.consents) if (!latestConsent.has(`${c.channel}:${c.purpose}`)) latestConsent.set(`${c.channel}:${c.purpose}`, c);

  return (
    <>
      <p className="mb-2 text-xs"><Link href="/crm/leads" className="text-forest underline">← Leads</Link></p>
      <PageHeader title={lead.fullName} sub={`${lead.publicId} · ${lead.source.replace(/_/g, " ").toLowerCase()} · created ${fmt(lead.createdAt)}`}>
        <ScoreBadge total={lead.scoreTotal} band={lead.scoreBand} override={lead.scoreOverride} />
        <Badge>{STATUS_LABEL[lead.status]}</Badge>
        {lead.humanHold && <Badge tone="warn">Human hold</Badge>}
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <Card title="Contact & preferences">
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-muted">Phone</dt><dd>{lead.phone ?? "—"}</dd>
              <dt className="text-muted">Email</dt><dd>{lead.email ?? "—"}</dd>
              <dt className="text-muted">Language</dt><dd>{lead.language.toUpperCase()}</dd>
              <dt className="text-muted">Interest</dt><dd>{lead.treatment?.nameEn ?? (lead.treatmentNotSure ? "Not sure" : "—")}</dd>
              <dt className="text-muted">Preferred channel</dt><dd>{lead.preferredChannel?.toLowerCase() ?? "—"}</dd>
              <dt className="text-muted">Preferred time</dt><dd>{lead.preferredTime ?? "—"}</dd>
              <dt className="text-muted">Timeframe</dt><dd>{lead.bookingTimeframe ?? "—"}</dd>
              <dt className="text-muted">Owner</dt><dd>{lead.owner?.name ?? "Unassigned"}</dd>
              <dt className="text-muted">Tags</dt><dd>{lead.tags.length ? lead.tags.map((t) => <Badge key={t}>{t}</Badge>) : "—"}</dd>
              <dt className="text-muted">Attribution</dt><dd>{[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ") || "—"}</dd>
            </dl>
            {!lead.canContact && <p className="mt-3 text-xs text-muted">Contact details are masked for your role.</p>}
          </Card>

          {write && (
            <Card title="Update lead">
              <LeadEditor
                leadId={lead.id}
                status={lead.status}
                allowed={TRANSITIONS[lead.status]}
                ownerId={lead.ownerId}
                staff={staffList}
                treatments={treatments}
                current={{
                  treatmentSlug: lead.treatment?.slug ?? "", preferredChannel: lead.preferredChannel ?? "", preferredTime: lead.preferredTime ?? "",
                  bookingTimeframe: lead.bookingTimeframe ?? "", appointmentIntent: lead.appointmentIntent, answeredFollowUp: lead.answeredFollowUp,
                  nextStepRequested: lead.nextStepRequested ?? "", tags: lead.tags.join(", "), humanHold: lead.humanHold,
                }}
              />
            </Card>
          )}

          <LeadExtras leadId={lead.id} />

          <Card title="Conversion-readiness score">
            <p className="mb-3 text-xs text-muted">{lead.scoreExplainer}</p>
            <ul className="space-y-1">
              {lead.latestFactors.map((f) => (
                <li key={f.key} className="grid grid-cols-[1fr_3.5rem] gap-2">
                  <span><span className="font-medium">{f.label}</span> <span className="text-muted">— {f.reason}</span></span>
                  <span className={`text-right tabular-nums ${f.points ? "text-forest" : "text-muted"}`}>{f.points}/{f.max}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Model {lead.scores[0]?.version} · calculated {fmt(lead.scores[0]?.calculatedAt)}</p>
            {lead.scores[0]?.overrideReason && <p className="mt-1 text-xs">Override {lead.scoreOverride}: “{lead.scores[0].overrideReason}”</p>}
            {can(staff.role, "leads:score_override") && <OverrideForm leadId={lead.id} />}
          </Card>

          <Card title="Contact permissions">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted"><th className="py-1">Channel</th><th>Purpose</th><th>Status</th><th>Notice</th><th>Source</th><th>When</th></tr></thead>
              <tbody>
                {[...latestConsent.values()].map((c) => (
                  <tr key={c.id} className="border-t border-forest/5">
                    <td className="py-1">{c.channel}</td><td>{c.purpose.toLowerCase()}</td>
                    <td><Badge tone={c.status === "GRANTED" ? "good" : "bad"}>{c.status.toLowerCase()}</Badge></td>
                    <td>{c.noticeVersion}</td><td>{c.source}</td><td>{fmt(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lead.suppressions.length > 0 && (
              <p className="mt-2 text-xs text-danger">Suppressed: {lead.suppressions.map((s) => `${s.scope.toLowerCase()} (${s.reason.toLowerCase()})`).join(", ")}</p>
            )}
            {can(staff.role, "consent:manage") && <ConsentForm leadId={lead.id} />}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Appointment requests & appointments">
            {lead.appointmentRequests.length === 0 && lead.appointments.length === 0 && <Empty>No appointment requested.</Empty>}
            <ul className="space-y-3">
              {lead.appointmentRequests.map((r) => (
                <li key={r.id} className="rounded-lg border border-forest/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Request {r.publicId}</span>
                    <Badge tone={r.status === "CONFIRMED" ? "good" : r.status === "REQUESTED" ? "warn" : "default"}>{r.status === "REQUESTED" ? "Requested — not confirmed" : r.status.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">Preferred: {[r.preferredDate, r.preferredWindow].filter(Boolean).join(", ") || "no preference"} · via {r.source.replace(/_/g, " ").toLowerCase()} · {fmt(r.createdAt)}</p>
                  {can(staff.role, "appointments:manage") && ["REQUESTED", "IN_REVIEW"].includes(r.status) && (
                    <div className="mt-2 flex flex-wrap items-start gap-2">
                      <ConfirmRequestForm requestId={r.id} clinicians={clinicians} />
                      <ActionButton url={`/api/admin/appointment-requests/${r.id}/decline`} label="Decline" variant="danger" confirm="Decline this request?" />
                    </div>
                  )}
                </li>
              ))}
              {lead.appointments.map((a) => (
                <li key={a.id} className="rounded-lg border border-forest/20 bg-sage-50/40 p-3">
                  <div className="flex justify-between"><span className="font-medium">Appointment {fmt(a.startAt)}</span><Badge tone="good">{a.status.toLowerCase()}</Badge></div>
                  <p className="text-xs text-muted">{a.clinician?.name ?? "No clinician assigned"} · revision {a.revision}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Tasks">
            {lead.tasks.length === 0 ? <Empty>No tasks.</Empty> : (
              <ul className="divide-y divide-forest/5">
                {lead.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className={t.status !== "OPEN" ? "text-muted line-through" : t.dueAt < new Date() ? "text-danger" : ""}>
                      {t.title} <span className="text-xs text-muted">· due {fmt(t.dueAt)} · {t.owner?.name ?? "unassigned"}</span>
                    </span>
                    {t.status === "OPEN" && can(staff.role, "tasks:write") && <ActionButton url={`/api/admin/tasks/${t.id}`} method="PATCH" body={{ status: "DONE" }} label="Done" />}
                  </li>
                ))}
              </ul>
            )}
            {can(staff.role, "tasks:write") && <TaskForm leadId={lead.id} staff={staffList} />}
          </Card>

          <Card title="Notes">
            {can(staff.role, "leads:note") && <NoteForm leadId={lead.id} />}
            <ul className="mt-3 space-y-2">
              {lead.notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-sage-50/50 p-2"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-xs text-muted">{n.author.name} · {fmt(n.createdAt)}</p></li>
              ))}
            </ul>
          </Card>

          <Card title="Conversations & messages">
            {lead.conversations.map((c) => (
              <p key={c.id} className="text-xs">{c.channel.toLowerCase()} · {c.status.toLowerCase().replace(/_/g, " ")}{c.handoffReason ? ` (${c.handoffReason.replace(/_/g, " ")})` : ""} · {fmt(c.startedAt)}{c.summary ? ` — ${c.summary}` : ""}</p>
            ))}
            {lead.deliveries.map((d) => (
              <p key={d.id} className="text-xs">{d.channel.toLowerCase()} {d.purpose.toLowerCase()} · <Badge tone={d.status === "SENT" || d.status === "DELIVERED" ? "good" : d.status === "QUEUED" ? "warn" : "bad"}>{d.status.toLowerCase()}</Badge> {d.failureCode ?? ""} · {fmt(d.createdAt)}</p>
            ))}
            {lead.enrollments.map((e) => (
              <p key={e.id} className="text-xs">Workflow run · {e.status.toLowerCase()}{e.stopReason ? ` (${e.stopReason})` : ""} · {fmt(e.createdAt)}</p>
            ))}
            {!lead.conversations.length && !lead.deliveries.length && !lead.enrollments.length && <Empty>No conversations or automated messages.</Empty>}
          </Card>

          <Card title="Activity timeline">
            <ol className="space-y-1.5 border-l border-forest/15 pl-4">
              {lead.activities.map((a) => {
                const d = (a.data ?? {}) as Record<string, unknown>;
                return (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-forest/50" aria-hidden />
                    <span className="font-medium">{a.type.replace(/[._]/g, " ")}</span>
                    {a.type === "inquiry.message" ? <span className="block whitespace-pre-wrap text-muted">“{String(d.text)}”</span> : d.to ? <span className="text-muted"> {String(d.from)} → {String(d.to)}</span> : null}
                    <span className="block text-xs text-muted">{fmt(a.createdAt)}</span>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
