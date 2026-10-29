"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a CRM screen current: re-fetches server data every `seconds` while the tab is visible,
 * and immediately when the tab regains focus. Skips refreshes while the user is typing in a field
 * so in-progress edits are never disturbed.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [at, setAt] = useState<Date | null>(null);

  useEffect(() => {
    const busy = () => {
      const el = document.activeElement as HTMLElement | null;
      return Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) || document.querySelector("details[open] form"));
    };
    const refresh = () => {
      if (document.hidden || busy()) return;
      router.refresh();
      setAt(new Date());
    };
    setAt(new Date());
    const id = window.setInterval(refresh, seconds * 1000);
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);

  if (!at) return null;
  return (
    <p className="-mt-4 mb-4 flex items-center gap-1.5 text-[11px] text-muted" aria-live="off">
      <span className="inline-block size-1.5 animate-pulse rounded-full bg-forest/60" aria-hidden /> Live · updated {at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </p>
  );
}
