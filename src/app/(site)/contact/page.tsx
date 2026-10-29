import type { Metadata } from "next";
import Image from "next/image";
import { getDict } from "@/lib/i18n";
import { getSetting } from "@/lib/settings";
import { getPublicTreatments } from "@/lib/services/pricing";
import { LeadForm } from "@/components/site/lead-form";
import { ContactBlock } from "@/components/site/contact-block";
import { IMAGES } from "@/components/site/site-image";

export const metadata: Metadata = { title: "Contact & appointment request" };

const STEPS = {
  en: [
    ["Send your request", "Takes about a minute. No account, no payment."],
    ["We get in touch", "A coordinator calls or messages you, usually within one working day."],
    ["Pick a time", "We agree a consultation slot that suits you."],
    ["Your consultation", "The dentist examines you and explains your options and price."],
  ],
  tr: [
    ["Talebinizi gönderin", "Yaklaşık bir dakika sürer. Hesap veya ödeme yok."],
    ["Size ulaşırız", "Bir danışmanımız genellikle bir iş günü içinde sizi arar veya mesaj atar."],
    ["Saat belirleyin", "Size uygun bir muayene saati ayarlarız."],
    ["Muayeneniz", "Diş hekimi sizi muayene eder, seçenekleri ve fiyatı açıklar."],
  ],
} as const;

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ treatment?: string }> }) {
  const { t, lang } = await getDict();
  const [clinic, treatments, sp] = await Promise.all([getSetting("clinic_info"), getPublicTreatments(), searchParams]);
  const preselect = treatments.some((x) => x.slug === sp.treatment) ? sp.treatment : undefined;
  const tr = lang === "tr";

  return (
    <div className="pb-24">
      {/* Photo header */}
      <section className="relative isolate overflow-hidden bg-forest pb-40 pt-36 text-ivory sm:pt-40">
        <Image src={IMAGES.reception.src} alt="" fill priority placeholder="blur" sizes="100vw" className="-z-10 object-cover opacity-45" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-forest/70 via-forest/60 to-forest" />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="eyebrow text-xs text-sage">Dent Flex · {tr ? "Randevu" : "Appointments"}</p>
          <h1 className="display mt-4 max-w-2xl text-5xl leading-[1.05] sm:text-6xl">{t.form.title}</h1>
          <p className="mt-5 max-w-xl text-lg text-ivory/75">
            {tr ? "Birkaç soruyu yanıtlayın; ekibimiz size ulaşıp uygun bir saat ayarlasın." : "Answer a few quick questions and our team will reach out to find a time that suits you."}
          </p>
        </div>
      </section>

      <div className="relative mx-auto -mt-28 grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.45fr_1fr]">
        {/* Form card */}
        <div id="request" className="scroll-mt-28 rounded-[28px] bg-[#fbfaf6] p-6 shadow-[0_40px_90px_-40px_rgba(20,35,28,0.55)] ring-1 ring-forest/[0.06] sm:p-10">
          <LeadForm t={t} lang={lang} defaultTreatment={preselect} treatments={treatments.map((x) => ({ slug: x.slug, name: x.name[lang] }))} />
        </div>

        {/* Side column */}
        <aside className="space-y-6 lg:pt-4">
          <div className="rounded-[28px] bg-forest p-7 text-ivory shadow-[0_30px_70px_-40px_rgba(20,35,28,0.8)]">
            <p className="eyebrow text-[11px] text-sage">{tr ? "Nasıl işler" : "How it works"}</p>
            <ol className="relative mt-6 space-y-6 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-ivory/15">
              {STEPS[lang].map(([title, body], i) => (
                <li key={title} className="relative flex gap-4">
                  <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-sage font-display text-sm text-forest">{i + 1}</span>
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ivory/65">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-[28px] border border-forest/10 bg-white/70 p-7">
            <ContactBlock t={t} clinic={clinic} />
          </div>
        </aside>
      </div>
    </div>
  );
}
