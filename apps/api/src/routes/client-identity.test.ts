/**
 * Z9-18 (D-W8-10): the name and contact phone a trainer sets in Client settings
 * (PATCH /client-settings/relationships/:id/basic) feed Home, Clients, the client
 * workspace header and every WhatsApp draft built from those payloads. Runs the
 * real routes on the persisted demo seed; the client's own profile name and
 * sign-in mobile never change.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc } from "drizzle-orm";
import { app } from "../index.js";
import { schema, setTestDbOverride, type Db } from "../db/client.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import {
  resolveClientDisplayName,
  resolveClientWhatsappE164,
} from "../domain/client-identity.js";

const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";
const RAHUL = "rahul.coach@demo.fitbud.test";
const PRIYA = "priya.coach@demo.fitbud.test";

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
    EMAIL_PROVIDER: "dev_sink",
  };
}

type Headers = Record<string, string>;

type AttentionGroup = {
  relationshipId: string;
  traineeDisplayName: string;
  clientWhatsappE164: string | null;
};
type Candidate = {
  relationshipId: string;
  traineeDisplayName: string;
  waMeUrl: string;
  clientWhatsappE164: string | null;
};
type FeedEvent = {
  relationshipId: string;
  type: string;
  traineeDisplayName: string | null;
};
type DirectoryItem = { relationshipId: string | null; traineeDisplayName: string };

async function trainerHeaders(email: string): Promise<Headers> {
  const response = await app.request(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: email, password: DEMO_PASSWORD_PLAINTEXT }),
    },
    testEnv(),
  );
  const text = await response.text();
  expect(response.status, text).toBe(200);
  const token = (JSON.parse(text) as { data: { token: string } }).data.token;
  return { Authorization: `Bearer ${token}`, "x-fitbud-role": "trainer" };
}

async function getData<T>(path: string, headers: Headers): Promise<T> {
  const response = await app.request(path, { headers }, testEnv());
  const text = await response.text();
  expect(response.status, `${path}: ${text}`).toBe(200);
  return (JSON.parse(text) as { data: T }).data;
}

let keySeq = 0;
async function patchBasics(
  headers: Headers,
  relationshipId: string,
  body: { displayName?: string | null; contactPhone?: string | null },
): Promise<Response> {
  keySeq += 1;
  return app.request(
    `/client-settings/relationships/${relationshipId}/basic`,
    {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": `z9-18-basics-${keySeq}`,
      },
      body: JSON.stringify(body),
    },
    testEnv(),
  );
}

const attentionGroups = async (headers: Headers) => {
  const data = await getData<{ needsYou: AttentionGroup[]; reviewed: AttentionGroup[] }>(
    "/exceptions/attention?groupBy=relationship&limit=50",
    headers,
  );
  return [...data.needsYou, ...data.reviewed];
};
const attentionItems = async (headers: Headers) =>
  (
    await getData<{
      items: Array<{ coachingRelationshipId: string; traineeDisplayName: string | null }>;
    }>("/exceptions/attention?limit=50", headers)
  ).items;
const candidates = async (headers: Headers) =>
  (await getData<{ items: Candidate[] }>("/notifications/reengagement-candidates", headers))
    .items;
const feed = async (headers: Headers) =>
  (await getData<{ events: FeedEvent[] }>("/activity/feed?limit=50", headers)).events;
const directory = async (headers: Headers, q?: string) =>
  (
    await getData<{ items: DirectoryItem[] }>(
      `/clients?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`,
      headers,
    )
  ).items;
const workspaceHeader = async (headers: Headers, relationshipId: string) =>
  (
    await getData<{
      header: { traineeDisplayName: string; clientWhatsappE164: string | null };
    }>(`/workspaces/relationships/${relationshipId}`, headers)
  ).header;

async function identityRows(db: Db) {
  const [identities, profiles] = await Promise.all([
    db.select().from(schema.userIdentities).orderBy(asc(schema.userIdentities.userId)),
    db.select().from(schema.traineeProfiles).orderBy(asc(schema.traineeProfiles.userId)),
  ]);
  return { identities, profiles };
}

describe("client identity resolver (Z9-18)", () => {
  it("prefers the trainer-set name, else the profile name, else null", () => {
    expect(resolveClientDisplayName({ clientDisplayName: "Ro" }, "Rohan Mehta")).toBe("Ro");
    expect(resolveClientDisplayName({ clientDisplayName: null }, "Rohan Mehta")).toBe(
      "Rohan Mehta",
    );
    expect(resolveClientDisplayName({ clientDisplayName: "   " }, "Rohan Mehta")).toBe(
      "Rohan Mehta",
    );
    expect(resolveClientDisplayName({}, undefined)).toBeNull();
    expect(resolveClientDisplayName({ clientDisplayName: null }, "")).toBeNull();
  });

  it("prefers the trainer-set contact phone, else the sign-in mobile, else null", () => {
    expect(
      resolveClientWhatsappE164({ contactPhoneE164: "+919876543210" }, "+919000000007"),
    ).toBe("+919876543210");
    expect(resolveClientWhatsappE164({ contactPhoneE164: null }, "+919000000007")).toBe(
      "+919000000007",
    );
    expect(resolveClientWhatsappE164({ contactPhoneE164: "" }, null)).toBeNull();
    expect(resolveClientWhatsappE164({}, undefined)).toBeNull();
  });
});

describe("trainer-set client name and phone through the routes (Z9-18)", () => {
  let handle: MemoryDbHandle;

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW));
    handle = await createDemoSeededDb(SEED);
    setTestDbOverride(handle.db);
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  /** One Rahul client from each Home section, picked from the real responses. */
  async function pickClients(rahul: Headers) {
    const [group] = await attentionGroups(rahul);
    const [candidate] = await candidates(rahul);
    const event = (await feed(rahul)).find(
      (e) =>
        e.traineeDisplayName &&
        e.relationshipId !== group?.relationshipId &&
        e.relationshipId !== candidate?.relationshipId,
    );
    expect(group, "demo seed has a Home attention group").toBeDefined();
    expect(candidate, "demo seed has a re-engagement candidate").toBeDefined();
    expect(event, "demo seed has a named activity event").toBeDefined();
    expect(group!.relationshipId).not.toBe(candidate!.relationshipId);
    return { group: group!, candidate: candidate!, event: event! };
  }

  it("feeds Clients, search, the workspace header, the Home queue, re-engagement and activity; clearing falls back", async () => {
    const rahul = await trainerHeaders(RAHUL);
    const { group, candidate, event } = await pickClients(rahul);
    const queueId = group.relationshipId;
    const reengageId = candidate.relationshipId;
    const activityId = event.relationshipId;
    const original = {
      queueName: group.traineeDisplayName,
      queuePhone: group.clientWhatsappE164,
      reengageName: candidate.traineeDisplayName,
      reengagePhone: candidate.clientWhatsappE164,
      activityName: event.traineeDisplayName,
    };
    expect(original.queuePhone).toBeTruthy();
    expect(original.reengagePhone).toBeTruthy();
    const before = await identityRows(handle.db);

    // Set through the real Client settings route.
    const sets: Array<[string, string, string]> = [
      [queueId, "Rohit (gym mornings)", "+91 98765 43210"],
      [reengageId, "Farhan Q. (office)", "+91 99887 76655"],
      [activityId, "Coach-set Activity Name", "+91 91234 56789"],
    ];
    for (const [id, displayName, contactPhone] of sets) {
      const response = await patchBasics(rahul, id, { displayName, contactPhone });
      expect(response.status, await response.clone().text()).toBe(200);
    }

    // Clients list and its search.
    const list = await directory(rahul);
    const nameIn = (items: DirectoryItem[], id: string) =>
      items.find((i) => i.relationshipId === id)?.traineeDisplayName;
    expect(nameIn(list, queueId)).toBe("Rohit (gym mornings)");
    expect(nameIn(list, reengageId)).toBe("Farhan Q. (office)");
    expect(nameIn(list, activityId)).toBe("Coach-set Activity Name");
    const searched = await directory(rahul, "gym mornings");
    expect(searched.map((i) => i.relationshipId)).toEqual([queueId]);

    // Workspace header: name and the number the header and Reminders wa.me drafts use.
    const header = await workspaceHeader(rahul, queueId);
    expect(header.traineeDisplayName).toBe("Rohit (gym mornings)");
    expect(header.clientWhatsappE164).toBe("+919876543210");

    // Home queue (grouped, with the review panel's WhatsApp number) and the flat feed.
    const groups = await attentionGroups(rahul);
    const queueGroup = groups.find((g) => g.relationshipId === queueId);
    expect(queueGroup).toMatchObject({
      traineeDisplayName: "Rohit (gym mornings)",
      clientWhatsappE164: "+919876543210",
    });
    const flat = (await attentionItems(rahul)).filter(
      (i) => i.coachingRelationshipId === queueId,
    );
    expect(flat.length).toBeGreaterThan(0);
    for (const item of flat) expect(item.traineeDisplayName).toBe("Rohit (gym mornings)");

    // Home "Re-engage on WhatsApp": name, phone and the draft goes to that phone.
    const reengage = (await candidates(rahul)).find((c) => c.relationshipId === reengageId);
    expect(reengage).toMatchObject({
      traineeDisplayName: "Farhan Q. (office)",
      clientWhatsappE164: "+919988776655",
    });
    expect(reengage!.waMeUrl.startsWith("https://wa.me/919988776655?text=")).toBe(true);

    // Home "Recent activity".
    const events = (await feed(rahul)).filter(
      (e) => e.relationshipId === activityId && e.traineeDisplayName !== null,
    );
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.traineeDisplayName).toBe("Coach-set Activity Name");

    // The client's own profile name and sign-in mobile are untouched (D-W8-10).
    expect(await identityRows(handle.db)).toEqual(before);

    // Clearing both falls back to the profile name and the sign-in mobile.
    for (const [id] of sets) {
      const response = await patchBasics(rahul, id, { displayName: null, contactPhone: null });
      expect(response.status, await response.clone().text()).toBe(200);
    }
    const cleared = await directory(rahul);
    expect(nameIn(cleared, queueId)).toBe(original.queueName);
    expect(nameIn(cleared, reengageId)).toBe(original.reengageName);
    expect(nameIn(cleared, activityId)).toBe(original.activityName);
    expect(await directory(rahul, "gym mornings")).toEqual([]);
    expect(await workspaceHeader(rahul, queueId)).toMatchObject({
      traineeDisplayName: original.queueName,
      clientWhatsappE164: original.queuePhone,
    });
    expect((await attentionGroups(rahul)).find((g) => g.relationshipId === queueId)).toMatchObject(
      { traineeDisplayName: original.queueName, clientWhatsappE164: original.queuePhone },
    );
    expect((await candidates(rahul)).find((c) => c.relationshipId === reengageId)).toMatchObject({
      traineeDisplayName: original.reengageName,
      clientWhatsappE164: original.reengagePhone,
    });
    expect(
      (await feed(rahul)).find(
        (e) => e.relationshipId === activityId && e.traineeDisplayName !== null,
      )?.traineeDisplayName,
    ).toBe(original.activityName);
    expect(await identityRows(handle.db)).toEqual(before);
  });

  it("never shows one trainer's override to another trainer", async () => {
    const rahul = await trainerHeaders(RAHUL);
    const priya = await trainerHeaders(PRIYA);
    const { group } = await pickClients(rahul);
    const response = await patchBasics(rahul, group.relationshipId, {
      displayName: "Rahul-only Nickname",
      contactPhone: "+91 98765 43210",
    });
    expect(response.status).toBe(200);

    // Priya cannot read or overwrite Rahul's client.
    const denied = await patchBasics(priya, group.relationshipId, {
      displayName: "Priya Overwrite",
    });
    expect(denied.status).toBe(404);
    const workspace = await app.request(
      `/workspaces/relationships/${group.relationshipId}`,
      { headers: priya },
      testEnv(),
    );
    expect(workspace.status).not.toBe(200);

    // None of Priya's Home or Clients payloads carry Rahul's override.
    const priyaPayloads = JSON.stringify([
      await directory(priya),
      await directory(priya, "Rahul-only"),
      await attentionGroups(priya),
      await attentionItems(priya),
      await candidates(priya),
      await feed(priya),
    ]);
    expect(priyaPayloads).not.toContain("Rahul-only Nickname");
    expect(priyaPayloads).not.toContain("+919876543210");
    expect(priyaPayloads).not.toContain(group.relationshipId);

    // Rahul still sees his own override, untouched by Priya's attempt.
    expect(
      (await attentionGroups(rahul)).find((g) => g.relationshipId === group.relationshipId),
    ).toMatchObject({
      traineeDisplayName: "Rahul-only Nickname",
      clientWhatsappE164: "+919876543210",
    });
  });
});
