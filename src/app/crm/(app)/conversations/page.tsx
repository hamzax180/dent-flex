import Link from "next/link";
import { requirePageStaff } from "@/lib/auth/page";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { Badge, Empty, PageHeader, fmt, td, th } from "@/components/crm/ui";

export const metadata = { title: "Conversations" };

export default async function ConversationsPage() {
  await requirePageStaff("conversations:read");
  const [convs, privacy] = await Promise.all([
    prisma.conversation.findMany({
      orderBy: { startedAt: "desc" }, take: 100,
      include: { lead: { select: { id: true, fullName: true } }, _count: { select: { messages: true } } },
    }),
    getSetting("privacy"),
  ]);
  return (
    <>
      <PageHeader
        title="Assistant conversations"
        sub={privacy.storeTranscripts
          ? `Transcripts are retained for ${privacy.transcriptRetentionDays} days (clinic setting).`
          : "Transcripts are not stored (default). Only channel, status, handoff reason and any approved summary are kept. Raw audio is never stored."}
      />
      {convs.length === 0 ? <Empty>No assistant conversations yet.</Empty> : (
        <div className="overflow-x-auto rounded-xl border border-forest/10 bg-white">
          <table className="w-full min-w-[640px]">
            <thead><tr><th className={th}>Started</th><th className={th}>Channel</th><th className={th}>Status</th><th className={th}>Lead</th><th className={th}>Summary</th><th className={th}>Messages kept</th></tr></thead>
            <tbody className="divide-y divide-forest/5">
              {convs.map((c) => (
                <tr key={c.id}>
                  <td className={`${td} whitespace-nowrap`}>{fmt(c.startedAt)}</td>
                  <td className={td}>{c.channel.toLowerCase()}</td>
                  <td className={td}><Badge tone={c.status === "HANDOFF_REQUESTED" ? "warn" : "default"}>{c.status.toLowerCase().replace(/_/g, " ")}</Badge>{c.handoffReason && <div className="text-xs text-muted">{c.handoffReason.replace(/_/g, " ")}</div>}</td>
                  <td className={td}>{c.lead ? <Link href={`/crm/leads/${c.lead.id}`} className="text-forest hover:underline">{c.lead.fullName}</Link> : "—"}</td>
                  <td className={td}>{c.summary ?? "—"}</td>
                  <td className={td}>{c._count.messages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
