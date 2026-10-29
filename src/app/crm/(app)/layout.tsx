import Link from "next/link";
import type { Metadata } from "next";
import { requirePageStaff } from "@/lib/auth/page";
import { can, type Permission } from "@/lib/auth/rbac";
import { Logo } from "@/components/site/chrome";
import { NavLink, SignOut } from "./nav";

export const metadata: Metadata = { title: { default: "CRM", template: "%s · Dent Flex CRM" }, robots: { index: false } };
export const dynamic = "force-dynamic";

const NAV: { href: string; label: string; perm: Permission }[] = [
  { href: "/crm", label: "Overview", perm: "leads:read" },
  { href: "/crm/leads", label: "Leads", perm: "leads:read" },
  { href: "/crm/pipeline", label: "Pipeline", perm: "leads:read" },
  { href: "/crm/appointments", label: "Appointments", perm: "appointments:read" },
  { href: "/crm/tasks", label: "Tasks", perm: "tasks:read" },
  { href: "/crm/conversations", label: "Conversations", perm: "conversations:read" },
  { href: "/crm/agents", label: "AI agents", perm: "settings:manage" },
  { href: "/crm/automation", label: "Automation", perm: "automation:read" },
  { href: "/crm/campaigns", label: "Campaigns", perm: "automation:read" },
  { href: "/crm/treatments", label: "Treatments & prices", perm: "treatments:manage" },
  { href: "/crm/content", label: "Website content", perm: "settings:manage" },
  { href: "/crm/reports", label: "Reports", perm: "reports:read" },
  { href: "/crm/settings", label: "Settings", perm: "settings:manage" },
];

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const staff = await requirePageStaff();
  return (
    <div className="min-h-dvh bg-[#f4f4ef] text-sm text-ink md:flex">
      <aside className="border-b border-forest/10 bg-white md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/crm" className="text-forest"><Logo className="text-xl" /></Link>
          <span className="rounded bg-sage-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">CRM</span>
        </div>
        <nav aria-label="CRM" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {NAV.filter((n) => can(staff.role, n.perm)).map((n) => <NavLink key={n.href} href={n.href}>{n.label}</NavLink>)}
        </nav>
        <div className="hidden border-t border-forest/10 px-4 py-3 md:absolute md:bottom-0 md:block md:w-full">
          <p className="truncate font-medium">{staff.name}</p>
          <p className="text-xs text-muted">{staff.role.toLowerCase()}</p>
          <div className="flex gap-3">
            <Link href="/crm/account" className="mt-2 text-xs text-forest underline">My account</Link>
            <SignOut />
          </div>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
