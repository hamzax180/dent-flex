import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePageStaff } from "@/lib/auth/page";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { leadScope } from "@/lib/services/crm";
import { getPublicTreatments } from "@/lib/services/pricing";
import { planItemSchema } from "@/lib/services/plans";
import { getSetting } from "@/lib/settings";
import { Badge, PageHeader, fmt } from "@/components/crm/ui";
import { PlanEditor } from "./editor";

export const metadata = { title: "Treatment plan" };
const KIND: Record<string, string> = { XRAY: "X-ray", SMILE_PHOTO: "Smile photo", OTHER: "File" };

export default async function PlanDetail({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePageStaff("leads:read");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const plan = await prisma.treatmentPlan.findFirst({
    where: { id, lead: leadScope(staff) },
    include: {
      lead: { select: { id: true, fullName: true, email: true, phone: true, language: true, publicId: true } },
      uploads: { orderBy: { createdAt: "asc" }, select: { id: true, kind: true, mime: true, createdAt: true } },
    },
  });
  if (!plan) notFound();
  const [treatments, clinic] = await Promise.all([getPublicTreatments(), getSetting("clinic_info")]);
  const presets = treatments.map((t) => ({
    name: t.name.en,
    unitMinor: t.price?.amountMinor ?? t.price?.minMinor ?? 0,
    currency: (["EUR", "GBP", "USD", "TRY"].includes(t.price?.currency ?? "") ? t.price!.currency : "EUR") as "EUR" | "GBP" | "USD" | "TRY",
    published: Boolean(t.price),
  }));
  const items = z.array(planItemSchema).catch([]).parse(plan.items);
  const treatmentName = treatments.find((t) => t.slug === plan.treatmentSlug)?.name.en ?? "Not sure yet";
  const base = process.env.APP_BASE_URL || "";

  return (
    <>
      <p className="mb-2 text-xs"><Link href="/crm/plans" className="text-forest underline">← Plans</Link></p>
      <PageHeader eyebrow={plan.publicId} title={plan.lead.fullName} sub={`${treatmentName}${plan.country ? ` · ${plan.country}` : ""} · requested ${fmt(plan.createdAt)}`}>
        <Badge tone={plan.status === "REQUESTED" ? "warn" : plan.status === "DRAFT" ? "default" : "good"}>{plan.status.toLowerCase()}</Badge>
        {plan.viewedAt && <Badge tone="good">Opened {fmt(plan.viewedAt)}</Badge>}
        <Link href={`/crm/leads/${plan.lead.id}`} className="rounded-xl border border-forest/15 bg-white px-3 py-1.5 text-sm text-forest hover:bg-sage-50">Open lead</Link>
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.3fr]">
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Patient&apos;s images ({plan.uploads.length})</h2>
          {plan.uploads.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-forest/20 p-6 text-sm text-muted">No files attached.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {plan.uploads.map((u) => (
                <a key={u.id} href={`/api/admin/uploads/${u.id}`} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-2xl bg-white ring-1 ring-forest/10 transition hover:ring-forest/40">
                  {u.mime.startsWith("image/") && u.mime !== "image/heic" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/admin/uploads/${u.id}`} alt={KIND[u.kind]} className="aspect-[4/3] w-full bg-black object-contain transition group-hover:scale-[1.02]" />
                  ) : (
                    <span className="flex aspect-[4/3] items-center justify-center bg-sage-50 font-medium text-forest">{u.mime === "application/pdf" ? "Open PDF" : "Open HEIC"}</span>
                  )}
                  <span className="flex justify-between px-3 py-2 text-xs"><b className="font-medium text-forest">{KIND[u.kind]}</b><span className="text-muted">{fmt(u.createdAt)}</span></span>
                </a>
              ))}
            </div>
          )}
          <p className="text-xs text-muted">Images are private: opening one is recorded in the audit log.</p>
        </section>

        <PlanEditor
          planId={plan.id}
          status={plan.status}
          initialItems={items}
          initialNotes={plan.notes ?? ""}
          initialValidUntil={plan.validUntil ? plan.validUntil.toISOString().slice(0, 10) : ""}
          presets={presets}
          canEdit={can(staff.role, "leads:write")}
          hasEmail={Boolean(plan.lead.email)}
          link={plan.status === "SENT" || plan.status === "ACCEPTED" ? `${base}/plan/${plan.token}` : null}
          whatsapp={clinic.whatsapp}
          phone={plan.lead.phone}
        />
      </div>
    </>
  );
}
