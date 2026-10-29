"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ApiErr = { error?: { message?: string; fields?: Record<string, string> } };

export async function callApi(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as ApiErr & Record<string, unknown>;
  if (!res.ok) {
    const fields = data.error?.fields ? ` (${Object.values(data.error.fields).join("; ")})` : "";
    throw new Error((data.error?.message ?? `Request failed (${res.status})`) + fields);
  }
  return data;
}

/** True once React has hydrated: controls stay disabled until their handlers are attached. */
function useHydrated() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

/** A button that calls an API endpoint, shows errors inline and refreshes server data. */
export function ActionButton({
  url, method = "POST", body, label, confirm, variant = "secondary", onDone,
}: { url: string; method?: string; body?: unknown; label: string; confirm?: string; variant?: "primary" | "secondary" | "danger"; onDone?: (d: unknown) => void }) {
  const router = useRouter();
  const ready = useHydrated();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cls = {
    primary: "bg-forest text-ivory hover:bg-forest-700",
    secondary: "border border-forest/25 bg-white text-forest hover:bg-sage-50",
    danger: "border border-danger/30 bg-white text-danger hover:bg-danger/5",
  }[variant];
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy || !ready}
        className={`rounded-lg px-3 py-1.5 text-sm disabled:opacity-50 ${cls}`}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setErr(null);
          try {
            const d = await callApi(method, url, body ?? {});
            onDone?.(d);
            router.refresh();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "…" : label}
      </button>
      {err && <span role="alert" className="mt-1 max-w-xs text-xs text-danger">{err}</span>}
    </span>
  );
}

/**
 * Small form that serialises its fields to JSON. `transform` maps FormData to the API body.
 */
export function ApiForm({
  url, method = "POST", transform, children, submitLabel, className = "", resetOnSuccess = true, onDone, headers,
}: {
  url: string; method?: string; transform: (fd: FormData) => unknown; children: React.ReactNode; submitLabel: string; className?: string; resetOnSuccess?: boolean; onDone?: (d: unknown) => void; headers?: Record<string, string>;
}) {
  const router = useRouter();
  const ready = useHydrated();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  return (
    <form
      // POST so that a submit before hydration can never put field values in the URL.
      method="post"
      className={className}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setErr(null);
        setOk(false);
        try {
          const d = await callApi(method, url, transform(new FormData(form)), headers);
          if (resetOnSuccess) form.reset();
          setOk(true);
          onDone?.(d);
          router.refresh();
        } catch (e2) {
          setErr((e2 as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={busy || !ready} className="rounded-lg bg-forest px-3 py-1.5 text-sm text-ivory hover:bg-forest-700 disabled:opacity-50">
          {busy ? "Saving…" : submitLabel}
        </button>
        {ok && <span role="status" className="text-xs text-forest">Saved</span>}
        {err && <span role="alert" className="text-xs text-danger">{err}</span>}
      </div>
    </form>
  );
}

export const str = (fd: FormData, k: string) => ((fd.get(k) as string | null) ?? "").trim();
export const optStr = (fd: FormData, k: string) => str(fd, k) || undefined;
