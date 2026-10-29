import { requirePageStaff } from "@/lib/auth/page";
import { can } from "@/lib/auth/rbac";
import { leadReport, automationReport, DEFINITIONS } from "@/lib/services/reports";
import { Card, Metric, PageHeader, inputCls, td, th } from "@/components/crm/ui";

export const metadata = { title: "Reports" };

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const staff = await requirePageStaff("reports:read");
  const sp = await searchParams;
  const to = sp.to ? new Date(`${sp.to}T23:59:59Z`) : new Date();
  const from = sp.from ? new Date(`${sp.from}T00:00:00Z`) : new Date(to.getTime() - 90 * 86400_000);
  const [leads, auto] = await Promise.all([leadReport(from, to), automationReport(from, to)]);
  const deliveries = auto.deliveries.reduce<Record<string, number>>((a, d) => ((a[d.status] = (a[d.status] ?? 0) + d._count), a), {});
  return (
    <>
      <PageHeader title="Reports" sub="Cohort = leads created in the selected range. Definitions are listed at the bottom.">
        <form className="flex items-end gap-2">
          <label className="text-xs text-muted">From<input type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} className={`${inputCls} block`} /></label>
          <label className="text-xs text-muted">To<input type="date" name="to" defaultValue={to.toISOString().slice(0, 10)} className={`${inputCls} block`} /></label>
          <button className="rounded-lg border border-forest/25 bg-white px-3 py-1.5">Apply</button>
        </form>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Unique leads" value={leads.total} />
        <Metric label="With confirmed appointment" value={leads.confirmed} />
        <Metric label="Lead → confirmed" value={pct(leads.conversionRate)} />
        <Metric label="Median first human response" value={leads.medianFirstResponseMinutes == null ? "—" : `${Math.round(leads.medianFirstResponseMinutes)} min`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="By source">
          <table className="w-full"><thead><tr><th className={th}>Source</th><th className={th}>Leads</th><th className={th}>Confirmed</th><th className={th}>Rate</th></tr></thead>
            <tbody>{Object.entries(leads.bySource).map(([k, v]) => <tr key={k}><td className={td}>{k.replace(/_/g, " ").toLowerCase()}</td><td className={td}>{v.leads}</td><td className={td}>{v.confirmed}</td><td className={td}>{pct(v.confirmed / v.leads)}</td></tr>)}</tbody></table>
        </Card>
        <Card title="By score band (calibration)">
          <table className="w-full"><thead><tr><th className={th}>Band at last score</th><th className={th}>Leads</th><th className={th}>Confirmed</th><th className={th}>Rate</th></tr></thead>
            <tbody>{Object.entries(leads.byBand).map(([k, v]) => <tr key={k}><td className={td}>{k.replace(/_/g, " ").toLowerCase()}</td><td className={td}>{v.leads}</td><td className={td}>{v.confirmed}</td><td className={td}>{pct(v.confirmed / v.leads)}</td></tr>)}</tbody></table>
        </Card>
        <Card title="Messaging & workflows">
          <p>Deliveries: {Object.entries(deliveries).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(" · ") || "none"}</p>
          <p className="mt-1">Replies {auto.replied} · clicks {auto.clicked} · marketing opt-outs {auto.unsubscribes} · goals reached {auto.goals} · failed jobs {auto.deadJobs}</p>
          <table className="mt-3 w-full text-xs"><thead><tr><th className={th}>Workflow</th><th className={th}>Status</th><th className={th}>Runs</th></tr></thead>
            <tbody>{auto.enrollments.map((e, i) => <tr key={i}><td className={td}>{e.workflow}</td><td className={td}>{e.status.toLowerCase()}</td><td className={td}>{e.count}</td></tr>)}</tbody></table>
        </Card>
        <Card title="Campaigns">
          {auto.campaigns.length === 0 ? <p className="text-muted">No campaigns in range.</p> : auto.campaigns.map((c) => (
            <p key={c.id} className="text-xs"><b>{c.name}</b> ({c.status.toLowerCase()}): {Object.entries(c.counts).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(" · ")}</p>
          ))}
        </Card>
        {can(staff.role, "ai_usage:read") && (
          <Card title="AI usage (estimated)">
            {auto.usage.length === 0 ? <p className="text-muted">No metered AI usage in range (development mock replies are not metered).</p> : (
              <table className="w-full text-xs"><thead><tr><th className={th}>Kind</th><th className={th}>Calls</th><th className={th}>Tokens in/out</th><th className={th}>Voice sec</th><th className={th}>Est. USD</th></tr></thead>
                <tbody>{auto.usage.map((u) => <tr key={u.kind}><td className={td}>{u.kind.toLowerCase()}</td><td className={td}>{u.events}</td><td className={td}>{u.inputTokens}/{u.outputTokens}</td><td className={td}>{u.seconds}</td><td className={td}>{u.estUsd.toFixed(4)}</td></tr>)}</tbody></table>
            )}
            <p className="mt-2 text-xs text-muted">Estimates use rates you configure from the official pricing page. Reconcile with the provider&apos;s billing dashboard.</p>
          </Card>
        )}
      </div>
      <Card title="Definitions" className="mt-4">
        <dl className="space-y-1 text-xs">{Object.entries(DEFINITIONS).map(([k, v]) => <div key={k}><dt className="inline font-medium">{k}: </dt><dd className="inline text-muted">{v}</dd></div>)}</dl>
      </Card>
    </>
  );
}
