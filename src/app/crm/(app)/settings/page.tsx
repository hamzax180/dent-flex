import { requirePageStaff } from "@/lib/auth/page";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import Link from "next/link";
import { Card, PageHeader, fmt } from "@/components/crm/ui";
import { JsonSettingForm } from "./forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePageStaff("settings:manage");
  const [clinic, privacy, sales, audit] = await Promise.all([
    getSetting("clinic_info"),
    getSetting("privacy"),
    getSetting("sales_profile"),
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
          <p className="text-sm text-muted">Staff accounts, roles and password resets now live on the Team page.</p>
          <Link href="/crm/team" className="mt-3 inline-flex rounded-xl bg-forest px-4 py-2 text-sm font-medium text-ivory hover:bg-forest-700">Open Team →</Link>
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
