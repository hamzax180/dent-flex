"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { leadInputSchema } from "@/lib/validation/lead";
import type { Dict, Lang } from "@/lib/i18n";

type TreatmentOption = { slug: string; name: string };

const input =
  "mt-1.5 w-full border border-forest/20 bg-white px-4 py-3 text-ink placeholder:text-muted/70 focus:border-forest focus:outline-none aria-[invalid=true]:border-danger";
const label = "block text-sm font-medium text-ink";

export function LeadForm({ t, lang, treatments, defaultTreatment }: { t: Dict; lang: Lang; treatments: TreatmentOption[]; defaultTreatment?: string }) {
  const f = t.form;
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [networkError, setNetworkError] = useState(false);
  const [reference, setReference] = useState("");
  const idemKey = useRef<string>("");
  const summaryRef = useRef<HTMLDivElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;
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

    const parsed = leadInputSchema.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join(".")] ??= i.message;
      setErrors(errs);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
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
      if (data?.error?.fields) setErrors(data.error.fields);
      else setErrors({ _: data?.error?.message ?? f.networkError });
      requestAnimationFrame(() => summaryRef.current?.focus());
    } catch {
      setState("idle");
      setNetworkError(true);
    }
  }

  if (state === "done") {
    return (
      <div role="status" className="border border-forest/15 bg-sage-50 p-8">
        <h3 className="display text-3xl text-forest">{f.successTitle}</h3>
        <p className="mt-3 leading-relaxed text-ink">{f.successBody.replace("{ref}", reference)}</p>
      </div>
    );
  }

  const err = (k: string) => errors[k];
  const describedBy = (k: string, hint?: string) => [err(k) ? `${k}-error` : "", hint ?? ""].filter(Boolean).join(" ") || undefined;
  const fieldError = (k: string) =>
    err(k) ? <p id={`${k}-error`} className="mt-1.5 text-sm text-danger">{err(k)}</p> : null;

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-5" aria-describedby="form-intro">
      <p id="form-intro" className="text-sm leading-relaxed text-muted">{f.intro}</p>

      {(Object.keys(errors).length > 0 || networkError) && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {networkError ? f.networkError : (
            <>
              <p className="font-medium">{f.errorSummary}</p>
              <ul className="mt-1 list-disc pl-5">{Object.entries(errors).map(([k, v]) => <li key={k}>{v}</li>)}</ul>
            </>
          )}
        </div>
      )}

      {/* Honeypot, hidden from people and assistive tech */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <div>
        <label htmlFor="fullName" className={label}>{f.name}</label>
        <input id="fullName" name="fullName" autoComplete="name" required className={input} aria-invalid={!!err("fullName")} aria-describedby={describedBy("fullName")} />
        {fieldError("fullName")}
      </div>

      <fieldset>
        <legend className="text-sm text-muted">{f.contactHint}</legend>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className={label}>{f.phone}</label>
            <input id="phone" name="phone" type="tel" autoComplete="tel" className={input} aria-invalid={!!err("phone")} aria-describedby={describedBy("phone")} />
            {fieldError("phone")}
          </div>
          <div>
            <label htmlFor="email" className={label}>{f.email}</label>
            <input id="email" name="email" type="email" autoComplete="email" className={input} aria-invalid={!!err("email")} aria-describedby={describedBy("email")} />
            {fieldError("email")}
          </div>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="treatmentSlug" className={label}>{f.treatment}</label>
          <select id="treatmentSlug" name="treatmentSlug" defaultValue={defaultTreatment ?? ""} className={input}>
            <option value="">—</option>
            {treatments.map((tr) => <option key={tr.slug} value={tr.slug}>{tr.name}</option>)}
            <option value="not-sure">{f.notSure}</option>
          </select>
        </div>
        <div>
          <label htmlFor="language" className={label}>{f.language}</label>
          <select id="language" name="language" defaultValue={lang} className={input}>
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </div>
      </div>

      <label className="flex items-start gap-3 border border-forest/15 bg-white p-4">
        <input type="checkbox" name="appointmentIntent" defaultChecked className="mt-1 size-4 accent-forest" />
        <span className="text-sm">{f.wantsAppointment}</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="bookingTimeframe" className={label}>{f.timeframe}</label>
          <input id="bookingTimeframe" name="bookingTimeframe" placeholder={f.timeframePh} className={input} />
        </div>
        <div>
          <label htmlFor="preferredTime" className={label}>{f.time}</label>
          <input id="preferredTime" name="preferredTime" placeholder={f.timePh} className={input} />
        </div>
        <div>
          <label htmlFor="preferredChannel" className={label}>{f.channel}</label>
          <select id="preferredChannel" name="preferredChannel" defaultValue="" className={input}>
            <option value="">—</option>
            <option value="PHONE">{f.phone.split(" (")[0]}</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">{f.email}</option>
          </select>
        </div>
        <div>
          <label htmlFor="nextStepRequested" className={label}>{f.nextStep}</label>
          <select id="nextStepRequested" name="nextStepRequested" defaultValue="" className={input}>
            <option value="">—</option>
            {Object.entries(f.nextSteps).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="message" className={label}>{f.message}</label>
        <textarea id="message" name="message" rows={3} maxLength={1000} className={input} aria-describedby="message-hint" />
        <p id="message-hint" className="mt-1.5 text-xs text-muted">{f.messageHint}</p>
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="privacyNoticeAccepted" className="mt-1 size-4 accent-forest" aria-invalid={!!err("privacyNoticeAccepted")} aria-describedby={describedBy("privacyNoticeAccepted")} />
          <span className="text-sm">
            {f.privacy}{" "}
            <Link href="/privacy" target="_blank" className="underline underline-offset-2">{t.footer.privacy}</Link>
          </span>
        </label>
        {fieldError("privacyNoticeAccepted")}
        <label className="flex items-start gap-3">
          <input type="checkbox" name="marketingOptIn" className="mt-1 size-4 accent-forest" />
          <span className="text-sm text-muted">{f.marketing}</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full bg-forest px-8 py-4 font-medium text-ivory transition-colors hover:bg-forest-700 disabled:opacity-60 sm:w-auto"
      >
        {state === "sending" ? f.sending : f.submit}
      </button>
    </form>
  );
}
