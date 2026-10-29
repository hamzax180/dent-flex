import Link from "next/link";
import { requirePageStaff } from "@/lib/auth/page";
import { prisma } from "@/lib/db";
import { Card, PageHeader } from "@/components/crm/ui";
import { NewLeadForm } from "./form";

export const metadata = { title: "New lead" };

export default async function NewLeadPage() {
  const staff = await requirePageStaff("leads:write");
  const [treatments, staffList] = await Promise.all([
    prisma.treatment.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, nameEn: true } }),
    prisma.staffUser.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <p className="mb-2 text-xs"><Link href="/crm/leads" className="text-forest underline">← Leads</Link></p>
      <PageHeader title="New lead" sub="Record a phone call, walk-in or referral. It goes through the same checks as website inquiries: duplicates are merged and the score is calculated automatically." />
      <Card className="max-w-3xl">
        <NewLeadForm treatments={treatments} staff={staffList} me={staff.id} />
      </Card>
    </>
  );
}
