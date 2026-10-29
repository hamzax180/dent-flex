import { requirePageStaff } from "@/lib/auth/page";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { Badge, Card, Empty, PageHeader, fmt, td, th } from "@/components/crm/ui";
import { ActionButton } from "@/components/crm/actions";
import { CampaignForm, CampaignPreview, ScheduleForm, TemplateForm } from "./forms";

export const metadata = { title: "Campaigns & templates" };

export default async function CampaignsPage() {
  const staff = await requirePageStaff("automation:read");
  const draft = can(staff.role, "campaigns:draft");
  const approve = can(staff.role, "campaigns:approve");
  const [campaigns, templates] = await Promise.all([
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { recipients: { select: { status: true } } } }),
    prisma.messageTemplate.findMany({ orderBy: [{ key: "asc" }, { channel: "asc" }, { locale: "asc" }, { version: "desc" }] }),
  ]);
  const marketingKeys = [...new Set(templates.filter((t) => t.purpose === "MARKETING").map((t) => t.key))];
  return (
    <>
      <PageHeader title="Campaigns & templates" sub="Draft → preview audience → test send → approval → schedule. Every recipient is re-checked for permission, suppression, quiet hours and contact caps immediately before sending." />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Campaigns">
          {campaigns.length === 0 ? <Empty>No campaigns yet.</Empty> : (
            <ul className="space-y-3">
              {campaigns.map((c) => {
                const counts = c.recipients.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
                return (
                  <li key={c.id} className="rounded-lg border border-forest/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{c.name} <span className="text-xs text-muted">· {c.channel.toLowerCase()} · template “{c.templateKey}”</span></span>
                      <Badge tone={c.status === "SENDING" || c.status === "COMPLETED" ? "good" : c.status === "CANCELLED" ? "bad" : "warn"}>{c.status.toLowerCase().replace("_", " ")}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">Segment: {JSON.stringify(c.segment)} · created {fmt(c.createdAt)}{c.scheduledAt ? ` · scheduled ${fmt(c.scheduledAt)}` : ""}</p>
                    {Object.keys(counts).length > 0 && <p className="mt-1 text-xs">{Object.entries(counts).map(([k, v]) => `${k.toLowerCase()}: ${v}`).join(" · ")}</p>}
                    <div className="mt-2 flex flex-wrap items-start gap-1.5">
                      {draft && <CampaignPreview id={c.id} />}
                      {draft && c.channel === "EMAIL" && <ActionButton url={`/api/admin/automation/campaigns/${c.id}/test-send`} label="Test send to me" />}
                      {draft && c.status === "DRAFT" && <ActionButton url={`/api/admin/automation/campaigns/${c.id}/submit`} label="Submit for approval" />}
                      {approve && c.status === "PENDING_APPROVAL" && <ActionButton url={`/api/admin/automation/campaigns/${c.id}/approve`} label="Approve" variant="primary" />}
                      {approve && c.status === "APPROVED" && <ScheduleForm id={c.id} />}
                      {approve && ["SCHEDULED", "SENDING"].includes(c.status) && <ActionButton url={`/api/admin/automation/campaigns/${c.id}/pause`} label="Pause" />}
                      {approve && c.status === "PAUSED" && <ActionButton url={`/api/admin/automation/campaigns/${c.id}/resume`} label="Resume" />}
                      {approve && !["CANCELLED", "COMPLETED"].includes(c.status) && <ActionButton url={`/api/admin/automation/campaigns/${c.id}/cancel`} label="Cancel" variant="danger" confirm="Cancel this campaign? Unsent messages will be blocked." />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {draft && <CampaignForm templateKeys={marketingKeys} />}
        </Card>

        <Card title="Message templates">
          <p className="mb-2 text-xs text-muted">Draft → In review → Approved → Published. Published versions are immutable; edits create a new version. WhatsApp marketing must use templates approved in the official WhatsApp Business Platform.</p>
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="w-full text-xs">
              <thead><tr><th className={th}>Key</th><th className={th}>Ch / lang</th><th className={th}>v</th><th className={th}>Status</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-forest/5">
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td className={td} title={t.body}>{t.key}<div className="text-muted">{t.purpose.toLowerCase()}</div></td>
                    <td className={td}>{t.channel.toLowerCase()} / {t.locale}</td>
                    <td className={td}>{t.version}</td>
                    <td className={td}><Badge tone={t.status === "PUBLISHED" ? "good" : t.status === "ARCHIVED" ? "default" : "warn"}>{t.status.toLowerCase().replace("_", " ")}</Badge></td>
                    <td className={td}>
                      <span className="flex flex-wrap gap-1">
                        {draft && t.status === "DRAFT" && <ActionButton url={`/api/admin/automation/templates/${t.id}/submit`} label="Submit" />}
                        {approve && t.status === "IN_REVIEW" && <ActionButton url={`/api/admin/automation/templates/${t.id}/approve`} label="Approve" />}
                        {approve && t.status === "APPROVED" && <ActionButton url={`/api/admin/automation/templates/${t.id}/publish`} label="Publish" variant="primary" />}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {draft && <TemplateForm />}
        </Card>
      </div>
    </>
  );
}
