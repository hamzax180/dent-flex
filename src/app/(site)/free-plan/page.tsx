import type { Metadata } from "next";
import Image from "next/image";
import { getDict } from "@/lib/i18n";
import { getPublicTreatments } from "@/lib/services/pricing";
import { FreePlanForm } from "@/components/site/free-plan-form";
import { IMAGES } from "@/components/site/site-image";

export const metadata: Metadata = { title: "Free treatment plan" };

const WHY = {
  en: [
    ["Reviewed by a dentist", "Your images are seen by our dental team, not an algorithm."],
    ["A written, itemised plan", "What we'd suggest, the stages, and an estimate for each part."],
    ["No obligation", "Take your time. Book a consultation only if it feels right."],
  ],
  tr: [
    ["Diş hekimi inceler", "Görüntülerinizi bir algoritma değil, diş hekimimiz değerlendirir."],
    ["Yazılı, kalem kalem plan", "Önerilerimiz, aşamalar ve her biri için tahmini maliyet."],
    ["Yükümlülük yok", "Acele etmeyin. Uygun gelirse muayene randevusu alın."],
  ],
} as const;

export default async function FreePlanPage({ searchParams }: { searchParams: Promise<{ treatment?: string }> }) {
  const { t, lang } = await getDict();
  const [treatments, sp] = await Promise.all([getPublicTreatments(), searchParams]);
  const preselect = treatments.some((x) => x.slug === sp.treatment) ? sp.treatment : undefined;
  const tr = lang === "tr";
  return (
    <div className="pb-24">
      <section className="relative isolate overflow-hidden bg-forest pb-40 pt-36 text-ivory sm:pt-40">
        <Image src={IMAGES["treatment-room"].src} alt="" fill priority placeholder="blur" sizes="100vw" className="-z-10 object-cover opacity-40" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-forest/70 via-forest/60 to-forest" />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="eyebrow text-xs text-sage">Dent Flex · {tr ? "Ücretsiz plan" : "Free plan"}</p>
          <h1 className="display mt-4 max-w-3xl text-5xl leading-[1.05] sm:text-6xl">{tr ? "Ücretsiz tedavi planınızı alın" : "Get your free treatment plan"}</h1>
          <p className="mt-5 max-w-xl text-lg text-ivory/75">
            {tr ? "Röntgeninizi veya gülüş fotoğraflarınızı gönderin; diş hekimimiz size özel yazılı bir plan hazırlasın." : "Send your X-ray or smile photos and our dentist will prepare a written plan just for you."}
          </p>
        </div>
      </section>

      <div className="relative mx-auto -mt-28 grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.45fr_1fr]">
        <div className="rounded-[28px] bg-[#fbfaf6] p-6 shadow-[0_40px_90px_-40px_rgba(20,35,28,0.55)] ring-1 ring-forest/[0.06] sm:p-10">
          <FreePlanForm t={t} lang={lang} defaultTreatment={preselect} treatments={treatments.map((x) => ({ slug: x.slug, name: x.name[lang] }))} />
        </div>
        <aside className="space-y-6 lg:pt-4">
          <div className="rounded-[28px] bg-forest p-7 text-ivory shadow-[0_30px_70px_-40px_rgba(20,35,28,0.8)]">
            <p className="eyebrow text-[11px] text-sage">{tr ? "Neden ücretsiz plan?" : "Why a free plan?"}</p>
            <ul className="mt-6 space-y-5">
              {WHY[lang].map(([title, body]) => (
                <li key={title} className="flex gap-4">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-sage text-forest">
                    <svg viewBox="0 0 24 24" className="size-4" aria-hidden><path d="M5 12.5 10 17.5 19 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ivory/65">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="rounded-[28px] border border-forest/10 bg-white/70 p-6 text-sm leading-relaxed text-muted">
            {tr
              ? "Plan, gönderdiğiniz görüntülere dayalı bir ön değerlendirmedir. Kesin tedavi ve fiyat, klinikte yapılan muayeneden sonra belirlenir. Acil durumlarda 112'yi arayın."
              : "The plan is an estimate based on the images you send. Your final treatment and price are confirmed after an examination at the clinic. In an emergency, call 112."}
          </p>
        </aside>
      </div>
    </div>
  );
}
