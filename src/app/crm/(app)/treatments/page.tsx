import { requirePageStaff } from "@/lib/auth/page";
import { prisma } from "@/lib/db";
import { currentPublished, formatMoney } from "@/lib/services/pricing";
import { Badge, Card, PageHeader, fmt, td, th } from "@/components/crm/ui";
import { ActionButton } from "@/components/crm/actions";
import { ComparisonForm, PriceDraftForm } from "./price-form";

export const metadata = { title: "Treatments & prices" };

const money = (minor: number | null, cur: string) => (minor == null ? "—" : formatMoney(minor, cur));

export default async function TreatmentsAdmin() {
  await requirePageStaff("treatments:manage");
  const treatments = await prisma.treatment.findMany({
    orderBy: { sortOrder: "asc" },
    include: { priceVersions: { orderBy: { version: "desc" } }, comparisonPrices: { orderBy: [{ market: "asc" }, { checkedAt: "desc" }] } },
  });
  const users = Object.fromEntries((await prisma.staffUser.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Treatments & prices" sub="Draft → Approved → Published. Only the published version inside its effective window is shown on the website and to the AI assistant. Published versions cannot be edited — create a new version." />
      <div className="space-y-4">
        {treatments.map((t) => {
          const live = currentPublished(t.priceVersions);
          return (
            <Card key={t.id} title={`${t.nameEn} / ${t.nameTr}`} actions={<span className="flex gap-1">{!t.approved && <Badge tone="warn">content not approved</Badge>}{live ? <Badge tone="good">live v{live.version}</Badge> : <Badge>no live price</Badge>}</span>}>
              <p className="mb-3 text-xs text-muted">{t.summaryEn}</p>
              {t.priceVersions.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-xs">
                    <thead><tr><th className={th}>v</th><th className={th}>Status</th><th className={th}>Price</th><th className={th}>Effective</th><th className={th}>Incl. / excl.</th><th className={th}>Approved by</th><th className={th} /></tr></thead>
                    <tbody className="divide-y divide-forest/5">
                      {t.priceVersions.map((v) => (
                        <tr key={v.id}>
                          <td className={td}>{v.version}</td>
                          <td className={td}><Badge tone={v.status === "PUBLISHED" ? "good" : v.status === "ARCHIVED" ? "default" : "warn"}>{v.status.toLowerCase()}</Badge></td>
                          <td className={td}>{v.amountMinor != null ? money(v.amountMinor, v.currency) : `${money(v.minMinor, v.currency)} – ${money(v.maxMinor, v.currency)}`}</td>
                          <td className={td}>{fmt(v.effectiveFrom, "date")} → {v.effectiveTo ? fmt(v.effectiveTo, "date") : "open"}</td>
                          <td className={td}>{v.inclusions ?? "—"} / {v.exclusions ?? "—"}</td>
                          <td className={td}>{v.approvedById ? `${users[v.approvedById]} · ${fmt(v.approvedAt, "date")}` : "—"}</td>
                          <td className={td}>
                            <span className="flex gap-1">
                              {v.status === "DRAFT" && <ActionButton url={`/api/admin/price-versions/${v.id}/approve`} label="Approve" />}
                              {v.status === "APPROVED" && <ActionButton url={`/api/admin/price-versions/${v.id}/publish`} label="Publish" variant="primary" confirm="Publish this price to the website and AI assistant?" />}
                              {v.status !== "ARCHIVED" && <ActionButton url={`/api/admin/price-versions/${v.id}/archive`} label="Archive" variant="danger" />}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <PriceDraftForm treatmentId={t.id} />

              <div className="mt-4 border-t border-forest/10 pt-3">
                <p className="text-xs font-semibold text-ink">Reference prices in other countries (used by the AI coordinator&apos;s comparison cards)</p>
                {t.comparisonPrices.length === 0 ? (
                  <p className="mt-1 text-xs text-muted">None yet — the coordinator will say no sourced comparison is available rather than guess.</p>
                ) : (
                  <table className="mt-2 w-full text-xs">
                    <thead><tr><th className={th}>Market</th><th className={th}>Typical range</th><th className={th}>Source</th><th className={th}>Checked</th><th className={th}>Status</th><th className={th} /></tr></thead>
                    <tbody className="divide-y divide-forest/5">
                      {t.comparisonPrices.map((c) => (
                        <tr key={c.id}>
                          <td className={td}>{c.marketLabel} ({c.market})</td>
                          <td className={td}>{money(c.minMinor, c.currency)} – {money(c.maxMinor, c.currency)}{live && live.currency !== c.currency && <span className="block text-danger">Currency differs from clinic price: no saving shown</span>}</td>
                          <td className={td}>{c.sourceUrl ? <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{c.sourceName}</a> : c.sourceName}</td>
                          <td className={td}>{fmt(c.checkedAt, "date")}</td>
                          <td className={td}><Badge tone={c.status === "PUBLISHED" ? "good" : "warn"}>{c.status.toLowerCase()}</Badge></td>
                          <td className={td}>
                            {c.status === "DRAFT"
                              ? <ActionButton url={`/api/admin/comparison-prices/${c.id}/publish`} label="Publish" variant="primary" confirm="Publish this sourced comparison to visitors and the AI coordinator?" />
                              : <ActionButton url={`/api/admin/comparison-prices/${c.id}/unpublish`} label="Unpublish" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <ComparisonForm treatmentId={t.id} />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
