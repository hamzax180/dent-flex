"use client";

import { Orb } from "./assistant-widget";
import type { Lang } from "@/lib/i18n";

/** Listened for in AssistantWidget. */
export const OPEN_ASSISTANT_EVENT = "df:open-assistant";

type Member = { name: string; hue: number };

/** Opens the AI coordinator from anywhere (e.g. the mobile bottom bar). */
export function AskButton({ name, team = [], lang = "en", className = "" }: { name: string; team?: Member[]; lang?: Lang; className?: string }) {
  const tr = lang === "tr";
  const faces = team.length ? team.slice(0, 3) : [{ name, hue: 100 }];
  return (
    <button
      type="button"
      onClick={(e) => window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT, { detail: { rect: e.currentTarget.getBoundingClientRect() } }))}
      aria-label={tr ? "Bakım ekibimizle konuşun ve randevu alın" : "Talk to our care team and book your appointment"}
      className={`group flex w-full items-center gap-3 rounded-2xl bg-forest py-2 pl-2 pr-4 text-left text-ivory shadow-[0_10px_30px_-12px_rgba(31,51,41,0.7)] transition active:scale-[0.99] ${className}`}
    >
      <span className="flex shrink-0 -space-x-3">
        {faces.map((m) => (
          <span key={m.name} className="rounded-full ring-2 ring-forest"><Orb size={36} hue={m.hue} initial={m.name[0]} /></span>
        ))}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[15px] font-medium">{tr ? "Randevunuzu alın" : "Book your appointment"}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-sage">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-[#9be29b]" aria-hidden />
          {team.length ? (tr ? `${team.length} danışman çevrimiçi` : `${team.length} coordinators online`) : tr ? "Şimdi çevrimiçi" : "Online now"}
        </span>
      </span>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sage text-forest transition group-active:translate-x-0.5" aria-hidden>
        <svg viewBox="0 0 16 16" className="size-4"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </button>
  );
}
