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

async function setupPair(suffix: string) {
  const trainer = await createTrainerSession(`notes-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `notes-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `notes-trainee-${suffix}`,
    `notes-trainee-${suffix}@example.com`,
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
  return {
    trainer,
    traineeToken,
    relationshipId: acceptBody.data.relationship.id,
  };
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

  it("create, edit body, share, make private, and DELETE lifecycle", async () => {
    const { trainer, traineeToken, relationshipId } = await setupPair("life");
    const base = `/checkins/relationships/${relationshipId}/notes`;
    const trainerHeaders = (key: string) => ({
      Cookie: trainer.cookie,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    });
    const traineeNotes = async () => {
      const res = await app.request(
        "/me/coach-notes",
        {
          headers: {
            Authorization: `Bearer ${traineeToken}`,
            "x-fitbud-role": "trainee",
          },
        },
        testEnv(),
      );
      expect(res.status).toBe(200);
      return ((await res.json()) as {
        data: { items: Array<{ id: string; body: string }> };
      }).data.items;
    };

    const created = await app.request(
      base,
      {
        method: "POST",
        headers: trainerHeaders("life-create"),
        body: JSON.stringify({ body: "Lifecycle note", visibility: "private" }),
      },
      testEnv(),
    );
    expect(created.status).toBe(200);
    const note = ((await created.json()) as {
      data: { id: string; visibility: string };
    }).data;
    expect(note.visibility).toBe("private");
    expect(await traineeNotes()).toEqual([]);

    const edited = await app.request(
      `${base}/${note.id}`,
      {
        method: "PATCH",
        headers: trainerHeaders("life-edit"),
        body: JSON.stringify({ body: "Lifecycle note edited" }),
      },
      testEnv(),
    );
    expect(edited.status).toBe(200);
    const editedBody = (await edited.json()) as {
      data: { body: string; visibility: string };
    };
    expect(editedBody.data.body).toBe("Lifecycle note edited");
    expect(editedBody.data.visibility).toBe("private");
    expect(await traineeNotes()).toEqual([]);

    const shared = await app.request(
      `${base}/${note.id}`,
      {
        method: "PATCH",
        headers: trainerHeaders("life-share"),
        body: JSON.stringify({ visibility: "client", body: "Shared body" }),
      },
      testEnv(),
    );
    expect(shared.status).toBe(200);
    const visible = await traineeNotes();
    expect(visible.map((n) => n.body)).toEqual(["Shared body"]);

    const emptyPatch = await app.request(
      `${base}/${note.id}`,
      {
        method: "PATCH",
        headers: trainerHeaders("life-empty"),
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(emptyPatch.status).toBe(400);

    const priv = await app.request(
      `${base}/${note.id}`,
      {
        method: "PATCH",
        headers: trainerHeaders("life-private"),
        body: JSON.stringify({ visibility: "private" }),
      },
      testEnv(),
    );
    expect(priv.status).toBe(200);
    expect(await traineeNotes()).toEqual([]);

    await app.request(
      `${base}/${note.id}`,
      {
        method: "PATCH",
        headers: trainerHeaders("life-reshare"),
        body: JSON.stringify({ visibility: "client" }),
      },
      testEnv(),
    );
    expect(await traineeNotes()).toHaveLength(1);

    const del = await app.request(
      `${base}/${note.id}`,
      { method: "DELETE", headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(del.status).toBe(200);
    expect(await traineeNotes()).toEqual([]);

    const list = await app.request(
      base,
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    const listBody = (await list.json()) as { data: { items: unknown[] } };
    expect(listBody.data.items).toHaveLength(0);

    const again = await app.request(
      `${base}/${note.id}`,
      { method: "DELETE", headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(again.status).toBe(404);
  });

  it("DELETE enforces trainer ownership and blocks ended relationships", async () => {
    const owner = await setupPair("own");
    const other = await createTrainerSession("notes-other-coach@example.com");
    const base = `/checkins/relationships/${owner.relationshipId}/notes`;
    const created = await app.request(
      base,
      {
        method: "POST",
        headers: {
          Cookie: owner.trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "own-create",
        },
        body: JSON.stringify({ body: "Owned note" }),
      },
      testEnv(),
    );
    const noteId = ((await created.json()) as { data: { id: string } }).data.id;

    const foreign = await app.request(
      `${base}/${noteId}`,
      { method: "DELETE", headers: { Cookie: other.cookie } },
      testEnv(),
    );
    expect(foreign.status).toBe(404);

    const traineeAttempt = await app.request(
      `${base}/${noteId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${owner.traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect([401, 403]).toContain(traineeAttempt.status);

    const ended = await app.request(
      `/relationships/${owner.relationshipId}/end`,
      {
        method: "POST",
        headers: {
          Cookie: owner.trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "own-end",
        },
        body: JSON.stringify({ reason: "other" }),
      },
      testEnv(),
    );
    expect(ended.status).toBe(200);

    const blocked = await app.request(
      `${base}/${noteId}`,
      { method: "DELETE", headers: { Cookie: owner.trainer.cookie } },
      testEnv(),
    );
    expect(blocked.status).toBeGreaterThanOrEqual(400);
    expect(blocked.status).not.toBe(200);
    const blockedPatch = await app.request(
      `${base}/${noteId}`,
      {
        method: "PATCH",
        headers: {
          Cookie: owner.trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "own-patch-ended",
        },
        body: JSON.stringify({ body: "nope" }),
      },
      testEnv(),
    );
    expect(blockedPatch.status).toBeGreaterThanOrEqual(400);
  });
});
