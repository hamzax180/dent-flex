import Link from "next/link";
import { requirePageStaff } from "@/lib/auth/page";
import { can } from "@/lib/auth/rbac";
import { AutoRefresh } from "@/components/crm/auto-refresh";
import { Icon } from "@/components/crm/icons";
import { dashboard, overview } from "@/lib/services/crm";
import { agentPerformance } from "@/lib/assistant/agents";
import { Avatar, Card, Empty, Metric, PIPELINE, STATUS_LABEL, ScoreBadge, fmt, inputCls } from "@/components/crm/ui";

const TZ = process.env.CLINIC_TIMEZONE || "Europe/Istanbul";
const time = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: TZ }).format(d);
const ago = (d: Date) => {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};
const ACTIVITY: Record<string, string> = {
  "lead.created": "New lead",
  "lead.updated": "Lead updated",
  "appointment.requested": "Asked for an appointment",
  "appointment.confirmed": "Appointment confirmed",
  "appointment.rescheduled": "Appointment moved",
  "note.added": "Note added",
  "task.created": "Task created",
  "score.override": "Score changed",
  "consent.revoked": "Consent withdrawn",
  "message.sent": "Message sent",
  "message.replied": "Replied to a message",
};
const SOURCE: Record<string, string> = {
  WEB_FORM: "Website form", TEXT_ASSISTANT: "AI chat", VOICE_ASSISTANT: "AI call", PHONE: "Phone", WALK_IN: "Walk-in",
  REFERRAL: "Referral", CAMPAIGN: "Campaign", IMPORT: "Import", OTHER: "Other",
};

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; denied?: string }> }) {
  const staff = await requirePageStaff("leads:read");
  const sp = await searchParams;
  const to = sp.to ? new Date(`${sp.to}T23:59:59Z`) : new Date();
  const from = sp.from ? new Date(`${sp.from}T00:00:00Z`) : new Date(to.getTime() - 30 * 86400_000);
  const showAgents = can(staff.role, "reports:read");
  const [o, d, agents] = await Promise.all([overview(staff, from, to), dashboard(staff, from, to), showAgents ? agentPerformance(from, to) : Promise.resolve(null)]);
  const topAgents = [...(agents?.agents ?? [])].sort((a, b) => b.appointmentRequests - a.appointmentRequests || b.leads - a.leads).slice(0, 5);
  const maxStage = Math.max(1, ...Object.values(o.byStatus).map(Number));
  const maxTrend = Math.max(1, ...d.trend.map((t) => t.count));
  const totalSources = d.sources.reduce((n, s) => n + s.count, 0);
  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date());

  return (
    <>
      <AutoRefresh />
      {sp.denied && <p role="alert" className="mb-4 rounded-xl bg-danger/10 px-4 py-2 text-danger">You don&apos;t have access to that page.</p>}

      {/* Hero */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-forest px-6 py-7 text-ivory md:px-9 md:py-9">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-sage/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sage">{today}</p>
            <h1 className="mt-2 font-display text-4xl font-light md:text-5xl">{greeting()}, {staff.name.split(" ")[0]}</h1>
            <p className="mt-3 max-w-xl text-ivory/70">
              {d.todayAppts.length} appointment{d.todayAppts.length === 1 ? "" : "s"} today · {o.requested} request{o.requested === 1 ? "" : "s"} waiting for a call ·{" "}
              <span className={o.overdue ? "text-[#f4a593]" : ""}>{o.overdue} overdue task{o.overdue === 1 ? "" : "s"}</span>
            </p>
          </div>
          <form className="flex flex-wrap items-end gap-2 rounded-2xl bg-ivory/[0.07] p-2 backdrop-blur">
            <label className="text-[11px] text-ivory/60">From<input type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} className={`${inputCls} block border-ivory/10 bg-ivory/95 py-1.5 text-ink [color-scheme:light]`} /></label>
            <label className="text-[11px] text-ivory/60">To<input type="date" name="to" defaultValue={to.toISOString().slice(0, 10)} className={`${inputCls} block border-ivory/10 bg-ivory/95 py-1.5 text-ink [color-scheme:light]`} /></label>
            <button className="rounded-xl bg-sage px-4 py-2 font-medium text-forest transition hover:bg-[#cdd3b6]">Apply</button>
          </form>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-5">
        <Metric label="New leads" value={o.newLeads} href="/crm/leads?status=NEW" icon="users" hint="In the selected range">
          <div className="mt-3 flex h-8 items-end gap-[3px]" aria-hidden>
            {d.trend.map((t, i) => (
              <span key={i} className="flex-1 rounded-sm bg-forest/15 group-hover:bg-forest/25" style={{ height: `${Math.max(8, (t.count / maxTrend) * 100)}%` }} />
            ))}
          </div>
        </Metric>
        <Metric label="Hot & open" value={o.hot} href="/crm/leads?band=HOT&sort=score" icon="flame" tone="dark" hint="Call these first" />
        <Metric label="Waiting for a call" value={o.requested} href="/crm/appointments" icon="phone" hint="Appointment requests" />
        <Metric label="Upcoming visits" value={o.confirmed} href="/crm/appointments" icon="calendar" hint="Confirmed" />
        <Metric label="Overdue tasks" value={o.overdue} href="/crm/tasks?view=overdue" icon="alert" tone="warn" hint={o.overdue ? "Needs attention" : "All caught up"} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {/* Hot leads */}
        <Card title="Call these next" icon="flame" className="xl:col-span-2" actions={<Link href="/crm/leads?sort=score" className="text-xs font-medium text-forest hover:underline">All leads →</Link>}>
          {d.hotLeads.length === 0 ? (
            <Empty>No open leads yet. New ones from the website, AI chat and calls land here.</Empty>
          ) : (
            <ul className="-mx-2 divide-y divide-forest/[0.06]">
              {d.hotLeads.map((l) => (
                <li key={l.id}>
                  <Link href={`/crm/leads/${l.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-[#f7f7f2]">
                    <Avatar name={l.fullName} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{l.fullName}</p>
                      <p className="truncate text-xs text-muted">{l.treatment?.nameEn ?? "Treatment not chosen"} · {SOURCE[l.source] ?? l.source} · {ago(l.createdAt)}</p>
                    </div>
                    <span className="hidden text-xs text-muted sm:block">{STATUS_LABEL[l.status]}</span>
                    <ScoreBadge total={l.scoreTotal} band={l.scoreBand} override={l.scoreOverride} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Today */}
        <Card title="Today" icon="clock">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Appointments</p>
              {d.todayAppts.length === 0 ? (
                <p className="text-sm text-muted">No visits booked for today.</p>
              ) : (
                <ul className="space-y-1.5">
                  {d.todayAppts.map((a) => (
                    <li key={a.id}>
                      <Link href={`/crm/leads/${a.lead.id}`} className="flex items-center gap-3 rounded-xl bg-sage-50/70 px-3 py-2 hover:bg-sage-50">
                        <span className="font-semibold tabular-nums text-forest">{time(a.startAt)}</span>
                        <span className="truncate">{a.lead.fullName}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Tasks due</p>
              {d.tasks.length === 0 ? (
                <p className="text-sm text-muted">Nothing due. Nice.</p>
              ) : (
                <ul className="space-y-1.5">
                  {d.tasks.map((t) => {
                    const late = t.dueAt < new Date();
                    return (
                      <li key={t.id} className="flex items-start gap-2.5">
                        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${late ? "bg-[#e5735f]" : "bg-sage"}`} />
                        <div className="min-w-0">
                          <Link href={t.lead ? `/crm/leads/${t.lead.id}` : "/crm/tasks"} className="block truncate hover:underline">{t.title}</Link>
                          <p className={`text-xs ${late ? "text-[#c4523d]" : "text-muted"}`}>{late ? "Overdue · " : ""}{fmt(t.dueAt)}{t.lead ? ` · ${t.lead.fullName}` : ""}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </Card>

        {/* Funnel */}
        <Card title="Pipeline" icon="columns" actions={<Link href="/crm/pipeline" className="text-xs font-medium text-forest hover:underline">Board →</Link>}>
          <ul className="space-y-2">
            {PIPELINE.map((s, i) => {
              const n = o.byStatus[s] ?? 0;
              return (
                <li key={s}>
                  <Link href={`/crm/leads?status=${s}`} className="group grid grid-cols-[8.5rem_1fr_2rem] items-center gap-3">
                    <span className="truncate text-[0.82rem] group-hover:text-forest">{STATUS_LABEL[s]}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-[#eef0e6]">
                      <span className="block h-full rounded-full transition-all group-hover:brightness-110" style={{ width: `${Math.max(n ? 4 : 0, (n / maxStage) * 100)}%`, background: `hsl(${150 - i * 7} 30% ${30 + i * 3}%)` }} />
                    </span>
                    <span className="text-right text-[0.82rem] font-medium tabular-nums">{n}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Agents */}
        {showAgents ? (
          <Card title="AI sales leaderboard" icon="spark" actions={<Link href="/crm/agents" className="text-xs font-medium text-forest hover:underline">Agents →</Link>}>
            {topAgents.length === 0 ? (
              <Empty>No agent activity in this range.</Empty>
            ) : (
              <ol className="space-y-2">
                {topAgents.map((a, i) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                    <span className={`w-5 text-center font-display text-lg ${i === 0 ? "text-gold" : "text-forest/40"}`}>{i + 1}</span>
                    <span className="flex size-8 items-center justify-center rounded-full font-semibold text-forest" style={{ background: `hsl(${a.hue} 35% 85%)` }}>{a.name[0]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="text-xs text-muted">{a.conversations} chats · {a.leads} leads</p>
                    </div>
                    <span className="text-right">
                      <span className="block font-display text-xl leading-none text-forest">{a.appointmentRequests}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted">booked</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        ) : (
          <Card title="Upcoming visits" icon="calendar">
            {o.upcoming.length === 0 ? <Empty>No confirmed appointments yet.</Empty> : (
              <ul className="divide-y divide-forest/[0.06]">
                {o.upcoming.map((a) => (
                  <li key={a.id} className="flex justify-between py-2"><Link href={`/crm/leads/${a.lead.id}`} className="hover:underline">{a.lead.fullName}</Link><span className="text-muted">{fmt(a.startAt)}</span></li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* Sources + activity */}
        <Card title="Where leads come from" icon="globe">
          {totalSources === 0 ? (
            <Empty>No leads in this range.</Empty>
          ) : (
            <>
              <div className="mb-4 flex h-3 overflow-hidden rounded-full" aria-hidden>
                {d.sources.map((s, i) => <span key={s.source} style={{ width: `${(s.count / totalSources) * 100}%`, background: `hsl(${140 + i * 28} 28% ${32 + i * 8}%)` }} />)}
              </div>
              <ul className="space-y-1.5">
                {d.sources.map((s, i) => (
                  <li key={s.source} className="flex items-center gap-2.5">
                    <span className="size-2.5 rounded-full" style={{ background: `hsl(${140 + i * 28} 28% ${32 + i * 8}%)` }} />
                    <Link href={`/crm/leads?source=${s.source}`} className="flex-1 hover:underline">{SOURCE[s.source] ?? s.source}</Link>
                    <span className="tabular-nums text-muted">{Math.round((s.count / totalSources) * 100)}%</span>
                    <span className="w-6 text-right font-medium tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Latest activity" icon="bolt" className="xl:col-span-3">
          {d.activity.length === 0 ? (
            <Empty>Activity from leads, staff and automations will show up here.</Empty>
          ) : (
            <ul className="grid gap-x-8 gap-y-1 md:grid-cols-2">
              {d.activity.map((e) => (
                <li key={e.id} className="flex items-center gap-3 border-b border-forest/[0.05] py-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sage-50 text-forest"><Icon name="check" className="size-3.5" /></span>
                  <p className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{ACTIVITY[e.type] ?? e.type.replace(/[._]/g, " ")}</span>
                    {e.lead && <> · <Link href={`/crm/leads/${e.lead.id}`} className="text-forest hover:underline">{e.lead.fullName}</Link></>}
                  </p>
                  <span className="shrink-0 text-xs text-muted">{ago(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
