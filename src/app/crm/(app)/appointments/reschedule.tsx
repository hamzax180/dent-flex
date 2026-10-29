"use client";

import { ApiForm, str } from "@/components/crm/actions";
import { inputCls } from "@/components/crm/ui";

export function RescheduleForm({ id }: { id: string }) {
  return (
    <details>
      <summary className="cursor-pointer rounded-lg border border-forest/25 bg-white px-3 py-1.5 text-forest">Reschedule</summary>
      <ApiForm url={`/api/admin/appointments/${id}/reschedule`} submitLabel="Save" transform={(fd) => ({ startAt: str(fd, "startAt"), durationMinutes: Number(str(fd, "duration") || 30) })}>
        <div className="mt-2 flex gap-2">
          <input type="datetime-local" name="startAt" required className={inputCls} aria-label="New time (clinic time)" title="Clinic time (Istanbul)" />
          <select name="duration" className={inputCls} aria-label="Duration"><option value="30">30</option><option value="45">45</option><option value="60">60</option></select>
        </div>
      </ApiForm>
    </details>
  );
}
