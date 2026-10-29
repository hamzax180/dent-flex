import Link from "next/link";
import { requirePageStaff } from "@/lib/auth/page";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { Badge, Card, Empty, PageHeader, fmt, td, th } from "@/components/crm/ui";
import { ActionButton } from "@/components/crm/actions";
import { GovernanceForm, NewWorkflowForm } from "./governance";

export const metadata = { title: "Automation" };

export default async function AutomationPage() {
  const staff = await requirePageStaff("automation:read");
  const manage = can(staff.role, "automation:manage");
  const [workflows, counts, deadJobs, gov] = await Promise.all([
    prisma.workflow.findMany({ orderBy: { createdAt: "asc" }, include: { versions: { select: { version: true }, orderBy: { version: "desc" }, take: 1 } } }),
    prisma.workflowEnrollment.groupBy({ by: ["workflowId", "status"], _count: true }),
    prisma.job.findMany({ where: { status: "DEAD" }, orderBy: { updatedAt: "desc" }, take: 30 }),
    getSetting("automation_governance"),
  ]);
  const count = (id: string, s: string) => counts.find((c) => c.workflowId === id && c.status === s)?._count ?? 0;
  return (
    <>
      <PageHeader title="Marketing & lifecycle automation" sub="Workflows run in the background worker. Published versions are immutable; running enrollments stay on the version they started with.">
        {process.env.NODE_ENV !== "production" && manage && <ActionButton url="/api/admin/dev/run-jobs" label="Run due jobs now (dev)" />}
      </PageHeader>
      {gov.globalPause && <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-4 py-2 text-danger">Global pause is ON — no workflow steps or messages are being processed.</p>}

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Workflows">
          {workflows.length === 0 ? <Empty>No workflows. Run the seed to load the prebuilt templates.</Empty> : (
            <table className="w-full">
              <thead><tr><th className={th}>Workflow</th><th className={th}>Status</th><th className={th}>Live</th><th className={th}>Active / done / stopped / failed</th></tr></thead>
              <tbody className="divide-y divide-forest/5">
                {workflows.map((w) => (
                  <tr key={w.id}>
                    <td className={td}><Link href={`/crm/automation/${w.id}`} className="font-medium text-forest hover:underline">{w.name}</Link><div className="text-xs text-muted">{w.description}</div></td>
                    <td className={td}><Badge tone={w.status === "ACTIVE" ? "good" : w.status === "PAUSED" ? "warn" : "default"}>{w.status === "DRAFT" ? "disabled (draft)" : w.status.toLowerCase()}</Badge></td>
                    <td className={td}>{w.versions[0] ? `v${w.versions[0].version}` : "—"}</td>
                    <td className={`${td} tabular-nums`}>{count(w.id, "ACTIVE")} / {count(w.id, "COMPLETED")} / {count(w.id, "STOPPED")} / <span className={count(w.id, "FAILED") ? "text-danger" : ""}>{count(w.id, "FAILED")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {manage && <NewWorkflowForm />}
        </Card>

        <div className="space-y-4">
          <Card title="Contact governance">
            {manage ? <GovernanceForm initial={gov} /> : (
              <p className="text-xs">Quiet hours {gov.quietHoursStart}–{gov.quietHoursEnd} · marketing cap {gov.marketingCapPerWeek}/week · expiry {gov.messageExpiryHours}h</p>
            )}
          </Card>
          <Card title={`Failed jobs (${deadJobs.length})`}>
            {deadJobs.length === 0 ? <Empty>No failed jobs.</Empty> : (
              <ul className="space-y-2 text-xs">
                {deadJobs.map((j) => (
                  <li key={j.id} className="rounded-lg border border-danger/20 p-2">
                    <div className="flex justify-between gap-2"><span className="font-medium">{j.type}</span><span className="text-muted">{fmt(j.updatedAt)} · {j.attempts} attempts</span></div>
                    <p className="mt-1 break-words text-danger">{j.lastError}</p>
                    {manage && <div className="mt-1"><ActionButton url={`/api/admin/automation/jobs/${j.id}/retry`} label="Retry once" /></div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
