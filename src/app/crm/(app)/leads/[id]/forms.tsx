"use client";

import { ApiForm, optStr, str } from "@/components/crm/actions";
import { inputCls, STATUS_LABEL } from "@/components/crm/ui";
import type { LeadStatus } from "@prisma/client";

type Opt = { id: string; name: string };

export function LeadEditor({
  leadId, status, allowed, ownerId, staff, treatments, current,
}: {
  leadId: string; status: LeadStatus; allowed: LeadStatus[]; ownerId: string | null; staff: Opt[]; treatments: { slug: string; nameEn: string }[];
  current: { treatmentSlug: string; preferredChannel: string; preferredTime: string; bookingTimeframe: string; appointmentIntent: boolean; answeredFollowUp: boolean; nextStepRequested: string; tags: string; humanHold: boolean };
}) {
  return (
    <ApiForm
      url={`/api/admin/leads/${leadId}`}
      method="PATCH"
      resetOnSuccess={false}
      submitLabel="Save changes"
      transform={(fd) => ({
        status: str(fd, "status") || undefined,
        ownerId: str(fd, "ownerId") || null,
        treatmentSlug: str(fd, "treatmentSlug") || null,
        preferredChannel: str(fd, "preferredChannel") || null,
        preferredTime: str(fd, "preferredTime") || null,
        bookingTimeframe: str(fd, "bookingTimeframe") || null,
        nextStepRequested: str(fd, "nextStepRequested") || null,
        appointmentIntent: fd.get("appointmentIntent") === "on",
        answeredFollowUp: fd.get("answeredFollowUp") === "on",
        humanHold: fd.get("humanHold") === "on",
        tags: str(fd, "tags").split(",").map((t) => t.trim()).filter(Boolean),
        lostReason: optStr(fd, "lostReason"),
      })}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted">Stage
          <select name="status" defaultValue="" className={`${inputCls} block w-full`}>
            <option value="">{STATUS_LABEL[status]} (no change)</option>
            {allowed.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">Owner
          <select name="ownerId" defaultValue={ownerId ?? ""} className={`${inputCls} block w-full`}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label className="text-xs text-muted">Treatment interest
          <select name="treatmentSlug" defaultValue={current.treatmentSlug} className={`${inputCls} block w-full`}><option value="">—</option>{treatments.map((t) => <option key={t.slug} value={t.slug}>{t.nameEn}</option>)}</select>
        </label>
        <label className="text-xs text-muted">Preferred channel
          <select name="preferredChannel" defaultValue={current.preferredChannel} className={`${inputCls} block w-full`}><option value="">—</option><option value="PHONE">Phone</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option></select>
        </label>
        <label className="text-xs text-muted">Preferred time<input name="preferredTime" defaultValue={current.preferredTime} className={`${inputCls} block w-full`} /></label>
        <label className="text-xs text-muted">Booking timeframe (self-stated)<input name="bookingTimeframe" defaultValue={current.bookingTimeframe} className={`${inputCls} block w-full`} /></label>
        <label className="text-xs text-muted">Next step requested
          <select name="nextStepRequested" defaultValue={current.nextStepRequested} className={`${inputCls} block w-full`}><option value="">—</option><option value="PRICE_INFO">Price info</option><option value="CONSULTATION_DETAILS">Consultation details</option><option value="CALLBACK">Callback</option></select>
        </label>
        <label className="text-xs text-muted">Tags (comma-separated)<input name="tags" defaultValue={current.tags} className={`${inputCls} block w-full`} /></label>
        <label className="text-xs text-muted sm:col-span-2">Reason (if moving to Lost)<input name="lostReason" className={`${inputCls} block w-full`} /></label>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-1.5"><input type="checkbox" name="appointmentIntent" defaultChecked={current.appointmentIntent} /> Wants an appointment</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name="answeredFollowUp" defaultChecked={current.answeredFollowUp} /> Answered follow-up</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name="humanHold" defaultChecked={current.humanHold} /> Human hold (pause marketing automation)</label>
      </div>
    </ApiForm>
  );
}

export function NoteForm({ leadId }: { leadId: string }) {
  return (
    <ApiForm url={`/api/admin/leads/${leadId}/notes`} submitLabel="Add note" transform={(fd) => ({ body: str(fd, "body") })}>
      <label className="sr-only" htmlFor="note-body">Note</label>
      <textarea id="note-body" name="body" rows={2} required maxLength={4000} placeholder="Add a note (avoid unnecessary clinical detail)" className={`${inputCls} w-full`} />
    </ApiForm>
  );
}

export function TaskForm({ leadId, staff }: { leadId: string; staff: Opt[] }) {
  return (
    <ApiForm
      url={`/api/admin/leads/${leadId}/tasks`}
      submitLabel="Create task"
      className="mt-3 border-t border-forest/10 pt-3"
      transform={(fd) => ({ title: str(fd, "title"), dueAt: str(fd, "dueAt"), ownerId: str(fd, "ownerId") || null })}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input name="title" required placeholder="Follow-up task" className={inputCls} aria-label="Task title" />
        <input name="dueAt" type="datetime-local" required className={inputCls} aria-label="Due (clinic time)" title="Clinic time (Istanbul)" />
        <select name="ownerId" className={inputCls} aria-label="Owner"><option value="">Me</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>
    </ApiForm>
  );
}

export function OverrideForm({ leadId }: { leadId: string }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-forest">Override priority…</summary>
      <ApiForm
        url={`/api/admin/leads/${leadId}/score-override`}
        submitLabel="Save override"
        transform={(fd) => ({ total: str(fd, "total") === "" ? null : Number(str(fd, "total")), reason: str(fd, "reason") })}
      >
        <div className="mt-2 grid gap-2 sm:grid-cols-[6rem_1fr]">
          <input name="total" type="number" min={0} max={100} placeholder="0–100" className={inputCls} aria-label="Override score (blank clears)" />
          <input name="reason" required minLength={5} placeholder="Reason (audited)" className={inputCls} aria-label="Reason" />
        </div>
      </ApiForm>
    </details>
  );
}

export function ConsentForm({ leadId }: { leadId: string }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-forest">Record permission change…</summary>
      <ApiForm
        url={`/api/admin/leads/${leadId}/consent`}
        submitLabel="Record"
        transform={(fd) => ({ channel: str(fd, "channel"), purpose: str(fd, "purpose"), status: str(fd, "status"), source: str(fd, "source"), evidence: str(fd, "evidence"), noticeVersion: str(fd, "noticeVersion") })}
      >
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <select name="channel" className={inputCls} aria-label="Channel"><option>EMAIL</option><option>WHATSAPP</option><option>PHONE</option></select>
          <select name="purpose" className={inputCls} aria-label="Purpose"><option value="MARKETING">Marketing</option><option value="SERVICE">Service</option></select>
          <select name="status" className={inputCls} aria-label="Status"><option value="REVOKED">Revoke</option><option value="GRANTED">Grant</option></select>
          <input name="source" required placeholder="Source (e.g. phone call)" className={inputCls} aria-label="Source" />
          <input name="evidence" required placeholder="Evidence / what was said" className={inputCls} aria-label="Evidence" />
          <input name="noticeVersion" required defaultValue="draft-2026-10" className={inputCls} aria-label="Notice version" />
        </div>
      </ApiForm>
    </details>
  );
}

export function ConfirmRequestForm({ requestId, clinicians }: { requestId: string; clinicians: Opt[] }) {
  return (
    <details>
      <summary className="cursor-pointer rounded-lg bg-forest px-3 py-1.5 text-ivory">Confirm appointment…</summary>
      <ApiForm
        url={`/api/admin/appointment-requests/${requestId}/confirm`}
        submitLabel="Confirm appointment"
        transform={(fd) => ({
          startAt: str(fd, "startAt"),
          durationMinutes: Number(str(fd, "duration") || 30),
          clinicianId: str(fd, "clinicianId") || null,
          slotAgreed: fd.get("slotAgreed") === "on",
        })}
      >
        <div className="mt-2 grid gap-2">
          <input name="startAt" type="datetime-local" required className={inputCls} aria-label="Start (clinic time)" />
          <p className="text-[11px] text-muted">Times are in clinic time (Istanbul), whatever your device timezone.</p>
          <select name="duration" className={inputCls} aria-label="Duration"><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option><option value="90">90 min</option></select>
          <select name="clinicianId" className={inputCls} aria-label="Clinician"><option value="">No clinician yet</option>{clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" name="slotAgreed" /> I have agreed this time with the patient and it is in the clinic diary.</label>
        </div>
      </ApiForm>
    </details>
  );
}
