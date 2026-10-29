import type { Dict } from "@/lib/i18n";
import type { ClinicInfo } from "@/lib/settings";
import { SectionHeading } from "./chrome";

export function ContactBlock({ t, clinic }: { t: Dict; clinic: ClinicInfo }) {
  return (
    <div>
      <SectionHeading eyebrow={t.nav.contact} title={t.contact.title} />
      {clinic.isPlaceholder && (
        <p className="mt-4 bg-gold/15 px-4 py-3 text-sm text-ink">{t.contact.placeholder}</p>
      )}
      <dl className="mt-8 space-y-6">
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">{t.contact.address}</dt>
          <dd className="mt-1 text-ink">
            {clinic.addressLines.map((l) => <span key={l} className="block">{l}</span>)}
            <span className="block">{clinic.city}</span>
            {clinic.mapUrl && (
              <a href={clinic.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm text-forest underline">Map ↗</a>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">{t.contact.phone}</dt>
          <dd className="mt-1 text-ink">{clinic.phone}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">{t.contact.email}</dt>
          <dd className="mt-1 text-ink">{clinic.email}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">{t.contact.hours}</dt>
          <dd className="mt-1">
            <table className="text-sm">
              <tbody>
                {clinic.hours.map((h) => (
                  <tr key={h.day}>
                    <th scope="row" className="py-0.5 pr-6 text-left font-normal text-muted">{h.day}</th>
                    <td className="text-ink">{[h.open, h.close].filter(Boolean).join(" – ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </dd>
        </div>
      </dl>
    </div>
  );
}
