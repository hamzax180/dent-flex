import Link from "next/link";
import { getDict } from "@/lib/i18n";
import { getSetting } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { getPublicTreatments, describePrice } from "@/lib/services/pricing";
import { Arrow, Btn, LineIcon } from "@/components/site/chrome";
import { SiteImage } from "@/components/site/site-image";
import { HeroFilm } from "@/components/site/hero-film";
import { TeamPhoto } from "@/components/site/team-photo";
import { SlideRow } from "@/components/site/slide-row";

const APART_ICONS = ["talk", "price", "globe", "person"];

export default async function Home() {
  const { t, lang } = await getDict();
  const h = t.home;
  const [clinic, treatments, faqs, team] = await Promise.all([
    getSetting("clinic_info"),
    getPublicTreatments(),
    prisma.faq.findMany({ where: { status: "PUBLISHED" }, orderBy: { sortOrder: "asc" } }),
    prisma.teamMember.findMany({ where: { status: "PUBLISHED" }, orderBy: { sortOrder: "asc" }, take: 2 }),
  ]);

  return (
    <>
      {/* ─── Hero: full-bleed image, dark wash, light display type ─── */}
      <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-black md:items-center">
        <HeroFilm />
        <div className="hero-copy mx-auto w-full max-w-7xl px-6 pb-28 pt-36 sm:px-10 md:pb-16">
          <p className="eyebrow text-sage">{t.hero.eyebrow}</p>
          <h1 className="display mt-5 max-w-4xl text-[2.6rem] text-ivory [text-shadow:0_2px_30px_rgba(0,0,0,0.35)] sm:text-6xl lg:text-[4.25rem]">{t.hero.title}</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ivory/90">{t.hero.body}</p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Btn href="/contact#request" arrow>{t.hero.primary}</Btn>
            <Btn href="#faq" variant="outline-light">{t.hero.secondary}</Btn>
          </div>
        </div>
      </section>

      {/* ─── Intro + split feature card ─── */}
      <section className="px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
        <div className="reveal mx-auto max-w-3xl text-center">
          <h2 className="display text-4xl text-forest sm:text-[3.25rem]">{h.introTitle}</h2>
          <p className="mx-auto mt-6 max-w-2xl leading-relaxed text-muted">{h.introBody}</p>
        </div>
        <div className="reveal mx-auto mt-10 grid max-w-6xl sm:mt-16 lg:grid-cols-2">
          <div className="relative">
            <SiteImage name="reception" className="aspect-[4/3] h-full w-full lg:aspect-auto lg:min-h-[520px]" />
            <div className="absolute bottom-4 left-4 bg-white px-4 py-3 shadow-lg sm:bottom-6 sm:left-6 sm:px-6 sm:py-5">
              <p className="display text-2xl text-forest sm:text-3xl">{h.statValue}</p>
              <p className="mt-1 text-sm text-muted">{h.statLabel}</p>
            </div>
          </div>
          <div className="flex flex-col justify-center bg-ivory px-6 py-10 sm:px-14 sm:py-14">
            <h3 className="display text-3xl text-forest sm:text-4xl">{h.splitTitle}</h3>
            <p className="mt-5 leading-relaxed text-ink/80 sm:mt-6">{h.splitBody}</p>
            <div className="mt-8 sm:mt-10"><Btn href="#visit" variant="dark" className="!px-6 !py-3 text-xs uppercase tracking-[0.14em]">{h.splitCta}</Btn></div>
          </div>
        </div>
      </section>

      {/* ─── Team on dark green ─── */}
      <section className="bg-forest px-4 py-24 text-ivory sm:px-6 lg:py-32">
        <div className="reveal mx-auto max-w-3xl text-center">
          <h2 className="display text-4xl sm:text-[3.25rem]">
            {h.teamTitleA}
            <br />
            <em className="font-light italic text-sage">{h.teamTitleB}</em>
          </h2>
          <p className="mx-auto mt-6 max-w-xl leading-relaxed text-ivory/75">{h.teamBody}</p>
        </div>
        <SlideRow label={h.teamTitleA + " " + h.teamTitleB} tone="dark" dotsClassName="sm:hidden" className="no-scrollbar -mx-4 mt-10 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:mx-auto sm:scroll-px-0 sm:mt-16 sm:grid sm:max-w-5xl sm:grid-cols-2 sm:gap-8 sm:overflow-visible sm:px-0">
          {(team.length ? team : [null, null]).map((m, i) => (
            <figure key={m?.id ?? i} className={`reveal w-[72%] shrink-0 snap-start sm:w-auto ${i === 1 ? "sm:mt-24" : ""}`}>
              <TeamPhoto name={m?.name ?? ""} photoUrl={m?.photoUrl} isPlaceholder={m?.isPlaceholder ?? true} placeholderLabel={t.team.placeholder} className="aspect-[4/5]" />
              <figcaption className="mt-4 sm:mt-5">
                <p className="display text-xl sm:text-2xl">{m?.name ?? t.team.placeholder}</p>
                <p className="mt-1 text-sm text-sage">{m?.title ?? "—"}</p>
              </figcaption>
            </figure>
          ))}
        </SlideRow>
        <div className="mt-10 text-center sm:mt-14"><Btn href="/team" variant="outline-light" arrow>{t.nav.team}</Btn></div>
      </section>

      {/* ─── Treatments: heading left, tile grid right ─── */}
      <section className="px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_2.2fr] lg:gap-12">
          <div className="reveal">
            <h2 className="display text-4xl text-forest sm:text-[3.25rem]">{h.servicesTitle}</h2>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">{t.treatments.intro}</p>
            <div className="mt-8"><Btn href="/treatments" arrow className="!py-2.5 text-sm">{h.servicesCta}</Btn></div>
          </div>
          {treatments.length === 0 ? (
            <p className="text-muted">{t.treatments.empty}</p>
          ) : (
            <ul className="reveal grid gap-2 sm:grid-cols-2 sm:gap-3 md:grid-cols-3">
              {treatments.slice(0, 6).map((tr, i) => (
                <li key={tr.slug}>
                  <Link
                    href={`/treatments#${tr.slug}`}
                    className={`group flex items-center gap-4 border px-4 py-4 transition-colors sm:aspect-square sm:flex-col sm:items-stretch sm:justify-between sm:p-6 ${i === 3 ? "border-forest bg-forest text-ivory" : "border-forest/15 bg-white text-forest hover:border-forest hover:bg-forest hover:text-ivory"}`}
                  >
                    <LineIcon name={tr.slug} className="size-6 shrink-0 opacity-80 sm:size-7" />
                    <span className="min-w-0 flex-1">
                      <span className="display block text-lg leading-tight sm:text-2xl">{tr.name[lang]}</span>
                      <span className={`mt-1 block text-xs sm:mt-2 ${i === 3 ? "text-sage" : "text-muted group-hover:text-sage"}`}>
                        {tr.price ? describePrice(tr.price, lang) : t.treatments.noPrice}
                      </span>
                    </span>
                    <span className="opacity-60 sm:hidden"><Arrow /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ─── Patient stories: genuine reviews only ─── */}
      <section className="px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="reveal display text-4xl text-forest sm:text-[3.25rem]">{h.reviewsTitle}</h2>
          <div className="reveal mt-10 border border-dashed border-forest/25 bg-ivory/60 px-8 py-12 text-center">
            <p className="text-forest/60" aria-hidden>☆ ☆ ☆ ☆ ☆</p>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted">{t.testimonials.placeholder}</p>
          </div>
        </div>
      </section>

      {/* ─── Pricing band (dark) ─── */}
      <section className="relative overflow-hidden bg-forest px-4 py-16 text-center text-ivory sm:px-6 sm:py-24">
        <div aria-hidden className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "repeating-linear-gradient(90deg, #f5f1e8 0 1px, transparent 1px 96px)" }} />
        <div className="reveal relative mx-auto max-w-2xl">
          <h2 className="display text-4xl tracking-[0.02em] sm:text-[3.25rem]">{h.pricingTitle}</h2>
          <p className="mt-6 leading-relaxed text-ivory/80">{h.pricingBody}</p>
          <div className="mt-10"><Btn href="/treatments" arrow>{h.pricingCta}</Btn></div>
        </div>
      </section>

      {/* ─── Wide image strip ─── */}
      <SiteImage name="detail" sizes="100vw" className="h-52 sm:h-[420px]" />

      {/* ─── Comfort: heading left, text right, large image ─── */}
      <section id="visit" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
        <div className="reveal mx-auto grid max-w-6xl gap-8 md:grid-cols-2 md:items-end">
          <h2 className="display text-4xl text-forest sm:text-[3.25rem]">
            {h.comfortTitleA}
            <br />
            {h.comfortTitleB}
          </h2>
          <p className="leading-relaxed text-muted">{h.comfortBody}</p>
        </div>
        <div className="reveal mx-auto mt-8 max-w-6xl sm:mt-14">
          <SiteImage name="treatment-room" sizes="(min-width: 1152px) 1152px, 100vw" className="aspect-[4/3] sm:aspect-[16/9]" />
        </div>
        <ol className="mx-auto mt-8 grid max-w-6xl gap-px bg-forest/10 sm:mt-16 sm:grid-cols-2 lg:grid-cols-4">
          {t.comfort.steps.map(([title, body], i) => (
            <li key={title} className="reveal flex gap-4 bg-white px-1 py-5 sm:block sm:p-7">
              <span className="display w-10 shrink-0 text-3xl text-sage sm:w-auto sm:text-4xl">0{i + 1}</span>
              <div>
                <h3 className="font-medium text-forest sm:mt-4">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted sm:mt-2">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ─── What sets us apart (dark, bordered cards) ─── */}
      <section className="bg-forest px-4 py-24 text-ivory sm:px-6 lg:py-32">
        <div className="mx-auto max-w-6xl">
          <div className="reveal flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <h2 className="display text-4xl sm:text-[3.25rem]">{h.apartTitle}</h2>
              <p className="mt-5 leading-relaxed text-ivory/75">{h.apartBody}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Btn href="/contact#request" className="!py-2.5 text-xs uppercase tracking-[0.14em]">{t.nav.book}</Btn>
              <Btn href="/treatments" variant="outline-light" className="!py-2.5 text-xs uppercase tracking-[0.14em]">{t.nav.treatments}</Btn>
            </div>
          </div>
          <SlideRow as="ul" label={h.apartTitle} tone="dark" dotsClassName="md:hidden" className="no-scrollbar -mx-4 mt-10 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:scroll-px-0 md:mt-14 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0">
            {h.apart.map(([title, body], i) => (
              <li key={title} className="reveal w-[80%] shrink-0 snap-start border border-ivory/20 bg-ivory/[0.03] p-6 transition-colors hover:bg-ivory/[0.07] md:w-auto md:p-8">
                <LineIcon name={APART_ICONS[i]} className="size-7 text-sage" />
                <h3 className="display mt-5 text-xl md:mt-6 md:text-2xl">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ivory/75">{body}</p>
              </li>
            ))}
          </SlideRow>
        </div>
      </section>

      {/* ─── FAQ: heading left, accordion right ─── */}
      <section id="faq" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.6fr]">
          <div className="reveal">
            <h2 className="display text-4xl text-forest sm:text-[3.25rem]">{h.faqTitleA}<br />{h.faqTitleB}</h2>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted">{h.faqBody}</p>
            <div className="mt-8"><Btn href="/contact#request" variant="outline-dark" arrow className="!py-2.5 text-sm">{t.nav.contact}</Btn></div>
          </div>
          {faqs.length === 0 ? (
            <p className="text-muted">{t.faq.empty}</p>
          ) : (
            <div className="reveal border-t border-forest/15">
              {faqs.map((q, i) => (
                <details key={q.id} open={i === 0} className="group border-b border-forest/15">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base text-forest sm:gap-6 sm:py-6 sm:text-lg">
                    {lang === "tr" ? q.questionTr : q.questionEn}
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0 transition-transform group-open:rotate-180"><path d="M1 4.5l6 6 6-6" stroke="currentColor" strokeWidth="1.3" fill="none" /></svg>
                  </summary>
                  <p className="pb-5 pr-6 text-sm leading-relaxed text-muted sm:pb-6 sm:pr-10">{lang === "tr" ? q.answerTr : q.answerEn}</p>
                </details>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── Visit us ─── */}
      <section className="bg-ivory px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
          <div className="reveal">
            <h2 className="display text-4xl text-forest sm:text-[3.25rem]">{h.visitTitle}</h2>
            {clinic.isPlaceholder && <p className="mt-4 bg-white/70 px-4 py-3 text-xs text-ink">{t.contact.placeholder}</p>}
            <div className="mt-6 flex items-start gap-4 bg-white p-5 sm:mt-8 sm:p-6">
              <LineIcon name="pin" className="mt-0.5 size-5 shrink-0 text-forest" />
              <div>
                <p className="display text-xl text-forest">{clinic.city}</p>
                <p className="mt-1 text-sm text-muted">{clinic.addressLines.join(", ")}</p>
                {clinic.mapUrl && <a href={clinic.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-forest underline">{h.directions} ↗</a>}
              </div>
            </div>
            <div className="mt-8 grid gap-8 sm:grid-cols-2">
              <div>
                <p className="eyebrow text-[0.7rem] text-muted">{t.nav.contact}</p>
                <p className="mt-3 text-sm text-ink">{clinic.phone}<br />{clinic.email}</p>
              </div>
              <div>
                <p className="eyebrow text-[0.7rem] text-muted">{t.contact.hours}</p>
                <table className="mt-3 text-sm">
                  <tbody>
                    {clinic.hours.map((x) => (
                      <tr key={x.day}><th scope="row" className="pr-6 text-left font-normal text-muted">{x.day}</th><td>{[x.open, x.close].filter(Boolean).join(" – ")}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <SiteImage name="entrance" className="reveal aspect-[16/10] lg:aspect-[5/6]" />
        </div>
      </section>

      {/* ─── Closing band ─── */}
      <section className="bg-forest px-4 py-16 text-center text-ivory sm:px-6 sm:py-24">
        <div className="reveal mx-auto max-w-2xl">
          <h2 className="display text-4xl sm:text-[3.25rem]">{h.closingTitle}</h2>
          <p className="mt-6 leading-relaxed text-ivory/80">{h.closingBody}</p>
          <Link href="/contact#request" className="mt-10 inline-flex items-center gap-3 bg-sage px-7 py-3 font-medium text-forest hover:bg-[#cdd3b6]">
            {t.hero.primary} <Arrow />
          </Link>
        </div>
      </section>
    </>
  );
}
