"use client";

import { useRef } from "react";
import { ApiForm, optStr, str } from "@/components/crm/actions";
import { inputCls } from "@/components/crm/ui";

type Opt = { id: string; name: string };

export function NewLeadForm({ treatments, staff, me }: { treatments: { slug: string; nameEn: string }[]; staff: Opt[]; me: string }) {
  // One key per form instance: a double-click or retry can't create two leads.
  const idem = useRef(crypto.randomUUID());
  const label = "text-xs text-muted";
  return (
    <ApiForm
      url="/api/admin/leads"
      submitLabel="Create lead"
      headers={{ "idempotency-key": idem.current }}
      onDone={(d) => {
        const id = (d as { lead: { id: string } }).lead.id;
        window.location.href = `/crm/leads/${id}`;
      }}
      transform={(fd) => ({
        fullName: str(fd, "fullName"),
        phone: str(fd, "phone"),
        email: str(fd, "email"),
        language: str(fd, "language"),
        source: str(fd, "source"),
        sourceDetail: optStr(fd, "sourceDetail"),
        treatmentSlug: optStr(fd, "treatmentSlug"),
        appointmentIntent: fd.get("appointmentIntent") === "on",
        bookingTimeframe: optStr(fd, "bookingTimeframe"),
        preferredChannel: optStr(fd, "preferredChannel"),
        preferredTime: optStr(fd, "preferredTime"),
        nextStepRequested: optStr(fd, "nextStepRequested"),
        message: optStr(fd, "message"),
        ownerId: str(fd, "ownerId") || null,
        noticeGiven: fd.get("noticeGiven") === "on",
        marketingOptIn: fd.get("marketingOptIn") === "on",
      })}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Full name *<input name="fullName" required minLength={2} autoComplete="off" className={`${inputCls} block w-full`} /></label>
        <label className={label}>How did they contact us? *
          <select name="source" className={`${inputCls} block w-full`} defaultValue="PHONE">
            <option value="PHONE">Phone call</option><option value="WALK_IN">Walk-in</option><option value="REFERRAL">Referral</option><option value="OTHER">Other</option>
          </select>
        </label>
        <label className={label}>Phone (with country code)<input name="phone" type="tel" className={`${inputCls} block w-full`} /></label>
        <label className={label}>Email<input name="email" type="email" className={`${inputCls} block w-full`} /></label>
        <label className={label}>Language
          <select name="language" className={`${inputCls} block w-full`}><option value="tr">Türkçe</option><option value="en">English</option></select>
        </label>
        <label className={label}>Referral / campaign detail<input name="sourceDetail" placeholder="e.g. referred by Dr. X, Instagram" className={`${inputCls} block w-full`} /></label>
        <label className={label}>Treatment interest
          <select name="treatmentSlug" className={`${inputCls} block w-full`}><option value="">—</option>{treatments.map((t) => <option key={t.slug} value={t.slug}>{t.nameEn}</option>)}<option value="not-sure">Not sure</option></select>
        </label>
        <label className={label}>Owner
          <select name="ownerId" defaultValue={me} className={`${inputCls} block w-full`}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label className={label}>Booking timeframe (their words)<input name="bookingTimeframe" placeholder="e.g. next month" className={`${inputCls} block w-full`} /></label>
        <label className={label}>Best time to call<input name="preferredTime" placeholder="e.g. weekday mornings" className={`${inputCls} block w-full`} /></label>
        <label className={label}>Preferred channel
          <select name="preferredChannel" className={`${inputCls} block w-full`}><option value="">—</option><option value="PHONE">Phone</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option></select>
        </label>
        <label className={label}>They asked for
          <select name="nextStepRequested" className={`${inputCls} block w-full`}><option value="">—</option><option value="PRICE_INFO">Price information</option><option value="CONSULTATION_DETAILS">Consultation details</option><option value="CALLBACK">A call back</option></select>
        </label>
        <label className={`${label} sm:col-span-2`}>Notes (avoid unnecessary clinical detail)<textarea name="message" rows={3} maxLength={1000} className={`${inputCls} block w-full`} /></label>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <label className="flex items-start gap-2"><input type="checkbox" name="appointmentIntent" className="mt-1" /> They want a consultation / appointment (creates an appointment <b>request</b>, not a booking)</label>
        <label className="flex items-start gap-2 font-medium"><input type="checkbox" name="noticeGiven" required className="mt-1" /> I told them how we use their details (privacy notice) and they agreed to be contacted about this inquiry *</label>
        <label className="flex items-start gap-2 text-muted"><input type="checkbox" name="marketingOptIn" className="mt-1" /> They explicitly asked to receive clinic news (marketing) — leave unticked if not asked</label>
      </div>
      <p className="mt-2 text-xs text-muted">Give at least a phone number or an email.</p>
    </ApiForm>
  );
}
