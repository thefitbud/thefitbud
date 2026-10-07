/** Normalize a trainer-entered WhatsApp number to E.164 digits without +. */
export function normalizeWhatsappE164(
  input: string | null | undefined,
): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }
  return digits;
}

export function whatsappHref(options: {
  phoneE164?: string | null;
  draftText?: string | null;
}): string {
  const phone = options.phoneE164?.replace(/\D/g, "") ?? "";
  const text = options.draftText?.trim() ?? "";
  const params = text ? `?text=${encodeURIComponent(text)}` : "";
  return phone ? `https://wa.me/${phone}${params}` : `https://wa.me/${params}`;
}
