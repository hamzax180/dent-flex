import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requirePageStaff } from "@/lib/auth/page";
import { AutoRefresh } from "@/components/crm/auto-refresh";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { Empty, PageHeader, fmt, td, th } from "@/components/crm/ui";
import { ActionButton } from "@/components/crm/actions";
import { NewTaskForm } from "./new-task";

export const metadata = { title: "Tasks" };

const VIEWS = { mine: "My open tasks", overdue: "Overdue", open: "All open", done: "Recently done" } as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: keyof typeof VIEWS }> }) {
  const staff = await requirePageStaff("tasks:read");
  const view = (await searchParams).view ?? "mine";
  const now = new Date();
  // Clinicians see their own tasks; admin/reception see every task. (Note: an empty `lead: {}`
  // filter on this optional relation matches nothing in Prisma, so no relation filter is used.)
  const scoped: Prisma.TaskWhereInput = staff.role === "CLINICIAN" ? { ownerId: staff.id } : {};
  const where: Prisma.TaskWhereInput = {
    AND: [
      scoped,
      view === "mine" ? { ownerId: staff.id, status: "OPEN" } : view === "overdue" ? { status: "OPEN", dueAt: { lt: now } } : view === "open" ? { status: "OPEN" } : { status: "DONE" },
    ],
  };
  const staffList = await prisma.staffUser.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const tasks = await prisma.task.findMany({
    where, orderBy: view === "done" ? { completedAt: "desc" } : { dueAt: "asc" }, take: 200,
    include: { lead: { select: { id: true, fullName: true } }, owner: { select: { name: true } } },
  });
  return (
    <>
      <PageHeader title="Tasks & follow-ups" />
      <AutoRefresh />
      {can(staff.role, "tasks:write") && <NewTaskForm staff={staffList} me={staff.id} />}
      <nav className="mb-4 flex gap-2" aria-label="Task views">
        {Object.entries(VIEWS).map(([k, label]) => (
          <Link key={k} href={`?view=${k}`} aria-current={view === k ? "page" : undefined} className={`rounded-lg px-3 py-1.5 ${view === k ? "bg-forest text-ivory" : "border border-forest/20 bg-white"}`}>{label}</Link>
        ))}
      </nav>
      {tasks.length === 0 ? <Empty>Nothing here.</Empty> : (
        <div className="overflow-x-auto rounded-xl border border-forest/10 bg-white">
          <table className="w-full min-w-[640px]">
            <thead><tr><th className={th}>Task</th><th className={th}>Lead</th><th className={th}>Owner</th><th className={th}>Due</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-forest/5">
              {tasks.map((t) => {
                const overdue = t.status === "OPEN" && t.dueAt < now;
                return (
                  <tr key={t.id}>
                    <td className={td}>{t.title}{t.dedupeKey?.startsWith("wf:") && <span className="ml-1 text-xs text-muted">(automation)</span>}{t.description && <span className="block text-xs text-muted">{t.description}</span>}</td>
                    <td className={td}>{t.lead ? <Link href={`/crm/leads/${t.lead.id}`} className="text-forest hover:underline">{t.lead.fullName}</Link> : "—"}</td>
                    <td className={td}>{t.owner?.name ?? "Unassigned"}</td>
                    <td className={`${td} whitespace-nowrap ${overdue ? "font-medium text-danger" : ""}`}>{fmt(t.dueAt)}{overdue && " · overdue"}</td>
                    <td className={td}>{t.status === "OPEN" && can(staff.role, "tasks:write") && <ActionButton url={`/api/admin/tasks/${t.id}`} method="PATCH" body={{ status: "DONE" }} label="Mark done" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
