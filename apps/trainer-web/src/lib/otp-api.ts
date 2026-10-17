import type { AuthOtpStartRequest } from "@fitbud/contracts";
import { resolveApiUrl } from "./api";

/** OTP start still returns a bare JSON body (202); api-client `request()` expects `{ data }`. */
export async function startOtp(body: AuthOtpStartRequest): Promise<{
  sent: boolean;
  channels: Array<"email" | "whatsapp">;
}> {
  const res = await fetch(resolveApiUrl("/auth/otp/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      json?.error?.message ??
      (typeof json?.message === "string" ? json.message : "Could not send a code.");
    throw new Error(message);
  }
  if (json?.data && typeof json.data === "object") {
    return json.data as { sent: boolean; channels: Array<"email" | "whatsapp"> };
  }
  return json as { sent: boolean; channels: Array<"email" | "whatsapp"> };
}
