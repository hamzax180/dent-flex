import type { Metadata } from "next";
import { getDict } from "@/lib/i18n";
import { getSetting } from "@/lib/settings";
import { getPublicTreatments } from "@/lib/services/pricing";
import { LeadForm } from "@/components/site/lead-form";
import { ContactBlock } from "@/components/site/contact-block";

export const metadata: Metadata = { title: "Contact & appointment request" };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ treatment?: string }> }) {
  const { t, lang } = await getDict();
  const [clinic, treatments, sp] = await Promise.all([getSetting("clinic_info"), getPublicTreatments(), searchParams]);
  const preselect = treatments.some((x) => x.slug === sp.treatment) ? sp.treatment : undefined;
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
      <ContactBlock t={t} clinic={clinic} />
      <div id="request" className="scroll-mt-24 border border-forest/10 bg-white/60 p-6 sm:p-8">
        <h1 className="display text-4xl text-forest">{t.form.title}</h1>
        <div className="mt-6">
          <LeadForm t={t} lang={lang} defaultTreatment={preselect} treatments={treatments.map((x) => ({ slug: x.slug, name: x.name[lang] }))} />
        </div>
      </div>
    </div>
  );
}
