import Link from "next/link";
import { prisma } from "@/lib/db";
import { BAND_TEXT, leadInterest } from "@/lib/interest";
import { Badge, Card, fmt } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";

const KIND: Record<string, string> = { XRAY: "X-ray", SMILE_PHOTO: "Smile photo", OTHER: "File" };
const PLAN_TONE = { REQUESTED: "warn", DRAFT: "default", SENT: "good", ACCEPTED: "good" } as const;

/** Files the patient shared, how engaged they are, and their treatment plans. */
export async function LeadExtras({ leadId }: { leadId: string }) {
  const [uploads, interest, plans] = await Promise.all([
    prisma.upload.findMany({
      where: { OR: [{ leadId }, { conversation: { leadId } }] },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { id: true, kind: true, mime: true, treatmentSlug: true, sizeBytes: true, createdAt: true },
    }),
    leadInterest(leadId),
    prisma.treatmentPlan.findMany({ where: { leadId }, orderBy: { createdAt: "desc" }, select: { id: true, publicId: true, status: true, createdAt: true, viewedAt: true } }),
  ]);
  const band = BAND_TEXT[interest.band];

  return (
    <>
      <Card title="Interest" icon="flame" actions={<Badge tone={interest.band === "VERY_INTERESTED" ? "good" : interest.band === "INTERESTED" ? "warn" : "default"}>{band} · {interest.score}</Badge>}>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-[#eef0e6]"><span className="block h-full rounded-full bg-forest" style={{ width: `${interest.score}%` }} /></div>
        {interest.items.length === 0 ? (
          <p className="text-sm text-muted">No engagement signals yet (uploads, calls, chats, plan requests).</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {interest.items.map((i) => (
              <li key={i.type} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Icon name="check" className="size-3.5 text-[#2f6b45]" />{i.label}</span>
                <span className="tabular-nums text-muted">+{i.points}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(uploads.length > 0 || plans.length > 0) && (
        <Card title="Files & treatment plans" icon="tooth">
          {uploads.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {uploads.map((u) => (
                <a key={u.id} href={`/api/admin/uploads/${u.id}`} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-xl ring-1 ring-forest/10 transition hover:ring-forest/40">
                  {u.mime.startsWith("image/") && u.mime !== "image/heic" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/admin/uploads/${u.id}`} alt={KIND[u.kind]} loading="lazy" className="aspect-square w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <span className="flex aspect-square items-center justify-center bg-sage-50 text-xs font-medium text-forest">{u.mime === "application/pdf" ? "PDF" : "HEIC"}</span>
                  )}
                  <span className="block truncate px-2 py-1 text-[11px] text-muted">{KIND[u.kind]} · {fmt(u.createdAt, "date")}</span>
                </a>
              ))}
            </div>
          )}
          {plans.length > 0 && (
            <ul className={`divide-y divide-forest/[0.06] ${uploads.length ? "mt-4 border-t border-forest/[0.06] pt-2" : ""}`}>
              {plans.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/crm/plans/${p.id}`} className="font-medium text-forest hover:underline">{p.publicId}</Link>
                  <span className="text-xs text-muted">{p.viewedAt ? "Opened by patient" : fmt(p.createdAt, "date")}</span>
                  <Badge tone={PLAN_TONE[p.status]}>{p.status.toLowerCase()}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
