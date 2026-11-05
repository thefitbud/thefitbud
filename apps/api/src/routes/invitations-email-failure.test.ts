import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { clientInvitations } from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { createMemoryDb } from "../test-support/memory-db.js";

const ZEPTO_TOKEN = "zepto-invite-token-do-not-log";

function dummyD1(): D1Database {
  return {
    prepare() {
      throw new Error("D1 should not be used when test DB override is set");
    },
  } as unknown as D1Database;
}

function testEnv(): Env {
  return {
    DB: dummyD1(),
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
    EMAIL_PROVIDER: "zeptomail",
    ZEPTOMAIL_TOKEN: ZEPTO_TOKEN,
    APP_HOST: "app.fitbud.test",
  };
}

async function trainerCookie(email: string): Promise<string> {
  const response = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: createTestIdToken(`trainer-${email}`, email), timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0]!;
}

describe("invitation create when the invite email fails", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setTestDbOverride(null);
    close();
  });

  it("still returns the invitation and its link, leaves emailSentAt unset, and a retry replays it", async () => {
    const cookie = await trainerCookie("coach.mailfail@example.com");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const recipient = "trainee.mailfail@example.com";
    const create = () =>
      app.request(
        "/invitations",
        {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": "invite-mailfail-1" },
          body: JSON.stringify({ recipientEmail: recipient, recipientDisplayName: "Mail Fail", sendEmail: true }),
        },
        testEnv(),
      );

    const first = await create();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.status).toBe(200);
    const body = (await first.json()) as { data: { id: string; inviteUrl: string; token: string } };
    expect(body.data.inviteUrl).toContain(body.data.token);
    const [row] = await db.select().from(clientInvitations).where(eq(clientInvitations.id, body.data.id));
    expect(row?.emailSentAt).toBeNull();

    const retry = await create();
    expect(retry.status).toBe(200);
    expect(((await retry.json()) as { data: { id: string } }).data.id).toBe(body.data.id);

    const logged = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("Email send failed");
    expect(logged).not.toContain(recipient);
    expect(logged).not.toContain(ZEPTO_TOKEN);
  });
});
