"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Dict, Lang } from "@/lib/i18n";

type TreatmentOption = { slug: string; name: string };
type Shot = { id: number; file: File; kind: "XRAY" | "SMILE_PHOTO"; preview: string | null };

const MAX = 4;
const COPY = {
  en: {
    steps: ["Treatment", "Photos", "Your details"],
    q: ["What would you like a plan for?", "Send your X-ray or smile photos", "Where should we send your plan?"],
    sub: [
      "Pick the treatment you're considering. Not sure? Choose that and the dentist will advise.",
      "A recent panoramic X-ray is ideal. Smile photos in daylight help too. Up to 4 files.",
      "The dentist reviews your images and sends a written plan, usually within 2 working days.",
    ],
    add: "Add X-ray or photo", addMore: "Add another", xray: "X-ray", smile: "Smile photo", remove: "Remove",
    tips: ["Front smile, teeth together", "Upper and lower teeth", "Panoramic X-ray if you have one"],
    needFile: "Please add at least one X-ray or photo.",
    needContact: "Please add your name and an email or phone number.",
    country: "Country you live in",
    consent: "I agree Dent Flex may store these images so the dental team can prepare my plan. They are never shared with the AI.",
    back: "Back", next: "Continue", send: "Get my free plan", sending: "Sending…",
    doneTitle: "Your images are with our dentist",
    doneBody: "We'll review them and send your personal treatment plan, usually within 2 working days. It's an estimate; your final plan is confirmed after an examination.",
    ref: "Reference", nextTitle: "What happens next",
    next3: ["The dentist reviews your images", "You get a written plan by email or WhatsApp", "Book a consultation when you're ready"],
    stepOf: (a: number, b: number) => `Step ${a} of ${b}`,
    free: "Free · No obligation", private: "Private & secure",
  },
  tr: {
    steps: ["Tedavi", "Fotoğraflar", "Bilgileriniz"],
    q: ["Hangi tedavi için plan istersiniz?", "Röntgen veya gülüş fotoğraflarınızı gönderin", "Planınızı nereye gönderelim?"],
    sub: [
      "Düşündüğünüz tedaviyi seçin. Emin değilseniz onu seçin, hekimimiz yönlendirsin.",
      "Yakın tarihli panoramik röntgen idealdir. Gün ışığında gülüş fotoğrafları da yardımcı olur. En fazla 4 dosya.",
      "Hekimimiz görüntülerinizi inceler ve genellikle 2 iş günü içinde yazılı bir plan gönderir.",
    ],
    add: "Röntgen veya fotoğraf ekle", addMore: "Bir tane daha ekle", xray: "Röntgen", smile: "Gülüş fotoğrafı", remove: "Kaldır",
    tips: ["Karşıdan gülüş, dişler kapalı", "Üst ve alt dişler", "Varsa panoramik röntgen"],
    needFile: "Lütfen en az bir röntgen veya fotoğraf ekleyin.",
    needContact: "Lütfen adınızı ve bir e-posta ya da telefon ekleyin.",
    country: "Yaşadığınız ülke",
    consent: "Dent Flex'in planımı hazırlamak için bu görüntüleri saklamasına izin veriyorum. Yapay zekâ ile paylaşılmaz.",
    back: "Geri", next: "Devam", send: "Ücretsiz planımı al", sending: "Gönderiliyor…",
    doneTitle: "Görüntüleriniz hekimimize ulaştı",
    doneBody: "İnceleyip kişisel tedavi planınızı genellikle 2 iş günü içinde göndereceğiz. Bu bir ön değerlendirmedir; kesin plan muayeneden sonra belirlenir.",
    ref: "Referans", nextTitle: "Sonraki adımlar",
    next3: ["Hekimimiz görüntülerinizi inceler", "Yazılı planınızı e-posta veya WhatsApp ile alırsınız", "Hazır olduğunuzda muayene randevusu alırsınız"],
    stepOf: (a: number, b: number) => `Adım ${a} / ${b}`,
    free: "Ücretsiz · Yükümlülük yok", private: "Gizli ve güvenli",
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
const field =
  "w-full rounded-2xl border border-forest/12 bg-white px-4 py-4 text-[15px] text-ink shadow-[0_1px_2px_rgba(31,51,41,0.04)] transition placeholder:text-muted/55 focus:border-forest focus:outline-none focus:ring-4 focus:ring-forest/10";

function Svg({ d, className = "size-5" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden><path d={d} stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

let seq = 0;

export function FreePlanForm({ t, lang, treatments, defaultTreatment }: { t: Dict; lang: Lang; treatments: TreatmentOption[]; defaultTreatment?: string }) {
  const c = COPY[lang];
  const f = t.form;
  const [step, setStep] = useState(0);
  const [treatment, setTreatment] = useState(defaultTreatment ?? "");
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [reference, setReference] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const idem = useRef("");
  const options = [...treatments, { slug: "not-sure", name: f.notSure }];

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setError(null);
    const next = [...shots];
    for (const file of [...list]) {
      if (next.length >= MAX) break;
      if (file.size > 8 * 1024 * 1024) {
        setError(lang === "tr" ? "Her dosya 8 MB'tan küçük olmalı." : "Each file must be under 8 MB.");
        continue;
      }
      const isImg = file.type.startsWith("image/") && !/heic/i.test(file.type);
      next.push({ id: ++seq, file, kind: next.length === 0 ? "XRAY" : "SMILE_PHOTO", preview: isImg ? URL.createObjectURL(file) : null });
    }
    setShots(next);
  };

  const go = (to: number) => {
    setError(null);
    setStep(to);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step < 2) {
      if (step === 1 && shots.length === 0) return setError(c.needFile);
      return go(step + 1);
    }
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("fullName") ?? "").trim();
    if (!name || !(String(fd.get("email") ?? "").trim() || String(fd.get("phone") ?? "").trim())) return setError(c.needContact);
    if (!fd.get("privacyNoticeAccepted") || !fd.get("uploadConsent")) return setError(lang === "tr" ? "Lütfen iki onay kutusunu da işaretleyin." : "Please tick both boxes to continue.");

    const body = new FormData();
    for (const k of ["fullName", "email", "phone", "country", "website"]) body.set(k, String(fd.get(k) ?? ""));
    body.set("language", lang);
    if (treatment) body.set("treatmentSlug", treatment);
    body.set("privacyNoticeAccepted", "true");
    body.set("uploadConsent", "true");
    body.set("marketingOptIn", fd.get("marketingOptIn") ? "true" : "false");
    shots.forEach((s, i) => {
      body.set(`file${i}`, s.file);
      body.set(`kind${i}`, s.kind);
    });
    setState("sending");
    setError(null);
    idem.current ||= crypto.randomUUID();
    try {
      const res = await fetch("/api/public/plan-requests", { method: "POST", body, headers: { "idempotency-key": idem.current } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error?.fields ? Object.values(d.error.fields).join(" ") : d?.error?.message ?? f.networkError);
      setReference(d.reference);
      setState("done");
    } catch (err) {
      setState("idle");
      setError((err as Error).message);
    }
  }

  if (state === "done") {
    return (
      <div role="status" className="df-rise py-4 text-center">
        <span className="df-pop mx-auto flex size-20 items-center justify-center rounded-full bg-forest text-sage shadow-[0_18px_40px_-14px_rgba(31,51,41,0.7)]">
          <svg viewBox="0 0 24 24" className="size-10" aria-hidden><path d="M5 12.5 10 17.5 19 7.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="df-check" /></svg>
        </span>
        <h3 className="display mt-6 text-3xl text-forest sm:text-4xl">{c.doneTitle}</h3>
        <p className="mx-auto mt-3 max-w-md leading-relaxed text-ink/75">{c.doneBody}</p>
        <p className="mt-5 inline-flex gap-2 rounded-full bg-sage-50 px-5 py-2 text-sm text-forest ring-1 ring-forest/10"><span className="text-muted">{c.ref}</span><span className="font-mono tracking-[0.12em]">{reference}</span></p>
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
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="scroll-mt-28">
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-[0.16em] text-forest/60">{c.stepOf(step + 1, 3)}</span>
          <span className="text-muted">{c.steps[step]}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5" aria-hidden>
          {c.steps.map((s, i) => (
            <span key={s} className="h-1.5 overflow-hidden rounded-full bg-forest/10">
              <span className="block h-full rounded-full bg-forest transition-[width] duration-500" style={{ width: i <= step ? "100%" : "0%" }} />
            </span>
          ))}
        </div>
      </div>

      <div key={step} className="df-step-in">
        <h2 className="display text-[2rem] leading-tight text-forest sm:text-[2.4rem]">{c.q[step]}</h2>
        <p className="mt-2 text-[15px] text-muted">{c.sub[step]}</p>
      </div>

      {/* Honeypot */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>

      {/* 1 · Treatment */}
      <fieldset className={step === 0 ? "df-step-in mt-7" : "hidden"}>
        <legend className="sr-only">{f.treatment}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {options.map((o) => {
            const on = treatment === o.slug;
            return (
              <button
                key={o.slug}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setTreatment(o.slug);
                  window.setTimeout(() => go(1), 260);
                }}
                className={`flex min-h-[112px] flex-col justify-between rounded-3xl p-4 text-left ring-1 transition duration-200 hover:-translate-y-1 ${on ? "bg-forest text-ivory ring-forest shadow-[0_20px_40px_-20px_rgba(31,51,41,0.9)]" : "bg-gradient-to-br from-[#f2f3ec] to-[#e4e8da] text-forest ring-forest/[0.07]"}`}
              >
                <span className="flex size-10 items-center justify-center rounded-2xl bg-white/75 text-forest shadow-sm"><Svg d={ICONS[o.slug] ?? ICONS.consultation} /></span>
                <span className="mt-4 text-[15px] font-medium leading-snug">{o.name}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* 2 · Photos */}
      <div className={step === 1 ? "df-step-in mt-7" : "hidden"}>
        <input ref={picker} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {shots.map((s) => (
            <div key={s.id} className="df-pop overflow-hidden rounded-2xl bg-white ring-1 ring-forest/[0.08]">
              <div className="relative aspect-square bg-sage-50">
                {s.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.preview} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-forest/60"><Svg d="M4 5h16v14H4zM8 9v6M12 8v8M16 9v6" className="size-9" /></span>
                )}
                <button type="button" onClick={() => setShots(shots.filter((x) => x.id !== s.id))} aria-label={c.remove} className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60">
                  <Svg d="M6 6l12 12M18 6 6 18" className="size-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 p-1.5 text-[11px]">
                {(["XRAY", "SMILE_PHOTO"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setShots(shots.map((x) => (x.id === s.id ? { ...x, kind: k } : x)))} className={`rounded-lg py-1.5 font-medium transition ${s.kind === k ? "bg-forest text-ivory" : "text-forest hover:bg-sage-50"}`}>
                    {k === "XRAY" ? c.xray : c.smile}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {shots.length < MAX && (
            <button
              type="button"
              onClick={() => picker.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              className={`flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-forest/20 bg-white/70 p-3 text-center text-forest transition hover:border-forest/50 hover:bg-white ${shots.length === 0 ? "col-span-2 aspect-auto py-12 sm:col-span-4" : ""}`}
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-sage-50"><Svg d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" className="size-6" /></span>
              <span className="text-sm font-medium">{shots.length ? c.addMore : c.add}</span>
              <span className="text-[11px] text-muted">JPG · PNG · HEIC · PDF · 8 MB</span>
            </button>
          )}
        </div>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          {c.tips.map((tip) => <li key={tip} className="flex items-center gap-1.5"><Svg d="M5 12.5 10 17.5 19 7.5" className="size-3.5 text-[#3f9b5f]" />{tip}</li>)}
        </ul>
      </div>

      {/* 3 · Details */}
      <div className={step === 2 ? "df-step-in mt-7 space-y-4" : "hidden"}>
        <label className="block"><span className="sr-only">{f.name}</span><input name="fullName" autoComplete="name" placeholder={f.name} className={field} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="sr-only">{f.email}</span><input name="email" type="email" autoComplete="email" placeholder={f.email} className={field} /></label>
          <label className="block"><span className="sr-only">{f.phone}</span><input name="phone" type="tel" autoComplete="tel" placeholder={f.phone} className={field} /></label>
        </div>
        <label className="block"><span className="sr-only">{c.country}</span><input name="country" autoComplete="country-name" placeholder={c.country} className={field} /></label>
        <div className="space-y-3 rounded-2xl bg-sage-50/70 p-4 text-sm leading-relaxed">
          <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" name="uploadConsent" className="mt-0.5 size-5 shrink-0 accent-[#1f3329]" /><span>{c.consent}</span></label>
          <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" name="privacyNoticeAccepted" className="mt-0.5 size-5 shrink-0 accent-[#1f3329]" /><span>{f.privacy} <Link href="/privacy" target="_blank" className="underline underline-offset-2">{t.footer.privacy}</Link></span></label>
          <label className="flex cursor-pointer items-start gap-3 text-muted"><input type="checkbox" name="marketingOptIn" className="mt-0.5 size-5 shrink-0 accent-[#1f3329]" /><span>{f.marketing}</span></label>
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-2xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="mt-9 flex items-center gap-3">
        {step > 0 && (
          <button type="button" onClick={() => go(step - 1)} className="rounded-2xl px-4 py-4 text-sm font-medium text-forest hover:bg-forest/5"><span aria-hidden>←</span> {c.back}</button>
        )}
        <button type="submit" disabled={state === "sending" || (step === 0 && !treatment)} className="group ml-auto flex flex-1 items-center justify-center gap-3 rounded-2xl bg-forest px-8 py-4 text-base font-medium text-ivory shadow-[0_18px_40px_-18px_rgba(31,51,41,0.9)] transition hover:-translate-y-0.5 hover:bg-forest-700 disabled:translate-y-0 disabled:opacity-50 sm:flex-none sm:min-w-[240px]">
          {state === "sending" ? (<><span className="size-4 animate-spin rounded-full border-2 border-ivory/30 border-t-ivory" aria-hidden />{c.sending}</>) : (<>{step === 2 ? c.send : c.next}<span aria-hidden className="transition group-hover:translate-x-1">→</span></>)}
        </button>
      </div>
      <p className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>✓ {c.free}</span><span>🔒 {c.private}</span>
      </p>
    </form>
  );
}
