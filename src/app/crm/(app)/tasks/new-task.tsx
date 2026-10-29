"use client";

import { ApiForm, optStr, str } from "@/components/crm/actions";
import { inputCls } from "@/components/crm/ui";

/** A task not tied to a lead (e.g. "order impression trays", "call lab"). */
export function NewTaskForm({ staff, me }: { staff: { id: string; name: string }[]; me: string }) {
  return (
    <details className="mb-4 rounded-xl border border-forest/10 bg-white p-3">
      <summary className="cursor-pointer font-medium text-forest">+ New task</summary>
      <ApiForm
        url="/api/admin/tasks"
        submitLabel="Create task"
        className="mt-3"
        transform={(fd) => ({ title: str(fd, "title"), description: optStr(fd, "description"), dueAt: str(fd, "dueAt"), ownerId: str(fd, "ownerId") || null })}
      >
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input name="title" required maxLength={160} placeholder="What needs doing?" className={inputCls} aria-label="Task title" />
          <input name="dueAt" type="datetime-local" required className={inputCls} aria-label="Due (clinic time)" title="Clinic time (Istanbul)" />
          <select name="ownerId" defaultValue={me} className={inputCls} aria-label="Owner">
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <textarea name="description" rows={2} maxLength={2000} placeholder="Details (optional)" className={`${inputCls} sm:col-span-3`} aria-label="Details" />
        </div>
      </ApiForm>
    </details>
  );
}
