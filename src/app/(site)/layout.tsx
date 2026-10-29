import { getDict } from "@/lib/i18n";
import { getSetting } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { voiceEnabled } from "@/lib/assistant/voice";
import { SiteFooter, MobileCta } from "@/components/site/chrome";
import { SiteHeader } from "@/components/site/header";
import { RevealOnScroll } from "@/components/site/reveal";
import { AssistantWidget } from "@/components/site/assistant-widget";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { t, lang } = await getDict();
  const [clinic, sales, team] = await Promise.all([
    getSetting("clinic_info"),
    getSetting("sales_profile"),
    prisma.aiAgent.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { name: true, hue: true } }),
  ]);
  return (
    <>
      <SiteHeader t={t} lang={lang} phone={clinic.isPlaceholder ? null : clinic.phone} />
      <main id="main">{children}</main>
      <SiteFooter t={t} clinic={clinic} />
      <MobileCta assistantName={sales.assistantName} team={team} lang={lang} />
      <AssistantWidget t={t} lang={lang} assistantName={sales.assistantName} team={team} callsEnabled={voiceEnabled()} />
      <RevealOnScroll />
    </>
  );
}
