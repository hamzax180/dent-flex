"use client";

import { Orb } from "./assistant-widget";

/** Listened for in AssistantWidget. */
export const OPEN_ASSISTANT_EVENT = "df:open-assistant";

/** Opens the AI coordinator from anywhere (e.g. the mobile bottom bar). */
export function AskButton({ name, className = "" }: { name: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT, { detail: { rect: e.currentTarget.getBoundingClientRect() } }))}
      aria-label={`Talk to ${name}, our AI care coordinator`}
      className={`flex items-center gap-2 bg-forest pl-1.5 pr-3 text-ivory ${className}`}
    >
      <Orb size={30} />
      <span className="text-xs font-medium">{name}</span>
    </button>
  );
}
