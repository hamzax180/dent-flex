import type { Metadata } from "next";
import { UnsubscribeButton } from "./unsubscribe-button";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

// GET only shows a confirmation button: link scanners that prefetch URLs must not unsubscribe people.
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string; s?: string }> }) {
  const { t = "", s = "" } = await searchParams;
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
      <h1 className="display text-4xl text-forest">Unsubscribe</h1>
      <p className="mt-4 text-muted">Stop receiving optional news from Dent Flex on this channel. Messages about an appointment you have booked are not affected.</p>
      <UnsubscribeButton t={t} s={s} />
    </div>
  );
}
