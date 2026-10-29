import type { Metadata } from "next";
import { getDict } from "@/lib/i18n";
import { prisma } from "@/lib/db";
import { SectionHeading } from "@/components/site/chrome";
import { TeamPhoto } from "@/components/site/team-photo";

export const metadata: Metadata = { title: "Our team" };

export default async function TeamPage() {
  const { t } = await getDict();
  const team = await prisma.teamMember.findMany({ where: { status: "PUBLISHED" }, orderBy: { sortOrder: "asc" } });
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <SectionHeading eyebrow="Dent Flex" title={t.team.title} intro={t.team.intro} />
      <ul className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {team.map((m) => (
          <li key={m.id}>
            <TeamPhoto name={m.name} photoUrl={m.photoUrl} isPlaceholder={m.isPlaceholder} placeholderLabel={t.team.placeholder} className="aspect-[4/5]" />
            <h2 className="mt-4 display text-2xl text-forest">{m.name}</h2>
            <p className="text-sm text-muted">{m.title}</p>
            {!m.isPlaceholder && m.credentials && <p className="mt-2 text-xs leading-relaxed text-forest/70">{m.credentials}</p>}
            <p className="mt-3 text-sm leading-relaxed text-ink">{m.bio}</p>
            {!m.isPlaceholder && (m.specialties.length > 0 || m.languages.length > 0) && (
              <p className="mt-4 flex flex-wrap gap-1.5">
                {m.specialties.map((x) => <span key={x} className="rounded-full bg-forest px-2.5 py-0.5 text-[11px] text-ivory">{x}</span>)}
                {m.languages.map((x) => <span key={x} className="rounded-full border border-forest/20 px-2.5 py-0.5 text-[11px] text-forest">{x}</span>)}
              </p>
            )}
          </li>
        ))}
      </ul>
      {team.length === 0 && <p className="mt-10 text-muted">{t.team.intro}</p>}
    </div>
  );
}
