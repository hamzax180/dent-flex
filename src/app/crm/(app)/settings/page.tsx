import { requirePageStaff } from "@/lib/auth/page";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { Badge, Card, PageHeader, fmt, td, th } from "@/components/crm/ui";
import { ActionButton } from "@/components/crm/actions";
import { JsonSettingForm, NewUserForm } from "./forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await requirePageStaff("settings:manage");
  const [clinic, privacy, sales, users, audit] = await Promise.all([
    getSetting("clinic_info"),
    getSetting("privacy"),
    getSetting("sales_profile"),
    prisma.staffUser.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true, role: true, active: true } }),
    prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { actor: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Settings" sub="Admin only. Every change is audited." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Clinic information (public website + AI assistant)">
          <p className="mb-2 text-xs text-muted">Set <code>isPlaceholder</code> to false only after every value is verified. Never enter unverified facts.</p>
          <JsonSettingForm settingKey="clinic_info" initial={clinic} />
        </Card>
        <Card title="AI coordinator — name & approved selling points">
          <p className="mb-2 text-xs text-muted">
            The coordinator may only use these points to persuade. Keep every one true and evidenced; avoid superlatives (&quot;best&quot;, &quot;cheapest&quot;) and outcome guarantees.
            <code> includedServices</code> lists extras you really provide (e.g. airport transfer) — leave empty until confirmed.
          </p>
          <JsonSettingForm settingKey="sales_profile" initial={sales} />
        </Card>
        <Card title="Privacy & retention">
          <p className="mb-2 text-xs text-muted">Turn on transcript storage only after the clinic has documented a retention purpose and period. Raw voice audio is never stored.</p>
          <JsonSettingForm settingKey="privacy" initial={privacy} />
        </Card>
        <Card title="Staff users & roles">
          <table className="w-full">
            <thead><tr><th className={th}>Name</th><th className={th}>Role</th><th className={th}>Status</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-forest/5">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className={td}>{u.name}<div className="text-xs text-muted">{u.email}</div></td>
                  <td className={td}>{u.role.toLowerCase()}</td>
                  <td className={td}><Badge tone={u.active ? "good" : "bad"}>{u.active ? "active" : "deactivated"}</Badge></td>
                  <td className={td}>{u.id !== me.id && <ActionButton url={`/api/admin/users/${u.id}`} method="PATCH" body={{ active: !u.active }} label={u.active ? "Deactivate" : "Reactivate"} variant={u.active ? "danger" : "secondary"} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <NewUserForm />
        </Card>
        <Card title="Recent audit events">
          <ul className="max-h-96 space-y-1 overflow-y-auto text-xs">
            {audit.map((a) => <li key={a.id}><span className="text-muted">{fmt(a.createdAt)}</span> · {a.actor?.name ?? "system"} · <b>{a.action}</b> · {a.entityType}</li>)}
          </ul>
        </Card>
      </div>
    </>
  );
}
