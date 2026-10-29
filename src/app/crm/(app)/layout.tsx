import type { Metadata } from "next";
import { requirePageStaff } from "@/lib/auth/page";
import { can, type Permission } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { leadScope } from "@/lib/services/crm";
import type { IconName } from "@/components/crm/icons";
import { CrmShell, type NavGroup } from "./nav";

export const metadata: Metadata = { title: { default: "CRM", template: "%s · Dent Flex CRM" }, robots: { index: false } };
export const dynamic = "force-dynamic";

type Item = { href: string; label: string; icon: IconName; perm: Permission; count?: "newLeads" | "requested" | "overdue" };
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Work",
    items: [
      { href: "/crm", label: "Overview", icon: "home", perm: "leads:read" },
      { href: "/crm/leads", label: "Leads", icon: "users", perm: "leads:read", count: "newLeads" },
      { href: "/crm/pipeline", label: "Pipeline", icon: "columns", perm: "leads:read" },
      { href: "/crm/appointments", label: "Appointments", icon: "calendar", perm: "appointments:read", count: "requested" },
      { href: "/crm/tasks", label: "Tasks", icon: "tasks", perm: "tasks:read", count: "overdue" },
    ],
  },
  {
    label: "Sales & AI",
    items: [
      { href: "/crm/conversations", label: "Conversations", icon: "chat", perm: "conversations:read" },
      { href: "/crm/agents", label: "AI agents", icon: "spark", perm: "settings:manage" },
      { href: "/crm/automation", label: "Automation", icon: "bolt", perm: "automation:read" },
      { href: "/crm/campaigns", label: "Campaigns", icon: "megaphone", perm: "automation:read" },
    ],
  },
  {
    label: "Clinic",
    items: [
      { href: "/crm/treatments", label: "Treatments & prices", icon: "tooth", perm: "treatments:manage" },
      { href: "/crm/content", label: "Website content", icon: "globe", perm: "settings:manage" },
      { href: "/crm/team", label: "Team", icon: "user", perm: "users:manage" },
      { href: "/crm/reports", label: "Reports", icon: "chart", perm: "reports:read" },
      { href: "/crm/settings", label: "Settings", icon: "cog", perm: "settings:manage" },
    ],
  },
];

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const staff = await requirePageStaff();
  const scope = leadScope(staff);
  const [newLeads, requested, overdue] = await Promise.all([
    can(staff.role, "leads:read") ? prisma.lead.count({ where: { AND: [scope, { status: "NEW" }] } }) : 0,
    can(staff.role, "appointments:read") ? prisma.appointmentRequest.count({ where: { status: { in: ["REQUESTED", "IN_REVIEW"] }, lead: scope } }) : 0,
    can(staff.role, "tasks:read") ? prisma.task.count({ where: { status: "OPEN", dueAt: { lt: new Date() }, ...(staff.role === "CLINICIAN" ? { ownerId: staff.id } : {}) } }) : 0,
  ]);
  const counts = { newLeads, requested, overdue };
  const groups: NavGroup[] = GROUPS.map((g) => ({
    label: g.label,
    items: g.items
      .filter((i) => can(staff.role, i.perm))
      .map((i) => ({ href: i.href, label: i.label, icon: i.icon, count: i.count ? counts[i.count] : undefined, alert: i.count === "overdue" })),
  })).filter((g) => g.items.length);

  return (
    <CrmShell groups={groups} user={{ name: staff.name, role: staff.role.toLowerCase() }} canCreateLead={can(staff.role, "leads:write")}>
      {children}
    </CrmShell>
  );
}
