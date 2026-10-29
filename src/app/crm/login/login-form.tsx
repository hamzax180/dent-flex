"use client";

import { useState } from "react";

export function LoginForm() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      method="post"
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
        }).catch(() => null);
        if (res?.ok) {
          window.location.href = "/crm";
          return;
        }
        const data = await res?.json().catch(() => null);
        setErr(data?.error?.message ?? "Sign-in failed. Check your connection.");
        setBusy(false);
      }}
    >
      <div>
        <label htmlFor="email" className="block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="mt-1 w-full rounded-lg border border-forest/20 px-3 py-2 focus:border-forest focus:outline-none" />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border border-forest/20 px-3 py-2 focus:border-forest focus:outline-none" />
      </div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-forest py-2.5 text-sm font-medium text-ivory hover:bg-forest-700 disabled:opacity-60">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
