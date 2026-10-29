"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/crm" ? path === "/crm" : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap rounded-lg px-3 py-2 ${active ? "bg-forest text-ivory" : "text-ink hover:bg-sage-50"}`}
    >
      {children}
    </Link>
  );
}

export function SignOut() {
  return (
    <button
      className="mt-2 text-xs text-forest underline"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/crm/login";
      }}
    >
      Sign out
    </button>
  );
}
