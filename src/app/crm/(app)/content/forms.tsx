"use client";

import { ApiForm, str } from "@/components/crm/actions";
import { inputCls } from "@/components/crm/ui";

const L = "text-xs text-muted";
const field = `${inputCls} block w-full`;
const on = (fd: FormData, k: string) => fd.get(k) === "on";

type TreatmentInit = { slug?: string; nameEn: string; nameTr: string; summaryEn: string; summaryTr: string; active: boolean; approved: boolean; sortOrder: number };

/** Create (no id) or edit a treatment's public wording. */
export function TreatmentForm({ id, initial }: { id?: string; initial?: TreatmentInit }) {
  const i = initial;
  return (
    <ApiForm
      url={id ? `/api/admin/content/treatments/${id}` : "/api/admin/content/treatments"}
      method={id ? "PATCH" : "POST"}
      resetOnSuccess={!id}
      submitLabel={id ? "Save treatment" : "Add treatment"}
      className="mt-3"
      transform={(fd) => ({
        ...(id ? {} : { slug: str(fd, "slug") }),
        nameEn: str(fd, "nameEn"), nameTr: str(fd, "nameTr"),
        summaryEn: str(fd, "summaryEn"), summaryTr: str(fd, "summaryTr"),
        active: on(fd, "active"), approved: on(fd, "approved"), sortOrder: Number(str(fd, "sortOrder") || 0),
      })}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {!id && <label className={`${L} sm:col-span-2`}>URL name (permanent)<input name="slug" required pattern="[a-z0-9-]{2,60}" placeholder="e.g. root-canal" className={field} /></label>}
        <label className={L}>Name (English)<input name="nameEn" required defaultValue={i?.nameEn} className={field} /></label>
        <label className={L}>Name (Türkçe)<input name="nameTr" required defaultValue={i?.nameTr} className={field} /></label>
        <label className={L}>Description (English)<textarea name="summaryEn" required rows={4} defaultValue={i?.summaryEn} className={field} /></label>
        <label className={L}>Description (Türkçe)<textarea name="summaryTr" required rows={4} defaultValue={i?.summaryTr} className={field} /></label>
        <label className={L}>Order<input name="sortOrder" type="number" min={0} max={999} defaultValue={i?.sortOrder ?? 0} className={field} /></label>
        <div className="flex items-end gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" name="approved" defaultChecked={i?.approved ?? false} /> Wording approved by clinic</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" name="active" defaultChecked={i?.active ?? true} /> Show on site</label>
        </div>
      </div>
    </ApiForm>
  );
}

type FaqInit = { questionEn: string; answerEn: string; questionTr: string; answerTr: string; status: string; sortOrder: number };

export function FaqForm({ id, initial }: { id?: string; initial?: FaqInit }) {
  const i = initial;
  return (
    <ApiForm
      url={id ? `/api/admin/content/faqs/${id}` : "/api/admin/content/faqs"}
      method={id ? "PATCH" : "POST"}
      resetOnSuccess={!id}
      submitLabel={id ? "Save FAQ" : "Add FAQ"}
      className="mt-3"
      transform={(fd) => ({
        questionEn: str(fd, "questionEn"), answerEn: str(fd, "answerEn"), questionTr: str(fd, "questionTr"), answerTr: str(fd, "answerTr"),
        status: on(fd, "published") ? "PUBLISHED" : "DRAFT", sortOrder: Number(str(fd, "sortOrder") || 0),
      })}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={L}>Question (English)<input name="questionEn" required defaultValue={i?.questionEn} className={field} /></label>
        <label className={L}>Question (Türkçe)<input name="questionTr" required defaultValue={i?.questionTr} className={field} /></label>
        <label className={L}>Answer (English)<textarea name="answerEn" required rows={3} defaultValue={i?.answerEn} className={field} /></label>
        <label className={L}>Answer (Türkçe)<textarea name="answerTr" required rows={3} defaultValue={i?.answerTr} className={field} /></label>
        <label className={L}>Order<input name="sortOrder" type="number" min={0} max={999} defaultValue={i?.sortOrder ?? 0} className={field} /></label>
        <label className="flex items-end gap-1.5 text-sm"><input type="checkbox" name="published" defaultChecked={i?.status === "PUBLISHED"} /> Published (visible + used by the AI)</label>
      </div>
    </ApiForm>
  );
}

type TeamInit = {
  name: string; title: string; bio: string; photoUrl: string | null; isPlaceholder: boolean; status: string; sortOrder: number;
  credentials: string; languages: string[]; specialties: string[];
};
const csv = (fd: FormData, k: string) => str(fd, k).split(",").map((x) => x.trim()).filter(Boolean);

export function TeamForm({ id, initial }: { id?: string; initial?: TeamInit }) {
  const i = initial;
  return (
    <ApiForm
      url={id ? `/api/admin/content/team/${id}` : "/api/admin/content/team"}
      method={id ? "PATCH" : "POST"}
      resetOnSuccess={!id}
      submitLabel={id ? "Save profile" : "Add team member"}
      className="mt-3"
      transform={(fd) => ({
        name: str(fd, "name"), title: str(fd, "title"), bio: str(fd, "bio"), photoUrl: str(fd, "photoUrl"),
        credentials: str(fd, "credentials"), languages: csv(fd, "languages"), specialties: csv(fd, "specialties"),
        isPlaceholder: on(fd, "isPlaceholder"), status: on(fd, "published") ? "PUBLISHED" : "DRAFT", sortOrder: Number(str(fd, "sortOrder") || 0),
      })}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={L}>Name<input name="name" required defaultValue={i?.name} className={field} /></label>
        <label className={L}>Role & verified credentials<input name="title" required defaultValue={i?.title} className={field} /></label>
        <label className={`${L} sm:col-span-2`}>Biography<textarea name="bio" required rows={3} defaultValue={i?.bio} className={field} /></label>
        <label className={`${L} sm:col-span-2`}>Degrees & memberships (verified)<input name="credentials" defaultValue={i?.credentials} placeholder="e.g. DDS, Istanbul University · Member, Turkish Dental Association" className={field} /></label>
        <label className={L}>Specialties (comma separated)<input name="specialties" defaultValue={i?.specialties?.join(", ")} placeholder="Implants, Veneers" className={field} /></label>
        <label className={L}>Languages (comma separated)<input name="languages" defaultValue={i?.languages?.join(", ")} placeholder="English, Türkçe" className={field} /></label>
        <label className={L}>Photo URL<input name="photoUrl" type="url" defaultValue={i?.photoUrl ?? ""} placeholder="https://…" className={field} /></label>
        <label className={L}>Order<input name="sortOrder" type="number" min={0} max={999} defaultValue={i?.sortOrder ?? 0} className={field} /></label>
        <div className="flex gap-4 text-sm sm:col-span-2">
          <label className="flex items-center gap-1.5"><input type="checkbox" name="published" defaultChecked={i?.status === "PUBLISHED"} /> Published</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" name="isPlaceholder" defaultChecked={i?.isPlaceholder ?? false} /> Still a placeholder (not verified)</label>
        </div>
      </div>
    </ApiForm>
  );
}

type ReviewInit = {
  author: string; country: string; treatment: string; quote: string; rating: number; source: string; sourceUrl: string | null;
  consentAt: Date | string | null; status: string; sortOrder: number;
};

export function ReviewForm({ id, initial }: { id?: string; initial?: ReviewInit }) {
  const i = initial;
  return (
    <ApiForm
      url={id ? `/api/admin/content/reviews/${id}` : "/api/admin/content/reviews"}
      method={id ? "PATCH" : "POST"}
      resetOnSuccess={!id}
      submitLabel={id ? "Save review" : "Add review"}
      className="mt-3"
      transform={(fd) => ({
        author: str(fd, "author"), country: str(fd, "country"), treatment: str(fd, "treatment"), quote: str(fd, "quote"),
        rating: Number(str(fd, "rating") || 5), source: str(fd, "source") || "CLINIC", sourceUrl: str(fd, "sourceUrl"),
        consent: on(fd, "consent"), status: on(fd, "published") ? "PUBLISHED" : "DRAFT", sortOrder: Number(str(fd, "sortOrder") || 0),
      })}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <label className={L}>Patient (first name + initial)<input name="author" required defaultValue={i?.author} placeholder="Sarah K." className={field} /></label>
        <label className={L}>Country<input name="country" defaultValue={i?.country} placeholder="United Kingdom" className={field} /></label>
        <label className={L}>Treatment<input name="treatment" defaultValue={i?.treatment} placeholder="Veneers" className={field} /></label>
        <label className={`${L} sm:col-span-3`}>Review (their own words)<textarea name="quote" required rows={3} defaultValue={i?.quote} className={field} /></label>
        <label className={L}>Rating
          <select name="rating" defaultValue={String(i?.rating ?? 5)} className={field}>{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{"★".repeat(r)}</option>)}</select>
        </label>
        <label className={L}>Source
          <select name="source" defaultValue={i?.source ?? "CLINIC"} className={field}><option value="GOOGLE">Google</option><option value="TRUSTPILOT">Trustpilot</option><option value="CLINIC">Collected by the clinic</option></select>
        </label>
        <label className={L}>Link to the original review<input name="sourceUrl" type="url" defaultValue={i?.sourceUrl ?? ""} placeholder="https://…" className={field} /></label>
        <label className={L}>Order<input name="sortOrder" type="number" min={0} max={999} defaultValue={i?.sortOrder ?? 0} className={field} /></label>
        <div className="flex flex-wrap gap-4 text-sm sm:col-span-3">
          <label className="flex items-center gap-1.5"><input type="checkbox" name="consent" defaultChecked={Boolean(i?.consentAt)} /> Patient gave written permission to publish</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" name="published" defaultChecked={i?.status === "PUBLISHED"} /> Published</label>
        </div>
      </div>
    </ApiForm>
  );
}
