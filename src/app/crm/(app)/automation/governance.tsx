"use client";

import { ApiForm, str } from "@/components/crm/actions";
import { inputCls } from "@/components/crm/ui";
import type { AutomationGovernance } from "@/lib/settings";

export function NewWorkflowForm() {
  return (
    <ApiForm url="/api/admin/automation/workflows" submitLabel="Create blank workflow" className="mt-4 border-t border-forest/10 pt-3" transform={(fd) => ({ name: str(fd, "name") })}>
      <input name="name" required minLength={3} placeholder="New workflow name" className="w-full rounded-lg border border-forest/20 px-3 py-1.5" aria-label="Workflow name" />
    </ApiForm>
  );
}

export function GovernanceForm({ initial }: { initial: AutomationGovernance }) {
  return (
    <ApiForm
      url="/api/admin/settings/automation_governance"
      method="PUT"
      resetOnSuccess={false}
      submitLabel="Save governance"
      transform={(fd) => ({
        globalPause: fd.get("globalPause") === "on",
        quietHoursStart: str(fd, "quietHoursStart"),
        quietHoursEnd: str(fd, "quietHoursEnd"),
        marketingCapPerWeek: Number(str(fd, "cap")),
        messageExpiryHours: Number(str(fd, "expiry")),
        webhookAllowlist: str(fd, "allow").split(/\s+/).filter(Boolean),
      })}
    >
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="col-span-2 flex items-center gap-2 font-medium text-danger"><input type="checkbox" name="globalPause" defaultChecked={initial.globalPause} /> Global pause (stop all automated steps and sends)</label>
        <label className="text-muted">Quiet hours start<input type="time" name="quietHoursStart" defaultValue={initial.quietHoursStart} className={`${inputCls} block w-full`} /></label>
        <label className="text-muted">Quiet hours end<input type="time" name="quietHoursEnd" defaultValue={initial.quietHoursEnd} className={`${inputCls} block w-full`} /></label>
        <label className="text-muted">Marketing messages / lead / 7 days<input type="number" min={0} max={14} name="cap" defaultValue={initial.marketingCapPerWeek} className={`${inputCls} block w-full`} /></label>
        <label className="text-muted">Message expiry (hours)<input type="number" min={1} max={720} name="expiry" defaultValue={initial.messageExpiryHours} className={`${inputCls} block w-full`} /></label>
        <label className="col-span-2 text-muted">Webhook URL allowlist (prefixes, space-separated)<input name="allow" defaultValue={initial.webhookAllowlist.join(" ")} className={`${inputCls} block w-full`} /></label>
      </div>
    </ApiForm>
  );
}
