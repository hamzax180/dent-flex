"use client";

import { ApiForm, str } from "@/components/crm/actions";
import { inputCls } from "@/components/crm/ui";

export function JsonSettingForm({ settingKey, initial }: { settingKey: string; initial: unknown }) {
  return (
    <ApiForm
      url={`/api/admin/settings/${settingKey}`}
      method="PUT"
      resetOnSuccess={false}
      submitLabel="Save"
      transform={(fd) => {
        try {
          return JSON.parse(str(fd, "json"));
        } catch {
          throw new Error("Not valid JSON.");
        }
      }}
    >
      <textarea name="json" rows={14} spellCheck={false} defaultValue={JSON.stringify(initial, null, 2)} className={`${inputCls} w-full font-mono text-xs`} aria-label={`${settingKey} JSON`} />
    </ApiForm>
  );
}

export function NewUserForm() {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-forest">Add staff member…</summary>
      <ApiForm url="/api/admin/users" submitLabel="Create" transform={(fd) => ({ name: str(fd, "name"), email: str(fd, "email"), role: str(fd, "role"), password: str(fd, "password") })}>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input name="name" required placeholder="Name" className={inputCls} aria-label="Name" />
          <input name="email" type="email" required placeholder="Email" className={inputCls} aria-label="Email" />
          <select name="role" className={inputCls} aria-label="Role"><option value="RECEPTIONIST">Receptionist</option><option value="CLINICIAN">Clinician</option><option value="ADMIN">Admin</option></select>
          <input name="password" type="password" required minLength={12} placeholder="Temporary password (12+)" autoComplete="new-password" className={inputCls} aria-label="Temporary password" />
        </div>
      </ApiForm>
    </details>
  );
}
