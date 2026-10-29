import Link from "next/link";
import { requirePageStaff } from "@/lib/auth/page";
import { AutoRefresh } from "@/components/crm/auto-refresh";
import { leadScope } from "@/lib/services/crm";
import { prisma } from "@/lib/db";
import { PageHeader, PIPELINE, STATUS_LABEL, ScoreBadge } from "@/components/crm/ui";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const staff = await requirePageStaff("leads:read");
  const columns = await Promise.all(
    PIPELINE.map(async (status) => {
      const where = { AND: [leadScope(staff), { status }] };
      const [count, leads] = await Promise.all([
        prisma.lead.count({ where }),
        prisma.lead.findMany({ where, orderBy: [{ scoreTotal: "desc" }, { createdAt: "desc" }], take: 15, select: { id: true, fullName: true, scoreTotal: true, scoreBand: true, scoreOverride: true, owner: { select: { name: true } } } }),
      ]);
      return { status, count, leads };
    }),
  );
  return (
    <>
      <PageHeader title="Pipeline" sub="Requested and confirmed appointments are separate stages. Change stages from the lead record so every move is validated and logged." />
      <AutoRefresh />
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((c) => (
          <section key={c.status} className="w-60 shrink-0 rounded-xl border border-forest/10 bg-white" aria-label={STATUS_LABEL[c.status]}>
            <header className="flex justify-between border-b border-forest/10 px-3 py-2">
              <Link href={`/crm/leads?status=${c.status}`} className="font-medium hover:underline">{STATUS_LABEL[c.status]}</Link>
              <span className="text-muted tabular-nums">{c.count}</span>
            </header>
            <ul className="space-y-2 p-2">
              {c.leads.map((l) => (
                <li key={l.id}>
                  <Link href={`/crm/leads/${l.id}`} className="block rounded-lg border border-forest/10 p-2 hover:border-forest/30">
                    <span className="block truncate font-medium">{l.fullName}</span>
                    <span className="mt-1 flex items-center justify-between text-xs text-muted">
                      <ScoreBadge total={l.scoreTotal} band={l.scoreBand} override={l.scoreOverride} />
                      <span className="truncate">{l.owner?.name ?? "—"}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {c.count > c.leads.length && <li className="px-1 text-xs text-muted">+{c.count - c.leads.length} more</li>}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
