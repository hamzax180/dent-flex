import { requirePageStaff } from "@/lib/auth/page";
import { prisma } from "@/lib/db";
import { Badge, Card, PageHeader } from "@/components/crm/ui";
import { ActionButton } from "@/components/crm/actions";
import { getSetting } from "@/lib/settings";
import { FaqForm, ReviewForm, TeamForm, TreatmentForm } from "./forms";

export const metadata = { title: "Website content" };

export default async function ContentPage() {
  await requirePageStaff("settings:manage");
  const [treatments, faqs, team, reviews, features] = await Promise.all([
    prisma.treatment.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.faq.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.teamMember.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.testimonial.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] }),
    getSetting("site_features"),
  ]);
  return (
    <>
      <PageHeader title="Website content" sub="Edit what visitors and the AI coordinator see. Only approved / published items appear on the site. Every change is audited." />
      <div className="space-y-6">
        <Card title={`Treatments (${treatments.length})`}>
          <p className="mb-3 text-xs text-muted">Wording must be clinic-approved: no guaranteed outcomes. Prices are managed under Treatments &amp; prices.</p>
          <ul className="divide-y divide-forest/10">
            {treatments.map((t) => (
              <li key={t.id} className="py-2">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className="font-medium">{t.nameEn}</span><span className="text-muted">/ {t.nameTr}</span>
                    <span className="text-xs text-muted">/{t.slug}</span>
                    {t.approved ? <Badge tone="good">approved</Badge> : <Badge tone="warn">not approved — hidden</Badge>}
                    {!t.active && <Badge>hidden</Badge>}
                    {t.summaryEn.startsWith("[Placeholder") && <Badge tone="warn">placeholder text</Badge>}
                  </summary>
                  <TreatmentForm id={t.id} initial={t} />
                </details>
              </li>
            ))}
          </ul>
          <details className="mt-3 border-t border-forest/10 pt-3">
            <summary className="cursor-pointer text-forest">+ Add treatment</summary>
            <TreatmentForm />
          </details>
        </Card>

        <Card title={`FAQs (${faqs.length})`}>
          <p className="mb-3 text-xs text-muted">Published FAQs appear on the homepage and are the only answers the AI coordinator may use for general questions.</p>
          <ul className="divide-y divide-forest/10">
            {faqs.map((f) => (
              <li key={f.id} className="py-2">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className="font-medium">{f.questionEn}</span>
                    <Badge tone={f.status === "PUBLISHED" ? "good" : "warn"}>{f.status.toLowerCase()}</Badge>
                  </summary>
                  <FaqForm id={f.id} initial={f} />
                  <div className="mt-2"><ActionButton url={`/api/admin/content/faqs/${f.id}`} method="DELETE" label="Delete FAQ" variant="danger" confirm="Delete this FAQ?" /></div>
                </details>
              </li>
            ))}
          </ul>
          <details className="mt-3 border-t border-forest/10 pt-3">
            <summary className="cursor-pointer text-forest">+ Add FAQ</summary>
            <FaqForm />
          </details>
        </Card>

        <Card title={`Team (${team.length})`}>
          <p className="mb-3 text-xs text-muted">Publish a profile only after the clinic has verified the name, role and credentials. Use a real photo URL; profiles marked placeholder show a placeholder image.</p>
          <ul className="divide-y divide-forest/10">
            {team.map((m) => (
              <li key={m.id} className="py-2">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className="font-medium">{m.name}</span><span className="text-muted">{m.title}</span>
                    <Badge tone={m.status === "PUBLISHED" ? "good" : "warn"}>{m.status.toLowerCase()}</Badge>
                    {m.isPlaceholder && <Badge tone="warn">placeholder</Badge>}
                  </summary>
                  <TeamForm id={m.id} initial={m} />
                  <div className="mt-2"><ActionButton url={`/api/admin/content/team/${m.id}`} method="DELETE" label="Delete profile" variant="danger" confirm="Delete this team profile?" /></div>
                </details>
              </li>
            ))}
          </ul>
          <details className="mt-3 border-t border-forest/10 pt-3">
            <summary className="cursor-pointer text-forest">+ Add team member</summary>
            <TeamForm />
          </details>
        </Card>

        <Card title={`Patient reviews (${reviews.length})`}>
          <p className="mb-3 text-xs text-muted">
            Only real reviews, in the patient&apos;s own words, with their permission. Reviews show on the website only when <b>Settings › site_features › showReviews</b> is on
            ({features.showReviews ? "currently ON" : "currently OFF"}), which should wait for legal confirmation under Turkish health-advertising rules.
          </p>
          <ul className="divide-y divide-forest/10">
            {reviews.map((r) => (
              <li key={r.id} className="py-2">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className="font-medium">{r.author}</span><span className="text-gold">{"★".repeat(r.rating)}</span><span className="text-muted">{r.treatment}</span>
                    <Badge tone={r.status === "PUBLISHED" ? "good" : "warn"}>{r.status.toLowerCase()}</Badge>
                    {!r.consentAt && <Badge tone="warn">no permission</Badge>}
                  </summary>
                  <ReviewForm id={r.id} initial={r} />
                  <div className="mt-2"><ActionButton url={`/api/admin/content/reviews/${r.id}`} method="DELETE" label="Delete review" variant="danger" confirm="Delete this review?" /></div>
                </details>
              </li>
            ))}
          </ul>
          <details className="mt-3 border-t border-forest/10 pt-3">
            <summary className="cursor-pointer text-forest">+ Add review</summary>
            <ReviewForm />
          </details>
        </Card>
      </div>
    </>
  );
}
