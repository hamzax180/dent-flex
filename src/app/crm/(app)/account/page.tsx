import { requirePageStaff } from "@/lib/auth/page";
import { prisma } from "@/lib/db";
import { Card, PageHeader, fmt } from "@/components/crm/ui";
import { PasswordForm } from "./password-form";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const staff = await requirePageStaff();
  const sessions = await prisma.staffSession.findMany({ where: { userId: staff.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, select: { id: true, createdAt: true, lastSeenAt: true } });
  return (
    <>
      <PageHeader title="My account" sub={`${staff.name} · ${staff.email} · ${staff.role.toLowerCase()}`} />
      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <Card title="Change password">
          <PasswordForm />
        </Card>
        <Card title={`Active sessions (${sessions.length})`}>
          <ul className="space-y-1 text-xs">
            {sessions.map((s) => <li key={s.id}>Signed in {fmt(s.createdAt)} · last active {fmt(s.lastSeenAt)}</li>)}
          </ul>
          <p className="mt-3 text-xs text-muted">Changing your password signs out all other sessions.</p>
        </Card>
      </div>
    </>
  );
}
