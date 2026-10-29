import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import type { ClinicInfo } from "@/lib/settings";
import { AskButton } from "./ask-button";

/** Original Dent Flex mark: two interlocking arcs in a rounded square, with a light spaced wordmark. */
export function Logo({ className = "", tone = "current" }: { className?: string; tone?: "current" | "light" }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${tone === "light" ? "text-ivory" : ""} ${className}`}>
      <svg viewBox="0 0 34 34" fill="none" aria-hidden className="size-7 sm:size-[34px]">
        <rect x="1" y="1" width="32" height="32" rx="9" stroke="currentColor" strokeWidth="1.2" />
        <path d="M9 22c0-6 3.5-10 8-10s8 4 8 10" stroke="currentColor" strokeWidth="1.2" />
        <path d="M13 22c0-3.5 1.8-6 4-6s4 2.5 4 6" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="whitespace-nowrap font-display text-base font-light tracking-[0.16em] sm:text-[1.15rem] sm:tracking-[0.18em]">DENT FLEX</span>
        <span className="mt-1 hidden whitespace-nowrap text-[0.55rem] font-medium tracking-[0.32em] opacity-80 sm:block">DENTAL CLINIC · ISTANBUL</span>
      </span>
    </span>
  );
}

/** Square-cornered button system. */
export function Btn({
  href, children, variant = "sage", arrow = false, className = "",
}: { href: string; children: React.ReactNode; variant?: "sage" | "dark" | "outline-light" | "outline-dark"; arrow?: boolean; className?: string }) {
  const v = {
    sage: "bg-sage text-forest hover:bg-[#cdd3b6]",
    dark: "bg-forest text-ivory hover:bg-forest-700",
    "outline-light": "border border-ivory/70 text-ivory hover:bg-ivory/10",
    "outline-dark": "border border-forest/40 text-forest hover:bg-forest/5",
  }[variant];
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-3 px-7 py-3 text-[0.9375rem] font-medium transition-colors ${v} ${className}`}>
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}

export function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M1 7h11M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Simple original line icons for treatment tiles and feature cards. */
export function LineIcon({ name, className = "size-7" }: { name: string; className?: string }) {
  const common = { stroke: "currentColor", strokeWidth: 1.3, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    consultation: <><circle cx="12" cy="12" r="8" {...common} /><path d="M12 8v4l3 2" {...common} /></>,
    hygiene: <><path d="M5 19l9-9M14 10l3-6 3 3-6 3" {...common} /><path d="M4 14l2 2" {...common} /></>,
    whitening: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" {...common} /><circle cx="12" cy="12" r="3" {...common} /></>,
    implants: <><path d="M8 4h8l-1 5H9z" {...common} /><path d="M10 9v11M14 9v11M9 12h6M9 15h6M9 18h6" {...common} /></>,
    veneers: <><rect x="6" y="4" width="12" height="16" rx="5" {...common} /><path d="M9 9h6" {...common} /></>,
    orthodontics: <><path d="M3 12h18" {...common} /><rect x="5" y="9" width="4" height="6" rx="1" {...common} /><rect x="10" y="9" width="4" height="6" rx="1" {...common} /><rect x="15" y="9" width="4" height="6" rx="1" {...common} /></>,
    talk: <><path d="M4 5h16v10H9l-5 4z" {...common} /></>,
    price: <><path d="M4 12l8-8h8v8l-8 8z" {...common} /><circle cx="16" cy="8" r="1.5" {...common} /></>,
    globe: <><circle cx="12" cy="12" r="8" {...common} /><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" {...common} /></>,
    person: <><circle cx="12" cy="8" r="3.5" {...common} /><path d="M5 20c1-4 4-6 7-6s6 2 7 6" {...common} /></>,
    pin: <><path d="M12 21s-6-6-6-11a6 6 0 0112 0c0 5-6 11-6 11z" {...common} /><circle cx="12" cy="10" r="2" {...common} /></>,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {paths[name] ?? paths.consultation}
    </svg>
  );
}

export function SiteFooter({ t, clinic }: { t: Dict; clinic: ClinicInfo }) {
  return (
    <footer className="bg-forest px-4 pb-28 pt-0 sm:px-6 sm:pb-10">
      <div className="mx-auto max-w-7xl bg-ivory p-8 text-forest sm:p-12">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_repeat(3,1fr)]">
          <div className="space-y-5 text-sm">
            <Logo />
            <div>
              <p className="eyebrow text-[0.65rem] text-muted">{t.contact.address}</p>
              <p className="mt-1">{clinic.addressLines.join(", ")}<br />{clinic.city}</p>
            </div>
            <div>
              <p className="eyebrow text-[0.65rem] text-muted">{t.contact.phone}</p>
              <p className="mt-1">{clinic.phone}</p>
            </div>
            <div>
              <p className="eyebrow text-[0.65rem] text-muted">{t.contact.email}</p>
              <p className="mt-1">{clinic.email}</p>
            </div>
          </div>
          {t.menu.groups.map(([title, links]) => (
            <nav key={title} aria-label={title}>
              <h2 className="display text-2xl">{title}</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {links.map(([href, label]) => (
                  <li key={href}><Link href={href} className="underline-offset-4 hover:underline">{label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 grid gap-6 border-t border-forest/15 pt-6 text-xs text-muted md:grid-cols-[1fr_auto]">
          <p><span className="font-medium text-forest">{t.footer.emergency}:</span> {clinic.emergencyText}</p>
          <p className="flex gap-5"><Link href="/privacy" className="hover:underline">{t.footer.privacy}</Link><Link href="/crm" className="hover:underline">Staff</Link></p>
        </div>
        <p className="mt-4 text-[11px] text-muted">{t.footer.rights}</p>
      </div>
    </footer>
  );
}

/**
 * Mobile bottom bar: booking CTA + the AI coordinator in one place, so nothing floats over content.
 * Respects the iPhone home-indicator safe area. The footer has matching bottom padding.
 */
export function MobileCta({ t, assistantName }: { t: Dict; assistantName: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-forest/10 bg-white/95 px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
      <Link href="/contact#request" className="flex flex-1 items-center justify-center gap-2.5 bg-sage py-3 text-sm font-medium text-forest">
        {t.nav.book} <Arrow />
      </Link>
      <AskButton name={assistantName} />
    </div>
  );
}

export function PhotoPlaceholder({ label, className = "", drift = false }: { label: string; className?: string; drift?: boolean }) {
  return (
    <div className={`relative overflow-hidden ${className}`} role="img" aria-label={`Placeholder: ${label}`}>
      <div className={`photo-placeholder grain absolute inset-0 ${drift ? "drift" : ""}`} />
      <span className="absolute left-3 top-3 bg-white/85 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.14em] text-forest sm:text-[10px]">
        Photo placeholder · {label}
      </span>
    </div>
  );
}

export function SectionHeading({ eyebrow, title, intro, light = false }: { eyebrow?: string; title: string; intro?: string; light?: boolean }) {
  return (
    <div className="max-w-2xl">
      {eyebrow && <p className={`eyebrow ${light ? "text-sage" : "text-muted"}`}>{eyebrow}</p>}
      <h2 className={`display mt-3 text-4xl sm:text-[3.25rem] ${light ? "text-ivory" : "text-forest"}`}>{title}</h2>
      {intro && <p className={`mt-5 leading-relaxed ${light ? "text-ivory/80" : "text-muted"}`}>{intro}</p>}
    </div>
  );
}
