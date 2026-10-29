/** wa.me click-to-chat link, or null when the clinic hasn't set a WhatsApp number. */
export function whatsappLink(number: string | null | undefined, text?: string) {
  const digits = (number ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
