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

const MAX_PREFILL_WITHOUT_URL = 140;

/**
 * Build Ask-coach WhatsApp prefill (TR-18).
 * Prefill body (excluding URL) is capped at ~140 characters per Meta guidance.
 */
export function buildAskCoachMessage(options: {
  coachName: string;
  itemLabel: string;
  date: string;
  topic: string;
  link: string;
}): { text: string; bodyLength: number; hrefText: string } {
  const coach = options.coachName.trim() || "Coach";
  const topic = options.topic.trim() || "a question";
  const date = options.date.trim();
  const link = options.link.trim();
  let item = options.itemLabel.trim() || "item";

  const assemble = (itemName: string) =>
    `Hi ${coach}, question about my ${itemName} (${date}): ${topic}. ${link}`;

  let text = assemble(item);
  const bodyWithoutUrl = text.slice(0, Math.max(0, text.length - link.length)).trimEnd();
  if (bodyWithoutUrl.length > MAX_PREFILL_WITHOUT_URL) {
    const overhead = assemble("").length - link.length;
    const budget = Math.max(8, MAX_PREFILL_WITHOUT_URL - overhead - 1);
    if (item.length > budget) {
      item = `${item.slice(0, Math.max(4, budget - 1))}…`;
    }
    text = assemble(item);
  }

  const bodyLength = text.length - link.length - (text.endsWith(link) ? 1 : 0);
  return { text, bodyLength: Math.max(0, bodyLength), hrefText: text };
}

/** https deep link used in WhatsApp (scheme links are not clickable there). */
export function askCoachGoLink(
  kind: "meal" | "workout" | "checkin" | "exercise" | "plan",
  id: string,
  appHost = "fitbud.app",
): string {
  return `https://${appHost}/go/${kind}/${id}`;
}
