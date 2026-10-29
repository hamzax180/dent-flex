import type { Testimonial } from "@prisma/client";

const SOURCE: Record<string, string> = { GOOGLE: "Google review", TRUSTPILOT: "Trustpilot review", CLINIC: "Verified patient" };

/** Genuine patient reviews (published + consented). Slow, endless marquee on wide screens; swipe row on phones. */
export function Reviews({ items }: { items: Pick<Testimonial, "id" | "author" | "country" | "treatment" | "quote" | "rating" | "source" | "sourceUrl">[] }) {
  const loop = items.length >= 3 ? [...items, ...items] : items;
  return (
    <div className="reveal relative mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
      <ul className={`flex gap-5 ${items.length >= 3 ? "df-marquee w-max" : "no-scrollbar snap-x overflow-x-auto"}`}>
        {loop.map((r, i) => (
          <li key={`${r.id}-${i}`} aria-hidden={i >= items.length ? true : undefined} className="w-[82vw] max-w-[380px] shrink-0 snap-start">
            <figure className="flex h-full flex-col rounded-3xl bg-white p-7 shadow-[0_20px_50px_-30px_rgba(31,51,41,0.45)] ring-1 ring-forest/[0.06]">
              <p className="text-gold" aria-label={`${r.rating} out of 5 stars`}>{"★".repeat(r.rating)}<span className="text-forest/15">{"★".repeat(5 - r.rating)}</span></p>
              <blockquote className="mt-4 flex-1 font-display text-xl font-light leading-snug text-forest">“{r.quote}”</blockquote>
              <figcaption className="mt-6 flex items-center justify-between gap-3 border-t border-forest/[0.07] pt-4 text-sm">
                <span>
                  <span className="block font-medium text-ink">{r.author}{r.country ? `, ${r.country}` : ""}</span>
                  {r.treatment && <span className="block text-xs text-muted">{r.treatment}</span>}
                </span>
                {r.sourceUrl ? (
                  <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full bg-sage-50 px-3 py-1 text-[11px] text-forest hover:bg-sage/40">{SOURCE[r.source]} ↗</a>
                ) : (
                  <span className="shrink-0 rounded-full bg-sage-50 px-3 py-1 text-[11px] text-forest">{SOURCE[r.source]}</span>
                )}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
