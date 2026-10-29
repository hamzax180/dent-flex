"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Dict, Lang } from "@/lib/i18n";
import { Logo } from "./chrome";
import { LangToggle } from "./lang-toggle";

/**
 * The bar scrolls away with the page (transparent over the home hero, white on inner pages);
 * only the square menu button stays pinned top-left. Centre: logo. Right: contact button.
 */
export function SiteHeader({ t, lang, phone }: { t: Dict; lang: Lang; phone: string | null }) {
  const path = usePathname();
  const overHero = path === "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const opener = menuBtnRef.current;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      opener?.focus();
    };
  }, [open]);

  const solid = !overHero;
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-24 focus:top-3 focus:z-[60] focus:bg-forest focus:px-3 focus:py-2 focus:text-ivory">Skip to content</a>
      <header
        className={`site-header ${overHero ? "over-hero absolute" : "relative"} inset-x-0 top-0 z-40 ${solid ? "bg-white text-forest shadow-[0_1px_0_rgba(31,51,41,0.08)]" : "bg-transparent text-ivory"}`}
      >
        <div className="relative flex h-[72px] items-center sm:h-[88px]">
          {/* Space for the pinned menu button */}
          <span className="h-full w-[72px] shrink-0 sm:w-[88px]" aria-hidden />
          <Link href="/" aria-label="Dent Flex home" className="absolute left-1/2 -translate-x-1/2">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-3 pr-4 sm:pr-6">
            <Link href="/contact" className="hidden bg-sage px-5 py-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-forest hover:bg-[#cdd3b6] md:inline-block">
              {phone ? `${lang === "tr" ? "Arayın" : "Call us"} ${phone}` : t.nav.contact}
            </Link>
          </div>
        </div>
      </header>

      {/* The only thing that stays on screen while scrolling */}
      <button
        ref={menuBtnRef}
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={t.menu.open}
        className={`site-menu-btn ${overHero ? "over-hero" : ""} fixed left-0 top-0 z-40 flex size-[72px] items-center justify-center bg-sage text-forest transition-[background-color,box-shadow] hover:bg-[#cdd3b6] sm:size-[88px] ${scrolled ? "shadow-[0_10px_30px_-10px_rgba(20,35,28,0.45)]" : ""}`}
      >
        <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden><path d="M0 1h26M0 9h26M0 17h26" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>

      {open && (
        <div id="site-menu" role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-50 overflow-y-auto bg-forest text-ivory">
          <div className="flex h-[72px] items-center sm:h-[88px]">
            <button ref={closeRef} onClick={() => setOpen(false)} aria-label={t.menu.close} className="flex h-full w-[72px] items-center justify-center bg-sage text-forest sm:w-[88px]">
              <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden><path d="M2 2l18 18M20 2L2 20" stroke="currentColor" strokeWidth="1.6" /></svg>
            </button>
            <Link href="/" className="absolute left-1/2 -translate-x-1/2"><Logo /></Link>
          </div>
          <div className="mx-auto max-w-6xl px-6 pt-12">
            <Link href="/" onClick={() => setOpen(false)} className="group inline-flex items-center gap-3 text-ivory/85 hover:text-sage">
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" /></svg>
              <span className="display text-3xl">{lang === "tr" ? "Ana sayfa" : "Home"}</span>
            </Link>
          </div>
          <nav aria-label="Main" className="mx-auto grid max-w-6xl gap-12 px-6 pb-16 pt-10 md:grid-cols-3">
            {t.menu.groups.map(([title, links]) => (
              <div key={title}>
                <h2 className="display text-4xl text-ivory">{title}</h2>
                <ul className="mt-6 space-y-3 border-t border-ivory/15 pt-6">
                  {links.map(([href, label]) => (
                    <li key={href}>
                      <Link href={href} onClick={() => setOpen(false)} className="text-lg font-light text-ivory/85 hover:text-sage">{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 pb-16">
            <Link href="/contact#request" onClick={() => setOpen(false)} className="inline-flex items-center gap-3 bg-sage px-7 py-3 font-medium text-forest">
              {t.nav.book}
            </Link>
            <div className="flex items-center gap-3 border border-ivory/20 px-3 py-1.5">
              <span className="text-[0.7rem] uppercase tracking-[0.16em] text-ivory/50">{lang === "tr" ? "Dil" : "Language"}</span>
              <LangToggle lang={lang} light />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
