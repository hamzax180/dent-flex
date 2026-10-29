import type { Dict } from "@/lib/i18n";
import type { ClinicInfo } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";

export function ContactBlock({ t, clinic }: { t: Dict; clinic: ClinicInfo }) {
  return (
    <div>
      <p className="eyebrow text-[11px] text-muted">{t.nav.contact}</p>
      <h2 className="display mt-2 text-3xl text-forest">{t.contact.title}</h2>
      {clinic.isPlaceholder && (
        <p className="mt-4 bg-gold/15 px-4 py-3 text-sm text-ink">{t.contact.placeholder}</p>
      )}
      <dl className="mt-6 space-y-5">
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
        {whatsappLink(clinic.whatsapp) && (
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-muted">WhatsApp</dt>
            <dd className="mt-1">
              <a href={whatsappLink(clinic.whatsapp)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25d366] px-4 py-1.5 text-sm font-medium text-white"><svg viewBox="0 0 24 24" className="size-4" aria-hidden><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg> {clinic.whatsapp}</a>
            </dd>
          </div>
        )}
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
