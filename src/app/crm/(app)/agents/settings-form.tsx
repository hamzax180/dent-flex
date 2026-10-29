"use client";

import { ApiForm, str } from "@/components/crm/actions";
import { inputCls } from "@/components/crm/ui";

const VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"];

export function AgentSettingsForm({ id, initial }: { id: string; initial: { name: string; tagline: string; style: string; voice: string; maxConcurrent: number } }) {
  const L = "text-xs text-muted";
  return (
    <ApiForm
      url={`/api/admin/ai-agents/${id}`}
      method="PATCH"
      resetOnSuccess={false}
      submitLabel="Save agent"
      className="mt-3"
      transform={(fd) => ({ name: str(fd, "name"), tagline: str(fd, "tagline"), style: str(fd, "style"), voice: str(fd, "voice"), maxConcurrent: Number(str(fd, "maxConcurrent")) })}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={L}>Name<input name="name" required defaultValue={initial.name} className={`${inputCls} block w-full`} /></label>
        <label className={L}>Speciality (shown to visitors)<input name="tagline" required defaultValue={initial.tagline} className={`${inputCls} block w-full`} /></label>
        <label className={`${L} sm:col-span-2`}>Personality (how they talk)<textarea name="style" required rows={2} defaultValue={initial.style} className={`${inputCls} block w-full`} /></label>
        <label className={L}>Voice
          <select name="voice" defaultValue={initial.voice} className={`${inputCls} block w-full`}>{VOICES.map((v) => <option key={v}>{v}</option>)}</select>
        </label>
        <label className={L}>Max live chats at once<input name="maxConcurrent" type="number" min={1} max={20} defaultValue={initial.maxConcurrent} className={`${inputCls} block w-full`} /></label>
      </div>
    </ApiForm>
  );
}
