/**
 * TR-02.1 invite activation — link landing, mail sink, password + OTP accept.
 */
import { test, expect } from "@playwright/test";

const API = process.env.FITBUD_API_URL ?? "http://127.0.0.1:8787";
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";

async function trainerToken(request: import("@playwright/test").APIRequestContext) {
  const login = await request.post(`${API}/auth/login`, {
    data: { identifier: EMAIL, password: PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const body = (await login.json()) as { data: { token: string } };
  return body.data.token;
}

test.describe("TR-02 invite activation", () => {
  test("invite link, mail sink, password+OTP accept", async ({ request }) => {
    const token = await trainerToken(request);
    const recipient = `invitee.${Date.now()}@demo.fitbud.test`;

    const created = await request.post(`${API}/invitations`, {
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": `e2e-invite-${Date.now()}`,
        "x-fitbud-role": "trainer",
      },
      data: {
        recipientEmail: recipient,
        recipientDisplayName: "Invitee Test",
        sendEmail: true,
      },
    });
    expect(created.ok()).toBeTruthy();
    const invite = (await created.json()) as {
      data: { token: string; inviteUrl: string; id: string };
    };
    expect(invite.data.inviteUrl).toContain("/i/");
    expect(invite.data.token).toBeTruthy();

    const landing = await request.get(`${API}/i/${invite.data.token}`);
    expect(landing.status()).toBe(200);
    const html = await landing.text();
    expect(html).toMatch(/invited you to coaching/i);
    expect(html).toContain(invite.data.token);

    const mail = await request.get(
      `${API}/dev/mail?to=${encodeURIComponent(recipient)}&limit=5`,
    );
    expect(mail.ok()).toBeTruthy();
    const mailBody = (await mail.json()) as {
      data: { items: Array<{ subject: string; textBody: string }> };
    };
    expect(mailBody.data.items.length).toBeGreaterThan(0);
    const inviteMail = mailBody.data.items.find(
      (item) =>
        /invite|join|fitbud/i.test(item.subject) ||
        /invite|join/i.test(item.textBody),
    );
    expect(inviteMail, "E-INV should land in the dev mail sink").toBeTruthy();

    const otpStart = await request.post(`${API}/auth/otp/start`, {
      data: { identifier: recipient, purpose: "invite" },
    });
    expect(otpStart.ok()).toBeTruthy();

    const otpMail = await request.get(
      `${API}/dev/mail?to=${encodeURIComponent(recipient)}&limit=5`,
    );
    const otpBody = (await otpMail.json()) as {
      data: { items: Array<{ textBody: string; subject: string }> };
    };
    const codeMatch = otpBody.data.items
      .map((item) => item.textBody.match(/\b(\d{6})\b/)?.[1])
      .find(Boolean);
    expect(codeMatch).toBeTruthy();

    const verify = await request.post(`${API}/auth/otp/verify`, {
      data: {
        identifier: recipient,
        purpose: "invite",
        code: codeMatch,
      },
    });
    expect(verify.ok()).toBeTruthy();
    const verifyBody = (await verify.json()) as {
      data: { otpProof: string; purpose: string };
    };
    expect(verifyBody.data.otpProof).toBeTruthy();

    const accept = await request.post(`${API}/invitations/accept`, {
      data: {
        token: invite.data.token,
        password: "FitBud-invite-2026",
        otpProof: verifyBody.data.otpProof,
        displayName: "Invitee Test",
      },
    });
    expect(accept.ok()).toBeTruthy();
    const acceptBody = (await accept.json()) as {
      data: { token: string; relationshipId: string };
    };
    expect(acceptBody.data.token).toBeTruthy();
    expect(acceptBody.data.relationshipId).toBeTruthy();
  });
});
