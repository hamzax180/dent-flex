import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageStaff } from "@/lib/auth/page";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { Badge, Card, Empty, PageHeader, fmt } from "@/components/crm/ui";
import { ActionButton } from "@/components/crm/actions";
import { WorkflowBuilder } from "./builder";

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePageStaff("automation:read");
  const { id } = await params;
  const wf = await prisma.workflow.findUnique({ where: { id }, include: { versions: { orderBy: { version: "desc" } } } }).catch(() => null);
  if (!wf) notFound();
  const manage = can(staff.role, "automation:manage");
  const enrollments = await prisma.workflowEnrollment.findMany({
    where: { workflowId: id }, orderBy: { createdAt: "desc" }, take: 30,
    include: { lead: { select: { id: true, fullName: true } }, workflowVersion: { select: { version: true } }, steps: { orderBy: { startedAt: "asc" } } },
  });
  const templates = await prisma.messageTemplate.findMany({ where: { status: "PUBLISHED" }, select: { key: true, channel: true, purpose: true, locale: true } });
  return (
    <>
      <p className="mb-2 text-xs"><Link href="/crm/automation" className="text-forest underline">← Automation</Link></p>
      <PageHeader title={wf.name} sub={wf.description ?? undefined}>
        <Badge tone={wf.status === "ACTIVE" ? "good" : wf.status === "PAUSED" ? "warn" : "default"}>{wf.status.toLowerCase()}</Badge>
        {wf.versions[0] && <Badge>live v{wf.versions.find((v) => v.id === wf.activeVersionId)?.version}</Badge>}
        {manage && wf.status === "ACTIVE" && <ActionButton url={`/api/admin/automation/workflows/${id}/pause`} label="Pause" />}
        {manage && wf.status === "PAUSED" && <ActionButton url={`/api/admin/automation/workflows/${id}/resume`} label="Resume" />}
      </PageHeader>

      <WorkflowBuilder workflowId={id} initialGraph={wf.draftGraph} canManage={manage} publishedTemplates={templates} />

      <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="Recent runs (enrollments) and step log">
          {enrollments.length === 0 ? <Empty>No runs yet.</Empty> : (
            <ul className="space-y-2">
              {enrollments.map((e) => (
                <li key={e.id} className="rounded-lg border border-forest/10 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {e.lead ? <Link href={`/crm/leads/${e.lead.id}`} className="text-forest hover:underline">{e.lead.fullName}</Link> : "—"}
                      <span className="text-xs text-muted"> · v{e.workflowVersion.version} · {fmt(e.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={e.status === "ACTIVE" ? "warn" : e.status === "COMPLETED" ? "good" : e.status === "FAILED" ? "bad" : "default"}>{e.status.toLowerCase()}</Badge>
                      {e.stopReason && <span className="text-xs text-muted">{e.stopReason}</span>}
                      {manage && e.status === "ACTIVE" && <ActionButton url={`/api/admin/automation/enrollments/${e.id}/stop`} label="Stop" variant="danger" />}
                    </span>
                  </div>
                  <ol className="mt-1 flex flex-wrap gap-1 text-[11px]">
                    {e.steps.map((s) => {
                      const r = (s.result ?? {}) as Record<string, unknown>;
                      const detail = r.reason ?? r.detail ?? (r.resumeAt ? `until ${fmt(String(r.resumeAt))}` : r.branch !== undefined ? String(r.branch) : "");
                      return (
                        <li key={s.id} title={s.error ?? String(detail)} className={`rounded px-1.5 py-0.5 ${s.status === "FAILED" ? "bg-danger/10 text-danger" : s.status === "SKIPPED" ? "bg-gold/20" : "bg-sage-50"}`}>
                          {s.nodeId}: {s.status.toLowerCase()}{detail ? ` (${String(detail).slice(0, 40)})` : ""}
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Published versions">
          <ul className="space-y-1 text-xs">
            {wf.versions.map((v) => <li key={v.id}>v{v.version} · {fmt(v.publishedAt)} · triggers {v.triggerTypes.join(", ")}{v.id === wf.activeVersionId && " · live"}</li>)}
            {wf.versions.length === 0 && <li className="text-muted">Never published. Workflows stay disabled until published.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
