import { PhotoPlaceholder } from "./chrome";

/** Real photo for verified, published profiles; a labelled placeholder otherwise. */
export function TeamPhoto({ name, photoUrl, isPlaceholder, placeholderLabel, className = "" }: { name: string; photoUrl: string | null | undefined; isPlaceholder: boolean; placeholderLabel: string; className?: string }) {
  if (!photoUrl || isPlaceholder) return <PhotoPlaceholder label={placeholderLabel} className={className} />;
  return (
    <div className={`relative overflow-hidden bg-forest/10 ${className}`}>
      {/* Remote URLs entered by staff: plain img avoids per-domain image config. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt={name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}
