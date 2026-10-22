export type WhatsAppSendResult =
  | { sent: true; messageId: string }
  | { skipped: "flag_off" | "template_not_approved" | "budget" | "opt_out" };

export async function sendWhatsAppTemplate(
  input: {
    phoneNumberId: string;
    accessToken: string;
    toE164: string;
    templateName: string;
    languageCode: string;
    components?: unknown[];
  },
  fetchImpl: typeof fetch = fetch,
): Promise<WhatsAppSendResult> {
  const url = `https://graph.facebook.com/v21.0/${input.phoneNumberId}/messages`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: input.toE164.replace(/\D/g, ""),
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        components: input.components ?? [],
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`WHATSAPP_SEND_FAILED:${response.status}`);
  }
  const body = (await response.json()) as { messages?: Array<{ id: string }> };
  return { sent: true, messageId: body.messages?.[0]?.id ?? "unknown" };
}
