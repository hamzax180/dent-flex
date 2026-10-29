import { requirePageStaff } from "@/lib/auth/page";
import { prisma } from "@/lib/db";
import { PERMISSIONS, type Permission } from "@/lib/auth/rbac";
import { Card, PageHeader } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";
import { TeamManager, type Member } from "./team-manager";

export const metadata = { title: "Team" };

/** What each role can do, in plain words (from the server-side permission matrix). */
const ABILITIES: [string, Permission][] = [
  ["See leads and patients", "leads:read"],
  ["Edit leads, see full contact details", "leads:contact"],
  ["Confirm and move appointments", "appointments:manage"],
  ["Read AI conversations", "conversations:read"],
  ["Reports", "reports:read"],
  ["Treatments & approve prices", "prices:approve"],
  ["Automation & campaigns", "automation:manage"],
  ["Settings, AI agents & staff", "users:manage"],
];
const ROLE_ORDER = ["RECEPTIONIST", "CLINICIAN", "ADMIN"] as const;

export default async function TeamPage() {
  const me = await requirePageStaff("users:manage");
  const users = await prisma.staffUser.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: {
      id: true, name: true, email: true, role: true, active: true, createdAt: true,
      sessions: { orderBy: { lastSeenAt: "desc" }, take: 1, select: { lastSeenAt: true } },
      _count: { select: { ownedLeads: true, tasks: { where: { status: "OPEN" } } } },
    },
  });
  const members: Member[] = users.map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, createdAt: u.createdAt.toISOString(),
    lastSeen: u.sessions[0]?.lastSeenAt.toISOString() ?? null, leads: u._count.ownedLeads, tasks: u._count.tasks,
  }));

  return (
    <>
      <PageHeader eyebrow="Clinic" title="Team" sub="Add staff, choose what they can access, reset passwords and switch people off when they leave." />
      <TeamManager members={members} meId={me.id} />

      <Card title="What each role can do" icon="cog" className="mt-6">
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Access</th>
                {ROLE_ORDER.map((r) => <th key={r} className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{r.toLowerCase()}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-forest/[0.06]">
              {ABILITIES.map(([label, perm]) => (
                <tr key={perm}>
                  <td className="px-3 py-2.5">{label}</td>
                  {ROLE_ORDER.map((r) => (
                    <td key={r} className="px-3 py-2.5 text-center">
                      {(PERMISSIONS[perm] as readonly string[]).includes(r)
                        ? <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#e6f2e8] text-[#2f6b45]"><Icon name="check" className="size-3.5" /></span>
                        : <span className="text-forest/20">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
