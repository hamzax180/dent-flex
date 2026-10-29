import Link from "next/link";
import type { PlanStatus } from "@prisma/client";
import { requirePageStaff } from "@/lib/auth/page";
import { prisma } from "@/lib/db";
import { leadScope } from "@/lib/services/crm";
import { AutoRefresh } from "@/components/crm/auto-refresh";
import { Avatar, Badge, Empty, PageHeader, fmt } from "@/components/crm/ui";

export const metadata = { title: "Treatment plans" };

const TABS: { key: PlanStatus | "ALL"; label: string }[] = [
  { key: "REQUESTED", label: "New requests" },
  { key: "DRAFT", label: "Drafts" },
  { key: "SENT", label: "Sent" },
  { key: "ACCEPTED", label: "Want to book" },
  { key: "ALL", label: "All" },
];
const TONE = { REQUESTED: "warn", DRAFT: "default", SENT: "good", ACCEPTED: "good" } as const;

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const staff = await requirePageStaff("leads:read");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.status)?.key ?? "REQUESTED";
  const scope = { lead: leadScope(staff) };
  const [plans, counts, treatments] = await Promise.all([
    prisma.treatmentPlan.findMany({
      where: { ...scope, ...(tab === "ALL" ? {} : { status: tab }) },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { lead: { select: { id: true, fullName: true, interestScore: true } }, _count: { select: { uploads: true } } },
    }),
    prisma.treatmentPlan.groupBy({ by: ["status"], where: scope, _count: true }),
    prisma.treatment.findMany({ select: { slug: true, nameEn: true } }),
  ]);
  const count = (k: string) => (k === "ALL" ? counts.reduce((n, c) => n + c._count, 0) : counts.find((c) => c.status === k)?._count ?? 0);
  const tName = (slug: string | null) => treatments.find((t) => t.slug === slug)?.nameEn ?? "Not sure yet";

  return (
    <>
      <PageHeader eyebrow="Sales" title="Treatment plans" sub="Free plan requests from the website. Review the patient's images, write the plan and send them a private link." />
      <AutoRefresh />
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/crm/plans?status=${t.key}`} className={`rounded-full px-4 py-1.5 text-sm transition ${tab === t.key ? "bg-forest text-ivory" : "bg-white text-forest ring-1 ring-forest/10 hover:ring-forest/30"}`}>
            {t.label} <span className="ml-1 opacity-60">{count(t.key)}</span>
          </Link>
        ))}
      </div>
      {plans.length === 0 ? (
        <Empty>Nothing here. Free plan requests from /free-plan appear in “New requests”.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <Link key={p.id} href={`/crm/plans/${p.id}`} className="group rounded-2xl border border-forest/[0.08] bg-white p-5 shadow-[0_1px_2px_rgba(31,51,41,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-22px_rgba(31,51,41,0.45)]">
              <div className="flex items-start gap-3">
                <Avatar name={p.lead.fullName} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.lead.fullName}</p>
                  <p className="truncate text-xs text-muted">{tName(p.treatmentSlug)}{p.country ? ` · ${p.country}` : ""}</p>
                </div>
                <Badge tone={TONE[p.status]}>{p.status.toLowerCase()}</Badge>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted">
                <span>{p._count.uploads} file{p._count.uploads === 1 ? "" : "s"} · interest {p.lead.interestScore}</span>
                <span>{p.viewedAt ? "Opened by patient" : fmt(p.createdAt)}</span>
              </div>
              <p className="mt-3 font-mono text-[11px] text-forest/50">{p.publicId}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
