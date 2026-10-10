import initSqlJs, { type Database } from "sql.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sql-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import * as schema from "../db/schema.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
const SEEDED_FORM_ID = "11111111-1111-4111-8111-111111111111";
const DEFAULT_TEMPLATE_ID = "10111111-1111-4111-8111-111111111111";
const TRAINER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TRAINEE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TRAINER_VERSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RESPONSE_INVITE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RESOLVER_INVITE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const RELATIONSHIP_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const MIGRATIONS_BEFORE = [
  "0000_identity.sql",
  "0001_relationship_onboarding.sql",
  "0012_invitation_whatsapp.sql",
  "0002_coaching_configuration.sql",
  "0010_notifications.sql",
  "0013_domain_contracts.sql",
];

const APP_MIGRATIONS = [
  ...MIGRATIONS_BEFORE,
  "0014_onboarding_form_templates.sql",
  "0011_templates_libraries.sql",
  "0015_iteration_a.sql",
  "0016_food_exercise_libraries.sql",
];

function applySql(sqlite: Database, file: string) {
  sqlite.exec(readFileSync(join(drizzleDir, file), "utf8"));
}

function scalar(sqlite: Database, sql: string): unknown {
  const result = sqlite.exec(sql);
  return result[0]?.values[0]?.[0];
}

describe("migration 0014 backfill", () => {
  it("pins response versions and otherwise the resolver result", async () => {
    const SQL = await initSqlJs();
    const sqlite = new SQL.Database();
    for (const file of MIGRATIONS_BEFORE) applySql(sqlite, file);

    sqlite.run(
      `INSERT INTO users (id, firebase_uid, account_state, timezone, created_at, updated_at)
       VALUES (?, 'trainer-fb', 'active', 'Asia/Kolkata', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
              (?, 'trainee-fb', 'active', 'Asia/Kolkata', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
      [TRAINER_ID, TRAINEE_ID],
    );
    sqlite.run(
      `INSERT INTO onboarding_form_versions (id, key, version, scope, trainer_user_id, schema_json, created_at)
       VALUES (?, 'studio', 2, 'trainer', ?, '{"fields":[{"id":"goals","type":"textarea","label":"Goals","required":true}]}', '2026-10-02T00:00:00.000Z')`,
      [TRAINER_VERSION_ID, TRAINER_ID],
    );
    sqlite.run(
      `INSERT INTO client_invitations (
         id, trainer_user_id, recipient_email, recipient_display_name, recipient_whatsapp_e164,
         token_hash, status, expires_at, accepted_user_id, created_at, updated_at
       ) VALUES
       (?, ?, 'with-response@example.com', 'With', NULL, 'hash-a', 'accepted', '2026-10-01T00:00:00.000Z', ?, '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
       (?, ?, 'resolver@example.com', 'Resolver', NULL, 'hash-b', 'pending', '2026-10-01T00:00:00.000Z', NULL, '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z')`,
      [RESPONSE_INVITE_ID, TRAINER_ID, TRAINEE_ID, RESOLVER_INVITE_ID, TRAINER_ID],
    );
    sqlite.run(
      `INSERT INTO coaching_relationships (
         id, trainer_user_id, trainee_user_id, status, invitation_id, started_at, ended_at, created_at, updated_at
       ) VALUES (?, ?, ?, 'active', ?, '2026-09-02T00:00:00.000Z', NULL, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z')`,
      [RELATIONSHIP_ID, TRAINER_ID, TRAINEE_ID, RESPONSE_INVITE_ID],
    );
    sqlite.run(
      `INSERT INTO onboarding_form_responses (
         id, coaching_relationship_id, onboarding_form_version_id, trainee_user_id, status,
         answers_json, version, submitted_at, created_at, updated_at
       ) VALUES (
         'abababab-abab-4aba-8aba-abababababab', ?, ?, ?, 'submitted',
         '{}', 1, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'
       )`,
      [RELATIONSHIP_ID, SEEDED_FORM_ID, TRAINEE_ID],
    );

    applySql(sqlite, "0014_onboarding_form_templates.sql");

    expect(scalar(sqlite, `SELECT template_id FROM onboarding_form_versions WHERE id = '${SEEDED_FORM_ID}'`)).toBe(
      DEFAULT_TEMPLATE_ID,
    );
    expect(
      scalar(sqlite, `SELECT name FROM onboarding_form_templates WHERE id = '${DEFAULT_TEMPLATE_ID}'`),
    ).toBe("Default onboarding");
    expect(
      scalar(sqlite, `SELECT ownership FROM onboarding_form_templates WHERE id = '${DEFAULT_TEMPLATE_ID}'`),
    ).toBe("global");
    expect(
      scalar(
        sqlite,
        `SELECT onboarding_form_template_version_id FROM client_invitations WHERE id = '${RESPONSE_INVITE_ID}'`,
      ),
    ).toBe(SEEDED_FORM_ID);
    expect(
      scalar(
        sqlite,
        `SELECT onboarding_form_template_version_id FROM client_invitations WHERE id = '${RESOLVER_INVITE_ID}'`,
      ),
    ).toBe(TRAINER_VERSION_ID);

    const columns = sqlite.exec("PRAGMA table_info(client_invitations)")[0]!;
    const nameIndex = columns.columns.indexOf("name");
    const notNullIndex = columns.columns.indexOf("notnull");
    const pinColumn = columns.values.find(
      (row) => row[nameIndex] === "onboarding_form_template_version_id",
    );
    expect(pinColumn?.[notNullIndex]).toBe(1);

    const originalSchema = scalar(
      sqlite,
      `SELECT schema_json FROM onboarding_form_versions WHERE id = '${SEEDED_FORM_ID}'`,
    );
    expect(() =>
      sqlite.run(
        `UPDATE onboarding_form_versions SET schema_json = '{"fields":[]}' WHERE id = '${SEEDED_FORM_ID}'`,
      ),
    ).toThrow();
    expect(
      scalar(sqlite, `SELECT schema_json FROM onboarding_form_versions WHERE id = '${SEEDED_FORM_ID}'`),
    ).toBe(originalSchema);

    sqlite.close();
  });
});

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
      dump: async () => new ArrayBuffer(0),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

const SELECT_FIELDS = {
  fields: [
    {
      id: "experience",
      type: "select",
      label: "Experience",
      required: true,
      options: ["New", "Returning"],
    },
  ],
};

describe("onboarding form template pinning", () => {
  let closeDb: (() => void) | null = null;
  let db: Db;

  beforeEach(async () => {
    const SQL = await initSqlJs();
    const sqlite = new SQL.Database();
    for (const file of APP_MIGRATIONS) applySql(sqlite, file);
    db = drizzle(sqlite, { schema }) as unknown as Db;
    closeDb = () => sqlite.close();
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb?.();
    closeDb = null;
  });

  async function trainerSession(email: string) {
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
    expect(sessionResponse.status).toBe(200);
    const cookie = sessionResponse.headers.get("set-cookie")!.split(";")[0]!;
    const me = await app.request("/me", { headers: { Cookie: cookie } }, testEnv());
    const meBody = (await me.json()) as { data: { userId: string } };
    return { cookie, userId: meBody.data.userId };
  }

  async function invite(
    cookie: string,
    email: string,
    body: Record<string, unknown> = {},
  ) {
    const response = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": `invite-${email}`,
        },
        body: JSON.stringify({ recipientEmail: email, ...body }),
      },
      testEnv(),
    );
    const payload = (await response.json()) as {
      data: { token: string; onboardingFormTemplateVersionId: string };
    };
    expect(response.status).toBe(200);
    return payload.data;
  }

  async function accept(email: string, token: string) {
    const traineeToken = createTestIdToken(`trainee-${email}`, email);
    const response = await app.request(
      "/invitations/accept",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, timezone: "Asia/Kolkata" }),
      },
      testEnv(),
    );
    const payload = (await response.json()) as {
      data: { relationship: { id: string } };
    };
    return { status: response.status, traineeToken, relationshipId: payload.data.relationship.id };
  }

  it("keeps an omitted template pin when a newer version appears", async () => {
    const trainer = await trainerSession("omit-coach@example.com");
    const created = await invite(trainer.cookie, "omit-trainee@example.com");
    expect(created.onboardingFormTemplateVersionId).toBe(SEEDED_FORM_ID);

    const newerTemplateId = "12121212-1212-4121-8121-121212121212";
    const newerVersionId = "13131313-1313-4131-8131-131313131313";
    await db.insert(schema.onboardingFormTemplates).values({
      id: newerTemplateId,
      ownership: "global",
      trainerUserId: null,
      name: "Newer global",
      description: null,
      createdAt: "2026-10-06T00:00:00.000Z",
      updatedAt: "2026-10-06T00:00:00.000Z",
    });
    await db.insert(schema.onboardingFormVersions).values({
      id: newerVersionId,
      templateId: newerTemplateId,
      key: "newer",
      version: 9,
      scope: "global",
      trainerUserId: null,
      schemaJson: JSON.stringify(SELECT_FIELDS),
      createdAt: "2026-10-06T00:00:00.000Z",
    });

    const accepted = await accept("omit-trainee@example.com", created.token);
    const current = await app.request(
      `/onboarding/forms/current?relationshipId=${accepted.relationshipId}`,
      {
        headers: {
          Authorization: `Bearer ${accepted.traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const currentBody = (await current.json()) as { data: { id: string } };
    expect(current.status).toBe(200);
    expect(currentBody.data.id).toBe(SEEDED_FORM_ID);
  });

  it("pins the latest version of a selected global template without copying it", async () => {
    const trainer = await trainerSession("select-coach@example.com");
    const latestId = "14141414-1414-4141-8141-141414141414";
    const otherTemplateId = "15151515-1515-4151-8151-151515151515";
    const otherVersionId = "16161616-1616-4161-8161-161616161616";
    await db.insert(schema.onboardingFormVersions).values({
      id: latestId,
      templateId: DEFAULT_TEMPLATE_ID,
      key: "mvp",
      version: 2,
      scope: "global",
      trainerUserId: null,
      schemaJson: JSON.stringify(SELECT_FIELDS),
      createdAt: "2026-10-05T00:00:00.000Z",
    });
    await db.insert(schema.onboardingFormTemplates).values({
      id: otherTemplateId,
      ownership: "global",
      trainerUserId: null,
      name: "Other global",
      description: null,
      createdAt: "2026-10-06T00:00:00.000Z",
      updatedAt: "2026-10-06T00:00:00.000Z",
    });
    await db.insert(schema.onboardingFormVersions).values({
      id: otherVersionId,
      templateId: otherTemplateId,
      key: "other",
      version: 9,
      scope: "global",
      trainerUserId: null,
      schemaJson: JSON.stringify(SELECT_FIELDS),
      createdAt: "2026-10-06T00:00:00.000Z",
    });
    const before = await db
      .select()
      .from(schema.onboardingFormTemplates)
      .where(eq(schema.onboardingFormTemplates.trainerUserId, trainer.userId));
    const created = await invite(trainer.cookie, "select-trainee@example.com", {
      onboardingFormTemplateId: DEFAULT_TEMPLATE_ID,
    });
    expect(created.onboardingFormTemplateVersionId).toBe(latestId);
    const after = await db
      .select()
      .from(schema.onboardingFormTemplates)
      .where(eq(schema.onboardingFormTemplates.trainerUserId, trainer.userId));
    expect(after).toHaveLength(before.length);
  });

  it("leaves a forked invitation on version 1 after a later version", async () => {
    const trainer = await trainerSession("fork-coach@example.com");
    const fork = await app.request(
      `/onboarding/form-templates/${DEFAULT_TEMPLATE_ID}/fork`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "fork-studio",
        },
        body: JSON.stringify({ name: "Studio intake" }),
      },
      testEnv(),
    );
    expect(fork.status).toBe(201);
    const forkBody = (await fork.json()) as {
      data: { id: string; ownership: string; versions: Array<{ id: string; version: number }> };
    };
    expect(forkBody.data.ownership).toBe("trainer");
    expect(forkBody.data.versions).toEqual([
      expect.objectContaining({ version: 1 }),
    ]);
    const versionOneId = forkBody.data.versions[0]!.id;

    const created = await invite(trainer.cookie, "fork-trainee@example.com", {
      onboardingFormTemplateId: forkBody.data.id,
    });
    expect(created.onboardingFormTemplateVersionId).toBe(versionOneId);

    const next = await app.request(
      `/onboarding/form-templates/${forkBody.data.id}/versions`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "fork-v2",
        },
        body: JSON.stringify(SELECT_FIELDS),
      },
      testEnv(),
    );
    expect(next.status).toBe(201);
    const nextBody = (await next.json()) as {
      data: { versions: Array<{ id: string; version: number }> };
    };
    expect(nextBody.data.versions.map((version) => version.version)).toEqual([1, 2]);
    expect(created.onboardingFormTemplateVersionId).toBe(versionOneId);

    const accepted = await accept("fork-trainee@example.com", created.token);
    const draft = await app.request(
      `/onboarding/relationships/${accepted.relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accepted.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: 0,
          answers: { goals: "Strength", schedule: "Mornings" },
        }),
      },
      testEnv(),
    );
    const draftBody = (await draft.json()) as {
      data: { onboardingFormVersionId: string };
    };
    expect(draft.status).toBe(201);
    expect(draftBody.data.onboardingFormVersionId).toBe(versionOneId);
  });

  it("rejects in-place edits and hides other trainers' templates", async () => {
    const trainer = await trainerSession("owner-coach@example.com");
    const other = await trainerSession("other-coach@example.com");
    const created = await app.request(
      "/onboarding/form-templates",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "create-private",
        },
        body: JSON.stringify({ name: "Private intake", ...SELECT_FIELDS }),
      },
      testEnv(),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: { id: string; versions: Array<{ id: string; fields: unknown }> };
    };
    const versionId = createdBody.data.versions[0]!.id;
    const stored = await db
      .select()
      .from(schema.onboardingFormVersions)
      .where(eq(schema.onboardingFormVersions.id, versionId));
    expect(stored[0]?.schemaJson).toContain("experience");

    const globalRead = await app.request(
      `/onboarding/form-templates/${DEFAULT_TEMPLATE_ID}`,
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(globalRead.status).toBe(200);
    const ownRead = await app.request(
      `/onboarding/form-templates/${createdBody.data.id}`,
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(ownRead.status).toBe(200);
    const hidden = await app.request(
      `/onboarding/form-templates/${createdBody.data.id}`,
      { headers: { Cookie: other.cookie } },
      testEnv(),
    );
    expect(hidden.status).toBe(404);

    const globalEdit = await app.request(
      `/onboarding/form-templates/${DEFAULT_TEMPLATE_ID}/versions`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "edit-global",
        },
        body: JSON.stringify(SELECT_FIELDS),
      },
      testEnv(),
    );
    expect(globalEdit.status).toBe(403);

    const invited = await invite(trainer.cookie, "private-trainee@example.com", {
      onboardingFormTemplateId: createdBody.data.id,
    });
    const accepted = await accept("private-trainee@example.com", invited.token);
    const otherInvite = await invite(other.cookie, "other-trainee@example.com");
    const otherAccepted = await accept("other-trainee@example.com", otherInvite.token);
    const unrelated = await app.request(
      `/onboarding/form-templates/${createdBody.data.id}`,
      {
        headers: {
          Authorization: `Bearer ${otherAccepted.traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(unrelated.status).toBe(404);
    const traineeRead = await app.request(
      `/onboarding/form-templates/${createdBody.data.id}`,
      {
        headers: {
          Authorization: `Bearer ${accepted.traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(traineeRead.status).toBe(200);

    const crossSubmit = await app.request(
      `/onboarding/relationships/${otherAccepted.relationshipId}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accepted.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "cross-submit",
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    expect(crossSubmit.status).toBe(404);
  });

  it("validates submission against the pinned field definition", async () => {
    const trainer = await trainerSession("submit-coach@example.com");
    const createdTemplate = await app.request(
      "/onboarding/form-templates",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "create-select",
        },
        body: JSON.stringify({ name: "Experience intake", ...SELECT_FIELDS }),
      },
      testEnv(),
    );
    const templateBody = (await createdTemplate.json()) as {
      data: { id: string; versions: Array<{ id: string }> };
    };
    const versionId = templateBody.data.versions[0]!.id;
    const invited = await invite(trainer.cookie, "submit-trainee@example.com", {
      onboardingFormTemplateId: templateBody.data.id,
    });
    expect(invited.onboardingFormTemplateVersionId).toBe(versionId);
    const accepted = await accept("submit-trainee@example.com", invited.token);

    const draft = await app.request(
      `/onboarding/relationships/${accepted.relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accepted.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expectedVersion: 0, answers: { experience: "Expert" } }),
      },
      testEnv(),
    );
    const draftBody = (await draft.json()) as {
      data: { version: number; onboardingFormVersionId: string };
    };
    expect(draft.status).toBe(201);
    expect(draftBody.data.onboardingFormVersionId).toBe(versionId);

    const rejected = await app.request(
      `/onboarding/relationships/${accepted.relationshipId}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accepted.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "submit-invalid",
        },
        body: JSON.stringify({ expectedVersion: draftBody.data.version }),
      },
      testEnv(),
    );
    expect(rejected.status).toBe(422);

    const corrected = await app.request(
      `/onboarding/relationships/${accepted.relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accepted.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: draftBody.data.version,
          answers: { experience: "New" },
        }),
      },
      testEnv(),
    );
    const correctedBody = (await corrected.json()) as { data: { version: number } };
    const submitted = await app.request(
      `/onboarding/relationships/${accepted.relationshipId}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accepted.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "submit-valid",
        },
        body: JSON.stringify({ expectedVersion: correctedBody.data.version }),
      },
      testEnv(),
    );
    const submittedBody = (await submitted.json()) as {
      data: { status: string; onboardingFormVersionId: string };
    };
    expect(submitted.status).toBe(200);
    expect(submittedBody.data.status).toBe("submitted");
    expect(submittedBody.data.onboardingFormVersionId).toBe(versionId);
  });
});
