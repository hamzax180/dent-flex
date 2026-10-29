"use client";

import { useRouter } from "next/navigation";
import type { Lang } from "@/lib/i18n";

export function LangToggle({ lang, light = false }: { lang: Lang; light?: boolean }) {
  const router = useRouter();
  const set = (l: Lang) => {
    document.cookie = `df_lang=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <div className="flex text-[0.7rem] font-semibold tracking-[0.12em]" role="group" aria-label="Language">
      {(["en", "tr"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => set(l)}
          aria-pressed={lang === l}
          className={`px-2 py-1.5 uppercase transition-colors ${lang === l ? (light ? "text-ivory underline underline-offset-4" : "text-forest underline underline-offset-4") : light ? "text-ivory/60 hover:text-ivory" : "text-forest/50 hover:text-forest"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
