import Link from "next/link";
import { requirePageStaff } from "@/lib/auth/page";
import { AutoRefresh } from "@/components/crm/auto-refresh";
import { overview } from "@/lib/services/crm";
import { Card, Empty, Metric, PageHeader, PIPELINE, STATUS_LABEL, fmt, inputCls } from "@/components/crm/ui";

export default async function Overview({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; denied?: string }> }) {
  const staff = await requirePageStaff("leads:read");
  const sp = await searchParams;
  const to = sp.to ? new Date(`${sp.to}T23:59:59Z`) : new Date();
  const from = sp.from ? new Date(`${sp.from}T00:00:00Z`) : new Date(to.getTime() - 30 * 86400_000);
  const o = await overview(staff, from, to);
  return (
    <>
      <PageHeader title={`Good day, ${staff.name.split(" ")[0]}`} sub="Counts come straight from the database for your access scope.">
        <form className="flex items-end gap-2">
          <label className="text-xs text-muted">From<input type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} className={`${inputCls} block`} /></label>
          <label className="text-xs text-muted">To<input type="date" name="to" defaultValue={to.toISOString().slice(0, 10)} className={`${inputCls} block`} /></label>
          <button className="rounded-lg border border-forest/25 bg-white px-3 py-1.5">Apply</button>
        </form>
      </PageHeader>
      <AutoRefresh />
      {sp.denied && <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-4 py-2 text-danger">You don&apos;t have access to that page.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="New leads (range)" value={o.newLeads} href="/crm/leads?status=NEW" />
        <Metric label="Hot, open" value={o.hot} href="/crm/leads?band=HOT&sort=score" />
        <Metric label="Requested visits" value={o.requested} href="/crm/appointments" />
        <Metric label="Upcoming confirmed" value={o.confirmed} href="/crm/appointments" />
        <Metric label="Overdue tasks" value={o.overdue} href="/crm/tasks?view=overdue" tone="warn" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Leads by stage (all time)">
          <ul className="space-y-1.5">
            {PIPELINE.map((s) => {
              const n = o.byStatus[s] ?? 0;
              const max = Math.max(1, ...Object.values(o.byStatus).map(Number));
              return (
                <li key={s}>
                  <Link href={`/crm/leads?status=${s}`} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3 hover:underline">
                    <span>{STATUS_LABEL[s]}</span>
                    <span className="h-2 rounded-full bg-sage-50"><span className="block h-2 rounded-full bg-forest" style={{ width: `${(n / max) * 100}%` }} /></span>
                    <span className="text-right tabular-nums">{n}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Next confirmed appointments">
          {o.upcoming.length === 0 ? (
            <Empty>No confirmed appointments yet. Confirm one from Appointments once a time is agreed with the patient.</Empty>
          ) : (
            <ul className="divide-y divide-forest/10">
              {o.upcoming.map((a) => (
                <li key={a.id} className="flex justify-between py-2">
                  <Link href={`/crm/leads/${a.lead.id}`} className="hover:underline">{a.lead.fullName}</Link>
                  <span className="text-muted">{fmt(a.startAt)}{a.clinician ? ` · ${a.clinician.name}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
