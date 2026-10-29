"use client";

import { useState } from "react";

export function UnsubscribeButton({ t, s }: { t: string; s: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function go() {
    setState("busy");
    const res = await fetch(`/api/public/unsubscribe?t=${encodeURIComponent(t)}&s=${encodeURIComponent(s)}`, { method: "POST" }).catch(() => null);
    setState(res?.ok ? "done" : "error");
  }
  if (state === "done") return <p role="status" className="mt-8 font-medium text-forest">You have been unsubscribed.</p>;
  return (
    <div className="mt-8">
      <button onClick={go} disabled={state === "busy" || !t} className="bg-forest px-8 py-3 text-ivory disabled:opacity-60">
        Confirm unsubscribe
      </button>
      {state === "error" && <p role="alert" className="mt-4 text-sm text-danger">This link is invalid or has expired. Please contact the clinic.</p>}
    </div>
  );
}
