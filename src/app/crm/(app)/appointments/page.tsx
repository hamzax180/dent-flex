import Link from "next/link";
import { requirePageStaff } from "@/lib/auth/page";
import { AutoRefresh } from "@/components/crm/auto-refresh";
import { can } from "@/lib/auth/rbac";
import { leadScope } from "@/lib/services/crm";
import { prisma } from "@/lib/db";
import { Badge, Card, Empty, PageHeader, fmt, td, th } from "@/components/crm/ui";
import { ActionButton } from "@/components/crm/actions";
import { RescheduleForm } from "./reschedule";

export const metadata = { title: "Appointments" };

export default async function AppointmentsPage() {
  const staff = await requirePageStaff("appointments:read");
  const scope = leadScope(staff);
  const manage = can(staff.role, "appointments:manage");
  const [requests, appts] = await Promise.all([
    prisma.appointmentRequest.findMany({
      where: { status: { in: ["REQUESTED", "IN_REVIEW"] }, lead: scope },
      orderBy: { createdAt: "asc" },
      include: { lead: { select: { id: true, fullName: true, publicId: true, scoreTotal: true } } },
    }),
    prisma.appointment.findMany({
      where: { lead: scope, ...(staff.role === "CLINICIAN" ? { clinicianId: staff.id } : {}), startAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      orderBy: { startAt: "asc" },
      take: 100,
      include: { lead: { select: { id: true, fullName: true } }, clinician: { select: { name: true } } },
    }),
  ]);
  return (
    <>
      <PageHeader title="Appointments" sub="Requests are not bookings. A request becomes an appointment only when staff confirm an agreed time." />
      <AutoRefresh />
      <div className="grid gap-4">
        <Card title={`Open requests (${requests.length})`}>
          {requests.length === 0 ? <Empty>No open appointment requests.</Empty> : (
            <table className="w-full">
              <thead><tr><th className={th}>Lead</th><th className={th}>Preference</th><th className={th}>Received</th><th className={th}>Status</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-forest/5">
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className={td}><Link href={`/crm/leads/${r.lead.id}`} className="text-forest hover:underline">{r.lead.fullName}</Link><div className="text-xs text-muted">{r.publicId}</div></td>
                    <td className={td}>{[r.preferredDate, r.preferredWindow].filter(Boolean).join(", ") || "—"}</td>
                    <td className={td}>{fmt(r.createdAt)}</td>
                    <td className={td}><Badge tone="warn">Requested — not confirmed</Badge></td>
                    <td className={td}>{manage && <Link href={`/crm/leads/${r.lead.id}`} className="text-forest underline">Review & confirm</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Confirmed & recent appointments">
          {appts.length === 0 ? <Empty>No appointments in this window.</Empty> : (
            <table className="w-full">
              <thead><tr><th className={th}>When</th><th className={th}>Patient</th><th className={th}>Clinician</th><th className={th}>Status</th><th className={th}>Actions</th></tr></thead>
              <tbody className="divide-y divide-forest/5">
                {appts.map((a) => (
                  <tr key={a.id}>
                    <td className={`${td} whitespace-nowrap`}>{fmt(a.startAt)}</td>
                    <td className={td}><Link href={`/crm/leads/${a.lead.id}`} className="text-forest hover:underline">{a.lead.fullName}</Link></td>
                    <td className={td}>{a.clinician?.name ?? "—"}</td>
                    <td className={td}><Badge tone={a.status === "CONFIRMED" ? "good" : a.status === "COMPLETED" ? "default" : "bad"}>{a.status.toLowerCase().replace("_", "-")}</Badge></td>
                    <td className={td}>
                      {manage && a.status === "CONFIRMED" && (
                        <div className="flex flex-wrap gap-1.5">
                          <RescheduleForm id={a.id} />
                          <ActionButton url={`/api/admin/appointments/${a.id}/complete`} label="Attended" />
                          <ActionButton url={`/api/admin/appointments/${a.id}/no-show`} label="No-show" confirm="Mark as no-show?" />
                          <ActionButton url={`/api/admin/appointments/${a.id}/cancel`} label="Cancel" variant="danger" confirm="Cancel this appointment? Pending reminders will be stopped." />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
