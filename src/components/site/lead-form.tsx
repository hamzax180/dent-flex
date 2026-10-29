"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { leadInputSchema } from "@/lib/validation/lead";
import type { Dict, Lang } from "@/lib/i18n";

type TreatmentOption = { slug: string; name: string };

const field =
  "w-full rounded-2xl border border-forest/12 bg-white py-4 pl-12 pr-4 text-[15px] text-ink shadow-[0_1px_2px_rgba(31,51,41,0.04)] transition placeholder:text-muted/55 focus:border-forest focus:outline-none focus:ring-4 focus:ring-forest/10 aria-[invalid=true]:border-danger";

const COPY = {
  en: {
    steps: ["Treatment", "Timing", "Your details", "Review"],
    q: ["What would you like help with?", "When would you like to come in?", "How can we reach you?", "Almost done"],
    sub: [
      "Pick one. Not sure? That's fine, the dentist will advise.",
      "No commitment. This just helps us offer the right times.",
      "We'll only use these to arrange your visit.",
      "Check your request, then send it to our team.",
    ],
    when: [["asap", "As soon as possible", "I'd like the first free slot"], ["2w", "Within 2 weeks", "Soon, but I'm flexible"], ["month", "This month", "Sometime in the next few weeks"], ["explore", "Just exploring", "I want information first"]],
    times: ["Mornings", "Afternoons", "Evenings", "Any time"],
    timeLabel: "Best time to reach you",
    channelLabel: "Contact me by",
    langLabel: "Language",
    back: "Back", next: "Continue", edit: "Edit",
    needContact: "Please add your name and a phone number or email.",
    summary: ["Treatment", "Timing", "Name", "Contact"],
    none: "Not specified",
    secure: "Private & secure",
    reply: "Reply within one working day",
    nextTitle: "What happens next",
    next3: ["Our team calls or messages you", "We agree a time that suits you", "You come in for your consultation"],
    another: "Send another request",
    stepOf: (a: number, b: number) => `Step ${a} of ${b}`,
  },
  tr: {
    steps: ["Tedavi", "Zaman", "Bilgileriniz", "Özet"],
    q: ["Hangi konuda yardım istersiniz?", "Ne zaman gelmek istersiniz?", "Size nasıl ulaşalım?", "Neredeyse bitti"],
    sub: [
      "Birini seçin. Emin değilseniz sorun değil, hekimimiz yönlendirir.",
      "Bağlayıcı değil. Size uygun saatleri önermemize yardımcı olur.",
      "Bu bilgileri yalnızca randevunuzu ayarlamak için kullanırız.",
      "Talebinizi kontrol edin ve ekibimize gönderin.",
    ],
    when: [["asap", "En kısa sürede", "İlk boş saati isterim"], ["2w", "2 hafta içinde", "Yakında, ama esneğim"], ["month", "Bu ay", "Önümüzdeki birkaç hafta içinde"], ["explore", "Sadece araştırıyorum", "Önce bilgi almak istiyorum"]],
    times: ["Sabah", "Öğleden sonra", "Akşam", "Fark etmez"],
    timeLabel: "Size ulaşmak için en uygun zaman",
    channelLabel: "Bana şuradan ulaşın",
    langLabel: "Dil",
    back: "Geri", next: "Devam", edit: "Düzenle",
    needContact: "Lütfen adınızı ve bir telefon numarası ya da e-posta ekleyin.",
    summary: ["Tedavi", "Zaman", "Ad", "İletişim"],
    none: "Belirtilmedi",
    secure: "Gizli ve güvenli",
    reply: "Bir iş günü içinde dönüş",
    nextTitle: "Sonraki adımlar",
    next3: ["Ekibimiz sizi arar veya mesaj atar", "Size uygun bir saat belirleriz", "Muayeneniz için kliniğe gelirsiniz"],
    another: "Yeni talep gönder",
    stepOf: (a: number, b: number) => `Adım ${a} / ${b}`,
  },
} as const;

const ICONS: Record<string, string> = {
  consultation: "M9 4h6M8 4a2 2 0 0 0-2 2v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a2 2 0 0 0-2-2M9 11h6M9 15h4",
  hygiene: "M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z",
  whitening: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  implants: "M9 3h6l-1 5h-4zM10 8h4v3h-4zM10.5 11h3l-.5 3h-2zM11 14h2v7h-2z",
  veneers: "M8 3.5c-2.5 0-4 1.8-4 4.3 0 2.2.8 3.5 1.4 5.3.6 1.9.6 7.4 2.4 7.4 1.6 0 1.4-4.5 2.6-5.6.4-.4 2.8-.4 3.2 0 1.2 1.1 1 5.6 2.6 5.6 1.8 0 1.8-5.5 2.4-7.4.6-1.8 1.4-3.1 1.4-5.3 0-2.5-1.5-4.3-4-4.3-1.7 0-2.5.9-4 .9s-2.3-.9-4-.9z",
  orthodontics: "M4 9c2.5 2 5.2 3 8 3s5.5-1 8-3M4 15c2.5-2 5.2-3 8-3s5.5 1 8 3M8 10.5v3M12 11v2.5M16 10.5v3",
  "not-sure": "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
};
const TINT: Record<string, string> = {
  consultation: "from-[#eef1e4] to-[#e1e7d2]", hygiene: "from-[#e8f1ef] to-[#d6e6e1]", whitening: "from-[#f6f1e4] to-[#ece2c8]",
  implants: "from-[#ecefe9] to-[#dbe1d6]", veneers: "from-[#f4ede9] to-[#e8dcd4]", orthodontics: "from-[#eaeef3] to-[#d9e0ea]", "not-sure": "from-[#f2f2ee] to-[#e6e6df]",
};
const FIELD_STEP: Record<string, number> = { treatmentSlug: 0, bookingTimeframe: 1, preferredTime: 1, fullName: 2, phone: 2, email: 2, preferredChannel: 2, language: 2, privacyNoticeAccepted: 3, message: 3 };

function Icon({ d, className = "size-5" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden><path d={d} stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
const CHECK = "M5 12.5 10 17.5 19 7.5";

/** A radio input dressed as a pill. */
function Pill({ name, value, children, defaultChecked }: { name: string; value: string; children: React.ReactNode; defaultChecked?: boolean }) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-forest/12 bg-white px-4 py-2.5 text-sm text-forest transition peer-checked:border-forest peer-checked:bg-forest peer-checked:text-ivory peer-checked:shadow-[0_8px_20px_-10px_rgba(31,51,41,0.9)] peer-focus-visible:ring-4 peer-focus-visible:ring-forest/20 hover:border-forest/40">
        {children}
      </span>
    </label>
  );
}

export function LeadForm({ t, lang, treatments, defaultTreatment }: { t: Dict; lang: Lang; treatments: TreatmentOption[]; defaultTreatment?: string }) {
  const f = t.form;
  const c = COPY[lang];
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [vals, setVals] = useState<Record<string, string>>(defaultTreatment ? { treatmentSlug: defaultTreatment } : {});
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [networkError, setNetworkError] = useState(false);
  const [reference, setReference] = useState("");
  const idemKey = useRef<string>("");
  const formRef = useRef<HTMLFormElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const options = [...treatments, { slug: "not-sure", name: f.notSure }];
  const total = 4;

  const read = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    const next: Record<string, string> = {};
    fd.forEach((v, k) => typeof v === "string" && v.trim() && (next[k] = v.trim()));
    setVals(next);
    return next;
  };
  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setStep(to);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const next = () => {
    const v = read() ?? {};
    if (step === 2 && (!v.fullName || !(v.phone || v.email))) {
      setErrors({ _contact: c.needContact });
      return;
    }
    setErrors({});
    go(Math.min(step + 1, total - 1));
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;
    if (step < total - 1) return next();
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => (fd.get(k) as string | null)?.trim() || undefined;
    const params = new URLSearchParams(window.location.search);
    const payload = {
      fullName: str("fullName") ?? "",
      email: str("email") ?? "",
      phone: str("phone") ?? "",
      language: (str("language") as Lang) ?? lang,
      treatmentSlug: str("treatmentSlug"),
      preferredChannel: str("preferredChannel"),
      preferredTime: str("preferredTime"),
      bookingTimeframe: str("bookingTimeframe"),
      appointmentIntent: fd.get("appointmentIntent") === "on",
      nextStepRequested: str("nextStepRequested"),
      message: str("message"),
      privacyNoticeAccepted: fd.get("privacyNoticeAccepted") === "on",
      marketingOptIn: fd.get("marketingOptIn") === "on",
      website: (fd.get("website") as string) ?? "",
      utm: { source: params.get("utm_source") ?? undefined, medium: params.get("utm_medium") ?? undefined, campaign: params.get("utm_campaign") ?? undefined },
    };

    const fail = (errs: Record<string, string>) => {
      setErrors(errs);
      const first = Math.min(...Object.keys(errs).map((k) => FIELD_STEP[k] ?? total - 1));
      if (first !== step) go(first);
    };
    const parsed = leadInputSchema.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join(".")] ??= i.message;
      return fail(errs);
    }
    setErrors({});
    setNetworkError(false);
    setState("sending");
    // One key per logical submission: retries of the same request are deduplicated server-side.
    idemKey.current ||= crypto.randomUUID();
    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idemKey.current },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReference(data.reference);
        setState("done");
        idemKey.current = "";
        return;
      }
      setState("idle");
      if (data?.error?.fields) fail(data.error.fields);
      else setErrors({ _: data?.error?.message ?? f.networkError });
    } catch {
      setState("idle");
      setNetworkError(true);
    }
  }

  if (state === "done") {
    return (
      <div role="status" className="df-rise py-4 text-center">
        <span className="df-pop mx-auto flex size-20 items-center justify-center rounded-full bg-forest text-sage shadow-[0_18px_40px_-14px_rgba(31,51,41,0.7)]">
          <svg viewBox="0 0 24 24" className="size-10" aria-hidden><path d={CHECK} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="df-check" /></svg>
        </span>
        <h3 className="display mt-6 text-3xl text-forest sm:text-4xl">{f.successTitle}</h3>
        <p className="mx-auto mt-3 max-w-md leading-relaxed text-ink/75">{f.successBody.replace("{ref}", reference)}</p>
        <p className="mt-5 inline-flex rounded-full bg-sage-50 px-5 py-2 font-mono text-sm tracking-[0.12em] text-forest ring-1 ring-forest/10">{reference}</p>
        <div className="mx-auto mt-8 max-w-sm rounded-3xl bg-white p-5 text-left ring-1 ring-forest/[0.06]">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-forest/55">{c.nextTitle}</p>
          <ol className="space-y-3.5">
            {c.next3.map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i === 0 ? "bg-forest text-ivory" : "border border-forest/20 text-forest"}`}>{i + 1}</span>
                <span className="text-sm text-ink">{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <button
          type="button"
          onClick={() => {
            setState("idle");
            setStep(0);
            setVals({});
          }}
          className="mt-7 text-sm text-forest underline underline-offset-4"
        >
          {c.another}
        </button>
      </div>
    );
  }

  const err = (k: string) => errors[k];
  const treatmentName = options.find((o) => o.slug === vals.treatmentSlug)?.name;
  const timing = [vals.bookingTimeframe, vals.preferredTime].filter(Boolean).join(" · ");
  const contact = [vals.phone, vals.email].filter(Boolean).join(" · ");
  const errorList = Object.entries(errors).filter(([k]) => k !== "_contact");

  return (
    <form ref={formRef} method="post" onSubmit={onSubmit} onChange={read} noValidate aria-describedby="form-intro">
      <div ref={topRef} className="scroll-mt-28" />

      {/* Progress */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-[0.16em] text-forest/60">{c.stepOf(step + 1, total)}</span>
          <span className="text-muted">{c.steps[step]}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5" aria-hidden>
          {c.steps.map((s, i) => (
            <span key={s} className="h-1.5 overflow-hidden rounded-full bg-forest/10">
              <span className="block h-full rounded-full bg-forest transition-[width] duration-500 ease-out" style={{ width: i <= step ? "100%" : "0%" }} />
            </span>
          ))}
        </div>
      </div>

      {/* Question */}
      <div key={`q${step}`} className={dir > 0 ? "df-step-in" : "df-step-back"}>
        <h2 className="display text-[2rem] leading-tight text-forest sm:text-[2.4rem]">{c.q[step]}</h2>
        <p id="form-intro" className="mt-2 text-[15px] text-muted">{c.sub[step]}</p>
      </div>

      {(errorList.length > 0 || networkError) && (
        <div role="alert" className="mt-6 rounded-2xl border border-danger/25 bg-danger/5 p-4 text-sm text-danger">
          {networkError ? f.networkError : (
            <>
              <p className="font-medium">{f.errorSummary}</p>
              <ul className="mt-1 list-disc pl-5">{errorList.map(([k, v]) => <li key={k}>{v}</li>)}</ul>
            </>
          )}
        </div>
      )}

      {/* Honeypot, hidden from people and assistive tech */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {/* 1 · Treatment (auto-advances on pick) */}
      <fieldset className={step === 0 ? "df-step-in mt-7" : "hidden"}>
        <legend className="sr-only">{f.treatment}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {options.map((o) => (
            <label key={o.slug} className="group cursor-pointer">
              <input
                type="radio"
                name="treatmentSlug"
                value={o.slug}
                defaultChecked={defaultTreatment === o.slug}
                onClick={() => window.setTimeout(() => go(1), 280)}
                className="peer sr-only"
              />
              <span
                className={`relative flex h-full min-h-[118px] flex-col justify-between rounded-3xl bg-gradient-to-br ${TINT[o.slug] ?? TINT["not-sure"]} p-4 text-forest ring-1 ring-forest/[0.07] transition duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_18px_36px_-22px_rgba(31,51,41,0.6)] peer-checked:from-forest peer-checked:to-[#2c4a3b] peer-checked:text-ivory peer-checked:shadow-[0_20px_40px_-20px_rgba(31,51,41,0.9)] peer-checked:ring-forest peer-focus-visible:ring-4 peer-focus-visible:ring-forest/25`}
              >
                <span className="flex size-10 items-center justify-center rounded-2xl bg-white/70 text-forest shadow-sm">
                  <Icon d={ICONS[o.slug] ?? ICONS.consultation} className="size-5" />
                </span>
                <span className="mt-4 text-[15px] font-medium leading-snug">{o.name}</span>
              </span>
            </label>
          ))}
        </div>
        {/* This form is always an appointment request. */}
        <input type="hidden" name="appointmentIntent" value="on" />
      </fieldset>

      {/* 2 · Timing */}
      <div className={step === 1 ? "df-step-in mt-7 space-y-6" : "hidden"}>
        <fieldset>
          <legend className="sr-only">{f.timeframe}</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {c.when.map(([k, title, hint]) => (
              <label key={k} className="cursor-pointer">
                <input type="radio" name="bookingTimeframe" value={title} className="peer sr-only" />
                <span className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-forest/[0.08] transition peer-checked:bg-forest peer-checked:text-ivory peer-checked:shadow-[0_16px_32px_-18px_rgba(31,51,41,0.9)] peer-checked:ring-forest peer-focus-visible:ring-4 peer-focus-visible:ring-forest/25 hover:ring-forest/30">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-current opacity-60" />
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="block text-xs opacity-70">{hint}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-ink">{c.timeLabel}</legend>
          <div className="flex flex-wrap gap-2">{c.times.map((w) => <Pill key={w} name="preferredTime" value={w}>{w}</Pill>)}</div>
        </fieldset>
      </div>

      {/* 3 · Details */}
      <div className={step === 2 ? "df-step-in mt-7 space-y-4" : "hidden"}>
        <div className="relative">
          <label htmlFor="fullName" className="sr-only">{f.name}</label>
          <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-forest/40" />
          <input id="fullName" name="fullName" autoComplete="name" placeholder={f.name} required className={field} aria-invalid={!!err("fullName")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="relative">
            <label htmlFor="phone" className="sr-only">{f.phone}</label>
            <Icon d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-forest/40" />
            <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder={f.phone} className={field} aria-invalid={!!err("phone")} />
          </div>
          <div className="relative">
            <label htmlFor="email" className="sr-only">{f.email}</label>
            <Icon d="M4 6h16v12H4zM4 7l8 6 8-6" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-forest/40" />
            <input id="email" name="email" type="email" autoComplete="email" placeholder={f.email} className={field} aria-invalid={!!err("email")} />
          </div>
        </div>
        <p className="text-xs text-muted">{f.contactHint}</p>
        {errors._contact && <p role="alert" className="text-sm text-danger">{errors._contact}</p>}
        <div className="grid gap-5 pt-2 sm:grid-cols-[1.4fr_1fr]">
          <fieldset>
            <legend className="mb-3 text-sm font-medium text-ink">{c.channelLabel}</legend>
            <div className="flex flex-wrap gap-2">
              <Pill name="preferredChannel" value="PHONE">{f.phone.split(" (")[0]}</Pill>
              <Pill name="preferredChannel" value="WHATSAPP">WhatsApp</Pill>
              <Pill name="preferredChannel" value="EMAIL">{f.email}</Pill>
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-3 text-sm font-medium text-ink">{c.langLabel}</legend>
            <div className="flex flex-wrap gap-2">
              <Pill name="language" value="en" defaultChecked={lang === "en"}>English</Pill>
              <Pill name="language" value="tr" defaultChecked={lang === "tr"}>Türkçe</Pill>
            </div>
          </fieldset>
        </div>
      </div>

      {/* 4 · Review */}
      <div className={step === 3 ? "df-step-in mt-7 space-y-5" : "hidden"}>
        <dl className="divide-y divide-forest/[0.07] overflow-hidden rounded-3xl bg-white ring-1 ring-forest/[0.07]">
          {[
            [c.summary[0], treatmentName, 0],
            [c.summary[1], timing, 1],
            [c.summary[2], vals.fullName, 2],
            [c.summary[3], contact, 2],
          ].map(([k, v, s]) => (
            <div key={k as string} className="flex items-center gap-4 px-5 py-3.5">
              <dt className="w-24 shrink-0 text-xs uppercase tracking-[0.12em] text-muted">{k}</dt>
              <dd className={`min-w-0 flex-1 truncate text-sm ${v ? "font-medium text-ink" : "text-muted"}`}>{v || c.none}</dd>
              <button type="button" onClick={() => go(s as number)} className="text-xs font-medium text-forest underline-offset-4 hover:underline">{c.edit}</button>
            </div>
          ))}
        </dl>
        <div>
          <label htmlFor="message" className="mb-2 block text-sm font-medium text-ink">{f.message}</label>
          <textarea id="message" name="message" rows={3} maxLength={1000} className="w-full resize-none rounded-2xl border border-forest/12 bg-white px-4 py-3.5 text-[15px] focus:border-forest focus:outline-none focus:ring-4 focus:ring-forest/10" aria-describedby="message-hint" />
          <p id="message-hint" className="mt-2 text-xs text-muted">{f.messageHint}</p>
        </div>
        <div className="space-y-3 rounded-2xl bg-sage-50/70 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="privacyNoticeAccepted" className="mt-0.5 size-5 shrink-0 accent-[#1f3329]" aria-invalid={!!err("privacyNoticeAccepted")} />
            <span className="text-sm leading-relaxed">
              {f.privacy}{" "}
              <Link href="/privacy" target="_blank" className="underline underline-offset-2">{t.footer.privacy}</Link>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="marketingOptIn" className="mt-0.5 size-5 shrink-0 accent-[#1f3329]" />
            <span className="text-sm leading-relaxed text-muted">{f.marketing}</span>
          </label>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-9 flex items-center gap-3">
        {step > 0 && (
          <button type="button" onClick={() => go(step - 1)} className="flex items-center gap-2 rounded-2xl px-4 py-4 text-sm font-medium text-forest transition hover:bg-forest/5">
            <span aria-hidden>←</span> {c.back}
          </button>
        )}
        <button
          type="submit"
          disabled={state === "sending"}
          className="group ml-auto flex flex-1 items-center justify-center gap-3 rounded-2xl bg-forest px-8 py-4 text-base font-medium text-ivory shadow-[0_18px_40px_-18px_rgba(31,51,41,0.9)] transition hover:-translate-y-0.5 hover:bg-forest-700 disabled:translate-y-0 disabled:opacity-60 sm:flex-none sm:min-w-[220px]"
        >
          {state === "sending" ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-ivory/30 border-t-ivory" aria-hidden />
              {f.sending}
            </>
          ) : (
            <>
              {step === total - 1 ? f.submit : c.next}
              <span aria-hidden className="transition group-hover:translate-x-1">→</span>
            </>
          )}
        </button>
      </div>
      <p className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><Icon d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" className="size-3.5" />{c.secure}</span>
        <span className="flex items-center gap-1.5"><Icon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" className="size-3.5" />{c.reply}</span>
      </p>
    </form>
  );
}
