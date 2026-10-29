"use client";

import { ApiForm, str } from "@/components/crm/actions";
import { inputCls } from "@/components/crm/ui";

export function PasswordForm() {
  return (
    <ApiForm url="/api/me/password" submitLabel="Change password" transform={(fd) => ({ current: str(fd, "current"), next: str(fd, "next"), confirm: str(fd, "confirm") })}>
      <div className="grid gap-2">
        <label className="text-xs text-muted">Current password<input name="current" type="password" required autoComplete="current-password" className={`${inputCls} block w-full`} /></label>
        <label className="text-xs text-muted">New password (12+ characters)<input name="next" type="password" required minLength={12} autoComplete="new-password" className={`${inputCls} block w-full`} /></label>
        <label className="text-xs text-muted">Repeat new password<input name="confirm" type="password" required minLength={12} autoComplete="new-password" className={`${inputCls} block w-full`} /></label>
      </div>
    </ApiForm>
  );
}
