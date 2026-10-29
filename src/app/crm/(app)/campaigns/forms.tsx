"use client";

import { useState } from "react";
import { ApiForm, callApi, optStr, str } from "@/components/crm/actions";
import { inputCls } from "@/components/crm/ui";

const csv = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

export function CampaignForm({ templateKeys }: { templateKeys: string[] }) {
  return (
    <details className="mt-4 border-t border-forest/10 pt-3">
      <summary className="cursor-pointer text-forest">New campaign…</summary>
      <ApiForm
        url="/api/admin/automation/campaigns"
        submitLabel="Create draft"
        transform={(fd) => {
          const statuses = csv(str(fd, "statuses"));
          const languages = csv(str(fd, "languages"));
          const tags = csv(str(fd, "tags"));
          return {
            name: str(fd, "name"),
            channel: str(fd, "channel"),
            templateKey: str(fd, "templateKey"),
            segment: {
              ...(statuses.length ? { statuses } : {}),
              ...(languages.length ? { languages } : {}),
              ...(tags.length ? { tags } : {}),
              ...(optStr(fd, "utmCampaign") ? { utmCampaign: str(fd, "utmCampaign") } : {}),
              appointmentState: str(fd, "appointmentState") || "any",
            },
          };
        }}
      >
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input name="name" required minLength={3} placeholder="Campaign name" className={inputCls} aria-label="Name" />
          <select name="channel" className={inputCls} aria-label="Channel"><option value="EMAIL">Email</option><option value="WHATSAPP">WhatsApp (official API)</option></select>
          <select name="templateKey" required className={inputCls} aria-label="Template">{templateKeys.map((k) => <option key={k}>{k}</option>)}</select>
          <select name="appointmentState" className={inputCls} aria-label="Appointment state"><option value="any">Any appointment state</option><option value="none">No request/appointment</option><option value="requested">Has open request</option><option value="confirmed">Has confirmed appointment</option></select>
          <input name="statuses" placeholder="Lead statuses (comma) e.g. NURTURE,CONTACTED" className={inputCls} aria-label="Statuses" />
          <input name="languages" placeholder="Languages e.g. en,tr" className={inputCls} aria-label="Languages" />
          <input name="tags" placeholder="Tags (comma)" className={inputCls} aria-label="Tags" />
          <input name="utmCampaign" placeholder="Source campaign (utm_campaign)" className={inputCls} aria-label="Source campaign" />
        </div>
        <p className="mt-1 text-xs text-muted">Segments use operational attributes only. Health details, symptoms and treatment history cannot be used for targeting.</p>
      </ApiForm>
    </details>
  );
}

export function CampaignPreview({ id }: { id: string }) {
  const [data, setData] = useState<null | { matched: number; eligible: number; excluded: number; suppressed: number; reasons: Record<string, number> }>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        className="rounded-lg border border-forest/25 bg-white px-3 py-1.5 text-forest hover:bg-sage-50"
        onClick={async () => {
          setErr(null);
          try {
            setData((await callApi("POST", `/api/admin/automation/campaigns/${id}/preview`)) as never);
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        Preview audience
      </button>
      {data && (
        <span role="status" className="mt-1 text-xs">
          {data.matched} matched · <b>{data.eligible} eligible</b> · {data.excluded} excluded · {data.suppressed} suppressed
          {Object.keys(data.reasons).length > 0 && <span className="block text-muted">{Object.entries(data.reasons).map(([k, v]) => `${k}: ${v}`).join("; ")}</span>}
        </span>
      )}
      {err && <span role="alert" className="mt-1 text-xs text-danger">{err}</span>}
    </span>
  );
}

export function ScheduleForm({ id }: { id: string }) {
  return (
    <ApiForm url={`/api/admin/automation/campaigns/${id}/schedule`} submitLabel="Schedule" className="flex items-center gap-2" transform={(fd) => ({ scheduledAt: str(fd, "at") || new Date().toISOString() })}>
      <input type="datetime-local" name="at" className={inputCls} aria-label="Send at (blank = now)" />
    </ApiForm>
  );
}

export function TemplateForm() {
  return (
    <details className="mt-4 border-t border-forest/10 pt-3">
      <summary className="cursor-pointer text-forest">New template / new version…</summary>
      <ApiForm
        url="/api/admin/automation/templates"
        submitLabel="Create draft version"
        transform={(fd) => ({
          key: str(fd, "key"), channel: str(fd, "channel"), locale: str(fd, "locale"), purpose: str(fd, "purpose"),
          subject: optStr(fd, "subject"), previewText: optStr(fd, "previewText"), body: str(fd, "body"), providerTemplateName: optStr(fd, "providerTemplateName"),
        })}
      >
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input name="key" required pattern="[a-z0-9_]{2,80}" placeholder="key (e.g. nurture_1)" className={inputCls} aria-label="Key" />
          <select name="purpose" className={inputCls} aria-label="Purpose"><option value="MARKETING">Marketing</option><option value="SERVICE">Service</option></select>
          <select name="channel" className={inputCls} aria-label="Channel"><option value="EMAIL">Email</option><option value="WHATSAPP">WhatsApp</option></select>
          <select name="locale" className={inputCls} aria-label="Language"><option value="en">English</option><option value="tr">Türkçe</option></select>
          <input name="subject" placeholder="Email subject (no medical details)" className={`${inputCls} sm:col-span-2`} aria-label="Subject" />
          <input name="previewText" placeholder="Preview text" className={`${inputCls} sm:col-span-2`} aria-label="Preview text" />
          <input name="providerTemplateName" placeholder="WhatsApp approved template name" className={`${inputCls} sm:col-span-2`} aria-label="Provider template name" />
          <textarea name="body" required rows={5} placeholder="Body. Placeholders: {{firstName}}, {{reference}}, {{appointmentTime}}. Unsubscribe footer is added automatically to marketing email." className={`${inputCls} sm:col-span-2`} aria-label="Body" />
        </div>
      </ApiForm>
    </details>
  );
}
