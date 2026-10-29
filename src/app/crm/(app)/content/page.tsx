import { requirePageStaff } from "@/lib/auth/page";
import { prisma } from "@/lib/db";
import { Badge, Card, PageHeader } from "@/components/crm/ui";
import { ActionButton } from "@/components/crm/actions";
import { FaqForm, TeamForm, TreatmentForm } from "./forms";

export const metadata = { title: "Website content" };

export default async function ContentPage() {
  await requirePageStaff("settings:manage");
  const [treatments, faqs, team] = await Promise.all([
    prisma.treatment.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.faq.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.teamMember.findMany({ orderBy: { sortOrder: "asc" } }),
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
      </div>
    </>
  );
}
