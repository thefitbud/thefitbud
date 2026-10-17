export type WhatsAppTemplateSeed = {
  key: string;
  name: string;
  category: "authentication" | "utility";
  status: "draft" | "approved";
  body: string;
};

export const WHATSAPP_TEMPLATE_SEEDS: WhatsAppTemplateSeed[] = [
  {
    key: "W-OTP",
    name: "fitbud_otp",
    category: "authentication",
    status: "draft",
    body: "Your FitBud code is {{1}}. It expires in 10 minutes.",
  },
  {
    key: "W-FB",
    name: "fitbud_fallback",
    category: "utility",
    status: "draft",
    body: "Open FitBud to continue: {{1}}",
  },
  {
    key: "W-CHK",
    name: "fitbud_checkin",
    category: "utility",
    status: "draft",
    body: "Check-in reminder from your coach.",
  },
  {
    key: "W-PLAN",
    name: "fitbud_plan",
    category: "utility",
    status: "draft",
    body: "Your coach published an updated plan.",
  },
  {
    key: "W-RENEW",
    name: "fitbud_renewal",
    category: "utility",
    status: "draft",
    body: "Coaching renewal is due soon.",
  },
];

export function latestApprovedTemplate(key: string): WhatsAppTemplateSeed | null {
  const match = WHATSAPP_TEMPLATE_SEEDS.find((row) => row.key === key);
  if (!match || match.status !== "approved") {
    return null;
  }
  return match;
}
