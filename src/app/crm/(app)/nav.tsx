"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/site/chrome";
import { Icon, type IconName } from "@/components/crm/icons";

export type NavItem = { href: string; label: string; icon: IconName; count?: number; alert?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

const isActive = (path: string, href: string) => (href === "/crm" ? path === "/crm" : path.startsWith(href));

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/crm/login";
}

function Sidebar({ groups, user, onNavigate }: { groups: NavGroup[]; user: { name: string; role: string }; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <div className="flex h-full flex-col bg-forest text-ivory">
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <Link href="/crm" onClick={onNavigate} className="text-ivory"><Logo className="text-xl" /></Link>
        <span className="rounded-full bg-ivory/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sage">CRM</span>
      </div>
      <nav aria-label="CRM" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 [scrollbar-width:none]">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ivory/40">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((n) => {
                const active = isActive(path, n.href);
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[0.85rem] transition ${
                        active ? "bg-ivory text-forest shadow-[0_6px_18px_-8px_rgba(0,0,0,0.5)]" : "text-ivory/75 hover:bg-ivory/[0.08] hover:text-ivory"
                      }`}
                    >
                      <Icon name={n.icon} className={`size-[18px] shrink-0 ${active ? "text-forest" : "text-sage"}`} />
                      <span className="flex-1 truncate">{n.label}</span>
                      {!!n.count && (
                        <span
                          className={`min-w-5 rounded-full px-1.5 py-px text-center text-[10px] font-semibold tabular-nums ${
                            n.alert ? "bg-[#e5735f] text-white" : active ? "bg-forest text-ivory" : "bg-sage text-forest"
                          }`}
                        >
                          {n.count > 99 ? "99+" : n.count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="m-3 flex items-center gap-3 rounded-2xl bg-ivory/[0.07] p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sage font-semibold text-forest">{user.name.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <Link href="/crm/account" onClick={onNavigate} className="block truncate text-sm font-medium hover:underline">{user.name}</Link>
          <p className="text-[11px] capitalize text-ivory/55">{user.role}</p>
        </div>
        <button type="button" onClick={signOut} className="rounded-lg p-1.5 text-ivory/60 transition hover:bg-ivory/10 hover:text-ivory" aria-label="Sign out" title="Sign out">
          <Icon name="logout" className="size-[18px]" />
        </button>
      </div>
    </div>
  );
}

/** Ctrl/⌘+K: jump to any page or search leads. */
function CommandMenu({ groups, open, setOpen }: { groups: NavGroup[]; open: boolean; setOpen: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const pages = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hits = pages.filter((p) => !t || p.label.toLowerCase().includes(t)).map((p) => ({ key: p.href, label: p.label, icon: p.icon, hint: "Go to", href: p.href }));
    if (t) hits.push({ key: "search", label: `Search leads for “${q.trim()}”`, icon: "search", hint: "Leads", href: `/crm/leads?q=${encodeURIComponent(q.trim())}` });
    return hits;
  }, [pages, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => input.current?.focus(), 10);
    }
  }, [open]);

  if (!open) return null;
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-forest/40 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div role="dialog" aria-label="Command menu" className="crm-pop w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(20,35,28,0.6)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-forest/10 px-4">
          <Icon name="search" className="size-5 text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              }
              if (e.key === "Enter" && results[sel]) go(results[sel].href);
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Jump to a page or search leads…"
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-forest/15 px-1.5 text-[10px] text-muted">Esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {results.map((r, i) => (
            <li key={r.key}>
              <button
                type="button"
                onMouseEnter={() => setSel(i)}
                onClick={() => go(r.href)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === sel ? "bg-forest text-ivory" : "text-ink"}`}
              >
                <Icon name={r.icon as IconName} className={`size-[18px] ${i === sel ? "text-sage" : "text-forest/60"}`} />
                <span className="flex-1">{r.label}</span>
                <span className={`text-[11px] ${i === sel ? "text-ivory/60" : "text-muted"}`}>{r.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CrmShell({ groups, user, canCreateLead, children }: { groups: NavGroup[]; user: { name: string; role: string }; canCreateLead: boolean; children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [cmd, setCmd] = useState(false);
  const path = usePathname();
  const current = groups.flatMap((g) => g.items).find((i) => isActive(path, i.href));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="crm min-h-dvh bg-[#f3f3ee] text-sm text-ink lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="hidden lg:sticky lg:top-0 lg:block lg:h-dvh">
        <Sidebar groups={groups} user={user} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-forest/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div className="crm-drawer absolute inset-y-0 left-0 w-72 shadow-2xl">
            <Sidebar groups={groups} user={user} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-forest/[0.08] bg-[#f3f3ee]/85 px-4 py-3 backdrop-blur-md md:px-8">
          <button type="button" onClick={() => setDrawer(true)} className="rounded-lg p-2 text-forest hover:bg-forest/5 lg:hidden" aria-label="Open menu">
            <Icon name="menu" className="size-5" />
          </button>
          <div className="hidden items-center gap-2 text-forest md:flex">
            {current && <Icon name={current.icon} className="size-[18px] text-forest/60" />}
            <span className="font-medium">{current?.label ?? "CRM"}</span>
          </div>
          <button
            type="button"
            onClick={() => setCmd(true)}
            className="ml-auto flex w-full max-w-sm items-center gap-2 rounded-xl border border-forest/10 bg-white px-3 py-2 text-left text-muted shadow-sm transition hover:border-forest/25"
          >
            <Icon name="search" className="size-4" />
            <span className="flex-1 truncate">Search leads or jump to…</span>
            <kbd className="hidden rounded border border-forest/15 px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          {canCreateLead && (
            <Link href="/crm/leads/new" className="flex shrink-0 items-center gap-1.5 rounded-xl bg-forest px-3.5 py-2 font-medium text-ivory shadow-sm transition hover:bg-forest-700">
              <Icon name="plus" className="size-4" />
              <span className="hidden sm:inline">New lead</span>
            </Link>
          )}
        </header>
        <main id="main" className="crm-main mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      <CommandMenu groups={groups} open={cmd} setOpen={setCmd} />
    </div>
  );
}
