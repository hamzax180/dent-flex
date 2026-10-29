import Image from "next/image";
import reception from "../../../public/images/illustrative/reception.webp";
import treatmentRoom from "../../../public/images/illustrative/treatment-room.webp";
import detail from "../../../public/images/illustrative/detail.webp";
import entrance from "../../../public/images/illustrative/entrance.webp";
import consultation from "../../../public/images/illustrative/consultation.webp";

/**
 * AI-generated stand-in photography until the clinic supplies real photos.
 * To replace: drop real photos into public/images/ and point these imports at them.
 */
export const IMAGES = {
  reception: { src: reception, alt: "Calm reception and waiting lounge with sage armchairs and an olive tree" },
  "treatment-room": { src: treatmentRoom, alt: "Sunlit treatment room with a sage dental chair and green cabinetry" },
  detail: { src: detail, alt: "Interior detail: green slatted wall, brass wall light and olive branches" },
  entrance: { src: entrance, alt: "Stone building entrance with a green awning and olive trees" },
  consultation: { src: consultation, alt: "Quiet consultation room with an oak table and two chairs" },
} as const;

export function SiteImage({
  name, className = "", sizes = "(min-width: 1024px) 50vw, 100vw", priority = false,
}: { name: keyof typeof IMAGES; className?: string; sizes?: string; priority?: boolean }) {
  const img = IMAGES[name];
  return (
    <div className={`relative overflow-hidden bg-sage-50 ${className}`}>
      <Image src={img.src} alt={img.alt} fill sizes={sizes} priority={priority} placeholder="blur" className="object-cover" />
    </div>
  );
}
