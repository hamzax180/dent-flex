import Link from "next/link";
import { requirePageStaff } from "@/lib/auth/page";
import { can } from "@/lib/auth/rbac";
import { AutoRefresh } from "@/components/crm/auto-refresh";
import { listLeads } from "@/lib/services/crm";
import { prisma } from "@/lib/db";
import { Empty, PageHeader, PIPELINE, STATUS_LABEL, ScoreBadge, fmt, inputCls, td, th } from "@/components/crm/ui";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const staff = await requirePageStaff("leads:read");
  const sp = await searchParams;
  const [data, treatments, staffList] = await Promise.all([
    listLeads(staff, sp),
    prisma.treatment.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, nameEn: true } }),
    prisma.staffUser.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);
  const f = data.filters;
  const qs = (page: number) => `?${new URLSearchParams({ ...sp, page: String(page) })}`;
  return (
    <>
      <PageHeader title="Lead inbox" sub={`${data.total} matching lead${data.total === 1 ? "" : "s"}. Updates automatically.`}>
        {can(staff.role, "leads:write") && <Link href="/crm/leads/new" className="rounded-lg bg-forest px-4 py-2 text-ivory hover:bg-forest-700">+ New lead (phone / walk-in)</Link>}
      </PageHeader>
      <AutoRefresh />
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-forest/10 bg-white p-3" role="search">
        <label className="text-xs text-muted">Search<input name="q" defaultValue={f.q} placeholder="Name, reference, email, phone" className={`${inputCls} block w-56`} /></label>
        <label className="text-xs text-muted">Status
          <select name="status" defaultValue={f.status ?? ""} className={`${inputCls} block`}><option value="">Any</option>{PIPELINE.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        </label>
        <label className="text-xs text-muted">Score
          <select name="band" defaultValue={f.band ?? ""} className={`${inputCls} block`}><option value="">Any</option><option value="HOT">Hot</option><option value="WARM">Warm</option><option value="LOW_INFORMATION">Low info</option></select>
        </label>
        <label className="text-xs text-muted">Treatment
          <select name="treatment" defaultValue={f.treatment ?? ""} className={`${inputCls} block`}><option value="">Any</option>{treatments.map((t) => <option key={t.slug} value={t.slug}>{t.nameEn}</option>)}</select>
        </label>
        <label className="text-xs text-muted">Source
          <select name="source" defaultValue={f.source ?? ""} className={`${inputCls} block`}>
            <option value="">Any</option>{["WEB_FORM", "TEXT_ASSISTANT", "VOICE_ASSISTANT", "PHONE", "WALK_IN", "REFERRAL", "CAMPAIGN", "IMPORT", "OTHER"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">Owner
          <select name="owner" defaultValue={f.owner ?? ""} className={`${inputCls} block`}><option value="">Anyone</option><option value="me">Me</option><option value="none">Unassigned</option>{staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label className="text-xs text-muted">From<input type="date" name="from" defaultValue={f.from} className={`${inputCls} block`} /></label>
        <label className="text-xs text-muted">To<input type="date" name="to" defaultValue={f.to} className={`${inputCls} block`} /></label>
        <label className="text-xs text-muted">Sort
          <select name="sort" defaultValue={f.sort} className={`${inputCls} block`}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="score">Score</option></select>
        </label>
        <button className="rounded-lg bg-forest px-3 py-1.5 text-ivory">Filter</button>
        <Link href="/crm/leads" className="px-2 py-1.5 text-forest underline">Reset</Link>
      </form>

      {data.rows.length === 0 ? (
        <Empty>No leads match. New website, assistant and voice inquiries appear here automatically.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-forest/10 bg-white">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-forest/10 bg-sage-50/50">
              <tr><th className={th}>Lead</th><th className={th}>Contact</th><th className={th}>Status</th><th className={th}>Score</th><th className={th}>Interest</th><th className={th}>Source</th><th className={th}>Owner</th><th className={th}>Created</th></tr>
            </thead>
            <tbody className="divide-y divide-forest/5">
              {data.rows.map((r) => (
                <tr key={r.id} className="hover:bg-sage-50/40">
                  <td className={td}><Link href={`/crm/leads/${r.id}`} className="font-medium text-forest hover:underline">{r.fullName}</Link><div className="text-xs text-muted">{r.publicId} · {r.language.toUpperCase()}</div></td>
                  <td className={td}><div>{r.phone ?? "—"}</div><div className="text-xs text-muted">{r.email ?? ""}</div></td>
                  <td className={td}>{STATUS_LABEL[r.status]}</td>
                  <td className={td}><ScoreBadge total={r.scoreTotal} band={r.scoreBand} override={r.scoreOverride} /></td>
                  <td className={td}>{r.treatment?.nameEn ?? "—"}</td>
                  <td className={td}>{r.source.replace(/_/g, " ").toLowerCase()}</td>
                  <td className={td}>{r.owner?.name ?? <span className="text-muted">Unassigned</span>}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmt(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label="Pagination" className="mt-4 flex items-center gap-3">
        {f.page > 1 && <Link href={qs(f.page - 1)} className="text-forest underline">← Previous</Link>}
        <span className="text-muted">Page {f.page} of {data.pages}</span>
        {f.page < data.pages && <Link href={qs(f.page + 1)} className="text-forest underline">Next →</Link>}
      </nav>
    </>
  );
}
