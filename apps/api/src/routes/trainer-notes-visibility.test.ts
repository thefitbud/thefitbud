import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { createMemoryDb } from "../test-support/memory-db.js";

function dummyD1(): D1Database {
  return {
    prepare() {
      throw new Error("D1 should not be used when test DB override is set");
    },
    dump: async () => new ArrayBuffer(0),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
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
  };
}

async function createTrainerSession(email: string) {
  const token = createTestIdToken(`trainer-${email}`, email);
  const sessionResponse = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  const setCookie = sessionResponse.headers.get("set-cookie");
  return { cookie: setCookie!.split(";")[0]! };
}

describe("TW-C trainer note visibility", () => {
  let close: (() => void) | undefined;

  beforeEach(async () => {
    const handle = await createMemoryDb();
    setTestDbOverride(handle.db);
    close = handle.close;
  });

  afterEach(() => {
    setTestDbOverride(null);
    close?.();
    close = undefined;
  });

  it("private notes never appear in trainee /me/coach-notes; client notes do", async () => {
    const trainer = await createTrainerSession("notes-coach@example.com");
    const created = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "inv-notes-vis",
        },
        body: JSON.stringify({
          recipientEmail: "notes-trainee@example.com",
        }),
      },
      testEnv(),
    );
    const createdBody = (await created.json()) as { data: { token: string } };
    const traineeToken = createTestIdToken(
      "notes-trainee",
      "notes-trainee@example.com",
    );
    const accept = await app.request(
      "/invitations/accept",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: createdBody.data.token,
          timezone: "Asia/Kolkata",
        }),
      },
      testEnv(),
    );
    const acceptBody = (await accept.json()) as {
      data: { relationship: { id: string } };
    };
    const relationshipId = acceptBody.data.relationship.id;

    const privateNote = await app.request(
      `/checkins/relationships/${relationshipId}/notes`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "note-private-1",
        },
        body: JSON.stringify({
          body: "SECRET_PRIVATE_NOTE_BODY",
          visibility: "private",
        }),
      },
      testEnv(),
    );
    expect(privateNote.status).toBe(200);
    const privateBody = (await privateNote.json()) as { data: { id: string } };

    const clientNote = await app.request(
      `/checkins/relationships/${relationshipId}/notes`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "note-client-1",
        },
        body: JSON.stringify({
          body: "VISIBLE_CLIENT_NOTE_BODY",
          visibility: "client",
        }),
      },
      testEnv(),
    );
    expect(clientNote.status).toBe(200);
    const clientBody = (await clientNote.json()) as { data: { id: string } };

    const traineeList = await app.request(
      "/me/coach-notes",
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(traineeList.status).toBe(200);
    const listBody = (await traineeList.json()) as {
      data: { items: Array<{ id: string; body: string }> };
    };
    expect(
      listBody.data.items.some((n) => n.body === "SECRET_PRIVATE_NOTE_BODY"),
    ).toBe(false);
    expect(
      listBody.data.items.some((n) => n.body === "VISIBLE_CLIENT_NOTE_BODY"),
    ).toBe(true);

    const makePrivate = await app.request(
      `/checkins/relationships/${relationshipId}/notes/${clientBody.data.id}`,
      {
        method: "PATCH",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "note-make-private",
        },
        body: JSON.stringify({ visibility: "private" }),
      },
      testEnv(),
    );
    expect(makePrivate.status).toBe(200);

    const after = await app.request(
      "/me/coach-notes",
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const afterBody = (await after.json()) as {
      data: { items: Array<{ id: string; body: string }> };
    };
    expect(afterBody.data.items.some((n) => n.id === clientBody.data.id)).toBe(
      false,
    );
    expect(
      afterBody.data.items.some((n) => n.id === privateBody.data.id),
    ).toBe(false);
  });
});
