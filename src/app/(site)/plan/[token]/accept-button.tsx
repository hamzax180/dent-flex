"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Records that the patient wants to book, then opens the booking flow with the treatment preset. */
export function AcceptPlanButton({ token, treatment, label }: { token: string; treatment: string | null; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/public/plans/${token}/accept`, { method: "POST" }).catch(() => undefined);
        router.push(`/contact${treatment ? `?treatment=${encodeURIComponent(treatment)}` : ""}#request`);
      }}
      className="flex items-center justify-center gap-3 rounded-2xl bg-forest px-7 py-4 font-medium text-ivory shadow-[0_18px_40px_-18px_rgba(31,51,41,0.9)] transition hover:-translate-y-0.5 hover:bg-forest-700 disabled:opacity-60"
    >
      {label} <span aria-hidden>→</span>
    </button>
  );
}

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-2xl border border-forest/20 bg-white px-6 py-4 font-medium text-forest transition hover:bg-sage-50">
      {label}
    </button>
  );
}
