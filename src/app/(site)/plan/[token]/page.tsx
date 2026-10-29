import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSetting } from "@/lib/settings";
import { formatMoney, planByToken, planTotals } from "@/lib/services/plans";
import { whatsappLink } from "@/lib/whatsapp";
import { Logo } from "@/components/site/chrome";
import { AcceptPlanButton, PrintButton } from "./accept-button";

export const metadata: Metadata = { title: "Your treatment plan", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** The patient's private plan (link sent by the clinic). Printable; never indexed. */
export default async function PlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const plan = await planByToken(token);
  if (!plan) notFound();
  const clinic = await getSetting("clinic_info");
  const tr = plan.lead.language === "tr";
  const locale = tr ? "tr-TR" : "en-GB";
  const totals = Object.entries(planTotals(plan.items));
  const date = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: process.env.CLINIC_TIMEZONE || "Europe/Istanbul" }).format(d);
  const wa = whatsappLink(clinic.whatsapp, tr ? `Merhaba, tedavi planım hakkında (${plan.publicId})` : `Hi, about my treatment plan (${plan.publicId})`);

  return (
    <div className="min-h-dvh bg-[#f3f2ec] px-4 pb-24 pt-28 print:bg-white print:p-0 sm:pt-36">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-[28px] bg-white shadow-[0_40px_90px_-40px_rgba(20,35,28,0.45)] ring-1 ring-forest/[0.06] print:rounded-none print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-end justify-between gap-6 bg-forest px-8 py-8 text-ivory print:bg-white print:px-0 print:text-forest sm:px-10">
          <div>
            <Logo />
            <h1 className="display mt-6 text-4xl">{tr ? "Tedavi planınız" : "Your treatment plan"}</h1>
            <p className="mt-2 text-sm text-ivory/70 print:text-muted">{tr ? `Hazırlanan: ${plan.lead.fullName}` : `Prepared for ${plan.lead.fullName}`}</p>
          </div>
          <dl className="text-right text-xs text-ivory/70 print:text-muted">
            <div><dt className="inline">{tr ? "Plan no: " : "Plan: "}</dt><dd className="inline font-mono text-ivory print:text-forest">{plan.publicId}</dd></div>
            {plan.sentAt && <div className="mt-1"><dt className="inline">{tr ? "Tarih: " : "Date: "}</dt><dd className="inline">{date(plan.sentAt)}</dd></div>}
            {plan.validUntil && <div className="mt-1"><dt className="inline">{tr ? "Geçerlilik: " : "Valid until: "}</dt><dd className="inline">{date(plan.validUntil)}</dd></div>}
          </dl>
        </header>

        <div className="px-8 py-8 sm:px-10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forest/10 text-left text-[11px] uppercase tracking-[0.14em] text-muted">
                <th className="pb-3 font-semibold">{tr ? "Tedavi" : "Treatment"}</th>
                <th className="pb-3 text-center font-semibold">{tr ? "Adet" : "Qty"}</th>
                <th className="pb-3 text-right font-semibold">{tr ? "Birim" : "Each"}</th>
                <th className="pb-3 text-right font-semibold">{tr ? "Tutar" : "Amount"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-forest/[0.06]">
              {plan.items.map((i, n) => (
                <tr key={n}>
                  <td className="py-4 pr-3"><p className="font-medium text-ink">{i.treatment}</p>{i.area && <p className="text-xs text-muted">{i.area}</p>}</td>
                  <td className="py-4 text-center tabular-nums">{i.qty}</td>
                  <td className="py-4 text-right tabular-nums text-muted">{formatMoney(i.unitMinor, i.currency, locale)}</td>
                  <td className="py-4 text-right font-medium tabular-nums">{formatMoney(i.unitMinor * i.qty, i.currency, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex justify-end">
            <dl className="min-w-56 space-y-1 rounded-2xl bg-sage-50 px-5 py-4 print:bg-white">
              {totals.map(([cur, minor]) => (
                <div key={cur} className="flex items-baseline justify-between gap-6">
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted">{tr ? "Tahmini toplam" : "Estimated total"}</dt>
                  <dd className="font-display text-3xl text-forest">{formatMoney(minor, cur, locale)}</dd>
                </div>
              ))}
            </dl>
          </div>

          {plan.notes && (
            <section className="mt-8">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-forest/60">{tr ? "Diş hekiminin notu" : "Note from the dentist"}</h2>
              <p className="mt-3 whitespace-pre-wrap leading-relaxed text-ink/85">{plan.notes}</p>
            </section>
          )}

          <p className="mt-8 rounded-2xl border border-gold/30 bg-gold/10 px-5 py-4 text-sm leading-relaxed text-ink/80">
            {tr
              ? "Bu plan, gönderdiğiniz görüntülere dayalı bir ön değerlendirmedir ve kesin bir teklif değildir. Nihai tedavi ve fiyat, klinikte yapılacak muayeneden sonra belirlenir."
              : "This plan is an estimate based on the images you sent and is not a final quote. Your final treatment and price are confirmed after an examination at the clinic."}
          </p>

          <div className="mt-8 flex flex-wrap gap-3 print:hidden">
            <AcceptPlanButton token={token} treatment={plan.treatmentSlug} label={tr ? "Muayene randevusu al" : "Book a consultation"} />
            <PrintButton label={tr ? "PDF indir / yazdır" : "Download PDF / print"} />
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-2xl bg-[#25d366] px-6 py-4 font-medium text-white transition hover:bg-[#1fb857]">
                WhatsApp
              </a>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
