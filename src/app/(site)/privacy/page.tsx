import type { Metadata } from "next";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = { title: "Privacy notice" };

// DRAFT structure only. Final text must be written/approved by the clinic's legal adviser (KVKK).
export default async function PrivacyPage() {
  const [clinic, privacy] = await Promise.all([getSetting("clinic_info"), getSetting("privacy")]);
  const sections: [string, string][] = [
    ["Data controller", `${clinic.name}, ${clinic.city}. Contact: ${clinic.email}. [Legal entity name, registration and VERBIS details to be supplied by the clinic.]`],
    ["What we collect", "Your name, phone and/or email, preferred language, the treatment you are interested in, your contact and appointment preferences, and anything you choose to write in the message box. If you use the assistant, the messages you exchange with it. We do not ask for identity numbers or medical history in these forms."],
    ["Why we use it", "To reply to your inquiry and arrange a consultation (service contact). Only if you separately opt in: occasional clinic news by email/WhatsApp (marketing). [Lawful basis for each purpose to be confirmed by legal review.]"],
    ["AI assistant", "The website assistant is an AI system. It answers from information the clinic has published and can pass your request to staff. It does not give medical advice. Messages are processed by our AI provider. [Provider, processing location and transfer safeguards to be confirmed.] Voice audio is not recorded."],
    ["Who receives it", "Authorised Dent Flex staff, and service providers that host our systems or deliver messages on our behalf under contract. [List of processors and any international transfers to be completed.]"],
    ["How long we keep it", `[Retention periods per data category to be set by the clinic.] Assistant transcripts are ${privacy.storeTranscripts ? `kept for up to ${privacy.transcriptRetentionDays} days` : "not stored; only a minimal summary may be kept"}.`],
    ["Your rights", "You can ask to access, correct or delete your data, object to processing, or withdraw marketing permission at any time. Every marketing email has an unsubscribe link, and you can reply STOP on WhatsApp. Contact the clinic to exercise your rights. [KVKK Article 11 wording to be confirmed.]"],
  ];
  return (
    <article className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <p className="bg-gold/15 px-4 py-3 text-sm">
        Draft notice (version {privacy.noticeVersion}). This text is a structural placeholder and has not been legally reviewed.
      </p>
      <h1 className="mt-8 display text-5xl text-forest">Privacy notice</h1>
      {sections.map(([h, b]) => (
        <section key={h} className="mt-10">
          <h2 className="display text-2xl text-forest">{h}</h2>
          <p className="mt-3 leading-relaxed text-ink">{b}</p>
        </section>
      ))}
    </article>
  );
}
