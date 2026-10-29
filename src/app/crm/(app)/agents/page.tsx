import { requirePageStaff } from "@/lib/auth/page";
import { agentPerformance } from "@/lib/assistant/agents";
import { AutoRefresh } from "@/components/crm/auto-refresh";
import { Badge, Card, Metric, PageHeader, inputCls, td, th } from "@/components/crm/ui";
import { ActionButton } from "@/components/crm/actions";
import { AgentSettingsForm } from "./settings-form";

export const metadata = { title: "AI agents" };

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requirePageStaff("settings:manage");
  const sp = await searchParams;
  const to = sp.to ? new Date(`${sp.to}T23:59:59Z`) : new Date();
  const from = sp.from ? new Date(`${sp.from}T00:00:00Z`) : new Date(to.getTime() - 30 * 86400_000);
  const { agents, queue } = await agentPerformance(from, to);
  const totals = agents.reduce(
    (t, a) => ({ live: t.live + a.liveNow, cap: t.cap + (a.active ? a.maxConcurrent : 0), convs: t.convs + a.conversations, leads: t.leads + a.leads, appts: t.appts + a.appointmentRequests, confirmed: t.confirmed + a.confirmed }),
    { live: 0, cap: 0, convs: 0, leads: 0, appts: 0, confirmed: 0 },
  );
  const ranked = [...agents].sort((a, b) => b.leads - a.leads || b.conversionRate - a.conversionRate);
  const best = ranked[0]?.leads ? ranked[0] : null;

  return (
    <>
      <PageHeader title="AI agents" sub="Ten named AI sales coordinators. Each discloses it is AI; capacity limits how many visitors each handles at once — extra visitors wait in a fair queue.">
        <form className="flex items-end gap-2">
          <label className="text-xs text-muted">From<input type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} className={`${inputCls} block`} /></label>
          <label className="text-xs text-muted">To<input type="date" name="to" defaultValue={to.toISOString().slice(0, 10)} className={`${inputCls} block`} /></label>
          <button className="rounded-lg border border-forest/25 bg-white px-3 py-1.5">Apply</button>
        </form>
      </PageHeader>
      <AutoRefresh seconds={15} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Metric label="Live chats now" value={`${totals.live} / ${totals.cap}`} />
        <Metric label="Waiting in queue" value={queue.waiting} tone="warn" />
        <Metric label="Longest wait" value={queue.waiting ? `${queue.longestWaitSeconds}s` : "—"} />
        <Metric label="Conversations" value={totals.convs} />
        <Metric label="Leads captured" value={totals.leads} />
        <Metric label="Confirmed appointments" value={totals.confirmed} />
      </div>

      {best && (
        <p className="mt-4 rounded-xl border border-forest/10 bg-white px-4 py-3 text-sm">
          🏆 Top performer this period: <b>{best.name}</b> — {best.leads} leads from {best.conversations} conversations ({pct(best.conversionRate)}), {best.confirmed} confirmed.
        </p>
      )}

      <Card title="Leaderboard" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr>
                <th className={th}>#</th><th className={th}>Agent</th><th className={th}>Status</th><th className={th}>Live</th><th className={th}>Conversations</th>
                <th className={th}>Leads</th><th className={th}>Lead rate</th><th className={th}>Appt. requests</th><th className={th}>Confirmed</th>
                <th className={th}>Handoffs</th><th className={th}>Avg msgs</th><th className={th}>Avg wait</th><th className={th}>Est. AI cost</th><th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-forest/5">
              {ranked.map((a, i) => (
                <tr key={a.id} className={a.active ? "" : "opacity-55"}>
                  <td className={`${td} tabular-nums text-muted`}>{i + 1}</td>
                  <td className={td}>
                    <span className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full font-display text-sm text-forest" style={{ background: `conic-gradient(from 0deg, hsl(${a.hue} 35% 72%), hsl(${a.hue + 40} 40% 85%), hsl(${a.hue} 30% 60%), hsl(${a.hue} 35% 72%))` }}>{a.name[0]}</span>
                      <span><span className="font-medium">{a.name}</span> <Badge>AI</Badge><span className="block text-xs text-muted">{a.tagline} · voice “{a.voice}”</span></span>
                    </span>
                  </td>
                  <td className={td}><Badge tone={a.active ? "good" : "warn"}>{a.active ? "active" : "paused"}</Badge></td>
                  <td className={`${td} tabular-nums`}>
                    {a.liveNow} / {a.maxConcurrent}
                    <span className="mt-1 block h-1 w-14 bg-forest/10"><span className="block h-1 bg-forest" style={{ width: `${Math.min(100, (a.liveNow / a.maxConcurrent) * 100)}%` }} /></span>
                  </td>
                  <td className={`${td} tabular-nums`}>{a.conversations}</td>
                  <td className={`${td} tabular-nums font-medium`}>{a.leads}</td>
                  <td className={`${td} tabular-nums`}>{a.conversations ? pct(a.conversionRate) : "—"}</td>
                  <td className={`${td} tabular-nums`}>{a.appointmentRequests}</td>
                  <td className={`${td} tabular-nums`}>{a.confirmed}</td>
                  <td className={`${td} tabular-nums`}>{a.handoffs}</td>
                  <td className={`${td} tabular-nums`}>{a.conversations ? a.avgMessages.toFixed(1) : "—"}</td>
                  <td className={`${td} tabular-nums`}>{a.avgWaitSeconds != null ? `${Math.round(a.avgWaitSeconds)}s` : "—"}</td>
                  <td className={`${td} tabular-nums`}>${a.estCostUsd.toFixed(3)}</td>
                  <td className={td}>
                    <ActionButton url={`/api/admin/ai-agents/${a.id}`} method="PATCH" body={{ active: !a.active }} label={a.active ? "Pause" : "Activate"} variant={a.active ? "danger" : "secondary"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Attribution: a lead counts for the agent whose conversation created or linked it; confirmed = that lead later has a confirmed or completed appointment (set by staff). Cost is an estimate from the rates in .env.
        </p>
      </Card>

      <Card title="Personas, voices & capacity" className="mt-4">
        <p className="mb-3 text-xs text-muted">Changes apply to new conversations. Keep personalities honest — agents must still say they are AI when asked.</p>
        <ul className="grid gap-3 lg:grid-cols-2">
          {agents.map((a) => (
            <li key={a.id} className="rounded-lg border border-forest/10 p-3">
              <details>
                <summary className="cursor-pointer font-medium">{a.name} <span className="text-xs font-normal text-muted">— {a.tagline}</span></summary>
                <AgentSettingsForm id={a.id} initial={{ name: a.name, tagline: a.tagline, style: a.style, voice: a.voice, maxConcurrent: a.maxConcurrent }} />
              </details>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
