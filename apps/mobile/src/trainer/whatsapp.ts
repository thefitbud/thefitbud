import { Linking } from "react-native";

/**
 * WhatsApp is a contextual escape hatch outside FitBud — not workflow state.
 * Prefer FitBud actions (Open Client, Review, Acknowledge) when they apply.
 */
export async function openContextualWhatsApp(options?: {
  /** E.164 without +, when known. MVP often has no phone on file. */
  phoneE164?: string | null;
  /** Pre-filled draft text; keep free of sensitive coaching details. */
  draftText?: string | null;
}): Promise<boolean> {
  const phone = options?.phoneE164?.replace(/\D/g, "") ?? "";
  const text = options?.draftText?.trim() ?? "";
  const params = text ? `?text=${encodeURIComponent(text)}` : "";
  const url = phone
    ? `https://wa.me/${phone}${params}`
    : `https://wa.me/${params}`;
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
