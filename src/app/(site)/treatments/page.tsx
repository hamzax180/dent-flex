import Link from "next/link";
import type { Metadata } from "next";
import { getDict } from "@/lib/i18n";
import { getPublicTreatments, describePrice } from "@/lib/services/pricing";
import { SectionHeading } from "@/components/site/chrome";

export const metadata: Metadata = { title: "Treatments" };

export default async function TreatmentsPage() {
  const { t, lang } = await getDict();
  const treatments = await getPublicTreatments();
  return (
    <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
      <SectionHeading eyebrow="Dent Flex" title={t.treatments.title} intro={t.treatments.intro} />
      {treatments.length === 0 && <p className="mt-10 text-muted">{t.treatments.empty}</p>}
      <div className="mt-12 divide-y divide-forest/10 border-y border-forest/10">
        {treatments.map((tr) => (
          <article key={tr.slug} id={tr.slug} className="grid scroll-mt-24 gap-4 py-10 md:grid-cols-[1fr_1.4fr_auto] md:items-start">
            <h2 className="display text-3xl text-forest">{tr.name[lang]}</h2>
            <div>
              <p className="leading-relaxed text-muted">{tr.summary[lang]}</p>
              {tr.price && (tr.price.inclusions || tr.price.exclusions) && (
                <dl className="mt-4 space-y-1 text-sm">
                  {tr.price.inclusions && (
                    <div><dt className="inline font-medium">{lang === "tr" ? "Dahil: " : "Includes: "}</dt><dd className="inline text-muted">{tr.price.inclusions}</dd></div>
                  )}
                  {tr.price.exclusions && (
                    <div><dt className="inline font-medium">{lang === "tr" ? "Hariç: " : "Excludes: "}</dt><dd className="inline text-muted">{tr.price.exclusions}</dd></div>
                  )}
                </dl>
              )}
              <p className="mt-3 text-xs text-muted">
                {lang === "tr"
                  ? "Kesin tedavi planı ve fiyat yalnızca muayeneden sonra belirlenir."
                  : "A final treatment plan and price are only set after an examination."}
              </p>
            </div>
            <div className="md:text-right">
              <p className="font-medium text-ink">{tr.price ? describePrice(tr.price, lang) : t.treatments.noPrice}</p>
              <Link href={`/contact?treatment=${tr.slug}#request`} className="mt-3 inline-block border border-forest/30 px-5 py-2 text-sm text-forest hover:bg-sage-50">
                {t.treatments.details}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
