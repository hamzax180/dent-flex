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

type TeamInit = { name: string; title: string; bio: string; photoUrl: string | null; isPlaceholder: boolean; status: string; sortOrder: number };

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
        isPlaceholder: on(fd, "isPlaceholder"), status: on(fd, "published") ? "PUBLISHED" : "DRAFT", sortOrder: Number(str(fd, "sortOrder") || 0),
      })}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={L}>Name<input name="name" required defaultValue={i?.name} className={field} /></label>
        <label className={L}>Role & verified credentials<input name="title" required defaultValue={i?.title} className={field} /></label>
        <label className={`${L} sm:col-span-2`}>Biography<textarea name="bio" required rows={3} defaultValue={i?.bio} className={field} /></label>
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
