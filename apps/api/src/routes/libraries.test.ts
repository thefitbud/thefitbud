import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride } from "../db/client.js";
import type { Env } from "../types.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import {
  DEMO_TRAINER,
  DEMO_TRAINEE,
  describeTrips,
  installRoundTripCounter,
  loginHeaders,
  queryCountTestEnv,
} from "../test-support/query-count.js";
import { exerciseLibraryDetailResponseSchema } from "@fitbud/contracts";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";

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
    ENVIRONMENT: "local",
  };
}

async function trainerHeaders(email: string) {
  const login = await app.request(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: email, password: DEMO_PASSWORD_PLAINTEXT }),
    },
    testEnv(),
  );
  expect(login.status).toBe(200);
  const body = (await login.json()) as { data: { token: string } };
  return {
    Authorization: `Bearer ${body.data.token}`,
    "x-fitbud-role": "trainer",
  };
}

describe("library search API (T08)", () => {
  let close: () => void = () => {};
  // Seeded once per file "as of now"; each test still gets its own copy.
  const referenceInstant = new Date().toISOString();

  beforeAll(async () => {
    await prepareDemoSeededDb(referenceInstant);
  }, 120_000);

  beforeEach(async () => {
    const handle = await createDemoSeededDb(referenceInstant);
    setTestDbOverride(handle.db);
    close = handle.close;
  }, 120_000);

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it("finds roti via FTS and Hindi alias; protein query does not match roti", async () => {
    const headers = await trainerHeaders("rahul.coach@demo.fitbud.test");
    const roti = await app.request(
      "/libraries/foods?q=roti",
      { headers },
      testEnv(),
    );
    expect(roti.status).toBe(200);
    const rotiBody = (await roti.json()) as {
      data: { items: Array<{ name: string }> };
    };
    expect(
      rotiBody.data.items.some((i) => /chapati|roti/i.test(i.name)),
    ).toBe(true);

    const hindi = await app.request(
      "/libraries/foods?q=" + encodeURIComponent("रोटी"),
      { headers },
      testEnv(),
    );
    expect(hindi.status).toBe(200);
    const hindiBody = (await hindi.json()) as {
      data: { items: Array<{ name: string }> };
    };
    expect(hindiBody.data.items.length).toBeGreaterThan(0);

    const protein = await app.request(
      "/libraries/foods?q=" + encodeURIComponent("प्रोटीन"),
      { headers },
      testEnv(),
    );
    const proteinBody = (await protein.json()) as {
      data: { items: Array<{ name: string }> };
    };
    expect(
      proteinBody.data.items.some((i) => /chapati|roti/i.test(i.name)),
    ).toBe(false);
  });

  it("returns 403 for trainee creating trainer foods", async () => {
    const login = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "aarav.ontrack@demo.fitbud.test",
          password: DEMO_PASSWORD_PLAINTEXT,
        }),
      },
      testEnv(),
    );
    const token = ((await login.json()) as { data: { token: string } }).data.token;
    const response = await app.request(
      "/libraries/foods",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test",
          classification: "ingredient",
          basis: "per_100g",
          energyKcal: 100,
          servings: [{ label: "1 cup", unit: "cup", conversion: 1 }],
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(403);
  });
});

describe("exercise detail API (Z14-51)", () => {
  let handle: MemoryDbHandle;
  let env: Env;
  const referenceInstant = new Date().toISOString();
  const OTHER_TRAINER = "priya.coach@demo.fitbud.test";

  beforeAll(async () => {
    await prepareDemoSeededDb(referenceInstant);
  }, 120_000);

  beforeEach(async () => {
    handle = await createDemoSeededDb(referenceInstant);
    setTestDbOverride(handle.db);
    env = queryCountTestEnv();
  }, 120_000);

  afterEach(() => {
    setTestDbOverride(null);
    handle.close();
  });

  type Rel = { id: string; name: string; thumbnailUrl: string | null };
  type Detail = {
    item: { id: string; name: string };
    steps: string[];
    cues: string[];
    mistakes: string[];
    related: { easier: Rel[]; harder: Rel[]; swapFor: Rel[] };
  };

  async function createOwn(email: string, name: string): Promise<string> {
    const headers = await loginHeaders(email, "trainer", env);
    const res = await app.request(
      "/libraries/exercises",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          instructions: null,
          primaryMuscles: ["quads"],
          secondaryMuscles: [],
          equipment: [],
          difficulty: "beginner",
        }),
      },
      env,
    );
    expect(res.status).toBe(201);
    return ((await res.json()) as { data: { id: string } }).data.id;
  }

  async function detail(email: string, id: string) {
    const headers = await loginHeaders(email, "trainer", env);
    return app.request(`/libraries/exercises/${id}`, { headers }, env);
  }

  const globalId = (name: string) =>
    String(
      handle.sqlite.exec(
        `SELECT id FROM exercise_library_items WHERE ownership = 'global' AND name = '${name}'`,
      )[0]!.values[0]![0],
    );

  function addInstruction(id: string, kind: string, position: number, text: string, lang = "en") {
    handle.sqlite.exec(
      `INSERT INTO exercise_library_instructions (id, exercise_library_item_id, kind, position, text, lang, provenance)
       VALUES ('${crypto.randomUUID()}', '${id}', '${kind}', ${position}, '${text}', '${lang}', 'test')`,
    );
  }

  function addRelation(id: string, related: string, kind: string) {
    handle.sqlite.exec(
      `INSERT INTO exercise_library_relations (exercise_library_item_id, related_exercise_id, kind, method, confidence)
       VALUES ('${id}', '${related}', '${kind}', 'test', 'high')`,
    );
  }

  /** A seeded global squat with hand-written coaching content and relations. */
  function prepareGlobalSquat(): string {
    const id = globalId("Back squat (barbell)");
    handle.sqlite.exec(`DELETE FROM exercise_library_instructions WHERE exercise_library_item_id = '${id}'`);
    handle.sqlite.exec(`DELETE FROM exercise_library_relations WHERE exercise_library_item_id = '${id}'`);
    ["Set the bar on your upper back.", "Brace and unrack.", "Sit down between your hips.", "Drive back up."].forEach(
      (t, i) => addInstruction(id, "step", i + 1, t),
    );
    ["Chest up", "Knees track toes", "Whole foot on the floor"].forEach((t, i) =>
      addInstruction(id, "cue", i + 1, t),
    );
    ["Heels lift", "Knees cave in", "Back rounds"].forEach((t, i) =>
      addInstruction(id, "mistake", i + 1, t),
    );
    addRelation(id, globalId("Box squat"), "regression");
    addRelation(id, globalId("Front squat (barbell)"), "progression");
    addRelation(id, globalId("Leg press"), "alternative");
    addRelation(id, globalId("Hack squat"), "gym_alternative");
    return id;
  }

  it("returns a seeded global exercise with steps, cues, mistakes and grouped related exercises", async () => {
    const id = prepareGlobalSquat();
    const res = await detail(DEMO_TRAINER, id);
    expect(res.status).toBe(200);
    const body = ((await res.json()) as { data: Detail }).data;
    exerciseLibraryDetailResponseSchema.parse(body);
    expect(body.item.id).toBe(id);
    expect(body.steps).toHaveLength(4);
    expect(body.cues).toHaveLength(3);
    expect(body.mistakes).toHaveLength(3);
    expect(body.related.easier.map((r) => r.name)).toEqual(["Box squat"]);
    expect(body.related.harder.map((r) => r.name)).toEqual(["Front squat (barbell)"]);
    expect(body.related.swapFor.map((r) => r.name)).toEqual(["Hack squat", "Leg press"]);
    for (const rel of [...body.related.easier, ...body.related.harder, ...body.related.swapFor]) {
      if (rel.thumbnailUrl) {
        expect(rel.thumbnailUrl).toMatch(
          /^\/library\/exercise-media\/[0-9a-f-]{36}\?exp=\d+&sig=[0-9a-f]+$/,
        );
      }
    }
    expect(JSON.stringify(body)).not.toContain("storage");
  });

  it("returns empty arrays for an own exercise with no instructions or relations", async () => {
    const id = await createOwn(DEMO_TRAINER, "Sled drag (own)");
    const res = await detail(DEMO_TRAINER, id);
    expect(res.status).toBe(200);
    const body = ((await res.json()) as { data: Detail }).data;
    expect(body.item.name).toBe("Sled drag (own)");
    expect(body.steps).toEqual([]);
    expect(body.cues).toEqual([]);
    expect(body.mistakes).toEqual([]);
    expect(body.related).toEqual({ easier: [], harder: [], swapFor: [] });
  });

  it("404s another trainer's exercise, an unknown id and an archived own exercise with static text", async () => {
    const theirs = await createOwn(OTHER_TRAINER, "Priya private press");
    const res = await detail(DEMO_TRAINER, theirs);
    expect(res.status).toBe(404);
    const text = await res.text();
    const parsed = JSON.parse(text) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe("EXERCISE_LIBRARY_ITEM_NOT_FOUND");
    expect(parsed.error.message).toBe("Exercise library item not found.");
    expect(text).not.toContain(theirs);
    expect(text).not.toContain("Priya");

    const unknown = await detail(DEMO_TRAINER, "00000000-0000-4000-8000-0000000000ff");
    expect(unknown.status).toBe(404);

    const mine = await createOwn(DEMO_TRAINER, "Archived own");
    const headers = await loginHeaders(DEMO_TRAINER, "trainer", env);
    await app.request(`/libraries/exercises/${mine}`, { method: "DELETE", headers }, env);
    expect((await detail(DEMO_TRAINER, mine)).status).toBe(404);
  });

  it("401 when unauthenticated and 403 for a trainee", async () => {
    const id = globalId("Back squat (barbell)");
    expect((await app.request(`/libraries/exercises/${id}`, {}, env)).status).toBe(401);
    const trainee = await loginHeaders(DEMO_TRAINEE, "trainee", env);
    expect(
      (await app.request(`/libraries/exercises/${id}`, { headers: trainee }, env)).status,
    ).toBe(403);
  });

  it("orders by position, ignores other languages, groups, dedupes and leaves out private and archived related", async () => {
    const main = await createOwn(DEMO_TRAINER, "Main lift");
    const zeta = await createOwn(DEMO_TRAINER, "Zeta regression");
    const bravo = await createOwn(DEMO_TRAINER, "Bravo progression");
    const charlie = await createOwn(DEMO_TRAINER, "Charlie swap");
    const alpha = await createOwn(DEMO_TRAINER, "Alpha swap");
    const gone = await createOwn(DEMO_TRAINER, "Archived progression");
    const priyas = await createOwn(OTHER_TRAINER, "Priya private swap");
    const headers = await loginHeaders(DEMO_TRAINER, "trainer", env);
    await app.request(`/libraries/exercises/${gone}`, { method: "DELETE", headers }, env);
    const globalBarbell = globalId("Leg press");

    addInstruction(main, "step", 2, "Second step");
    addInstruction(main, "step", 1, "First step");
    addInstruction(main, "step", 1, "Pehla kadam", "hi");
    addInstruction(main, "cue", 1, "Chest up");
    addInstruction(main, "mistake", 1, "Knees cave in");
    addRelation(main, zeta, "regression");
    addRelation(main, bravo, "progression");
    addRelation(main, gone, "progression");
    addRelation(main, charlie, "alternative");
    addRelation(main, charlie, "home_alternative");
    addRelation(main, alpha, "gym_alternative");
    addRelation(main, priyas, "alternative");
    addRelation(main, globalBarbell, "alternative");

    const res = await detail(DEMO_TRAINER, main);
    expect(res.status).toBe(200);
    const body = ((await res.json()) as { data: Detail }).data;
    expect(body.steps).toEqual(["First step", "Second step"]);
    expect(body.cues).toEqual(["Chest up"]);
    expect(body.mistakes).toEqual(["Knees cave in"]);
    expect(body.related.easier.map((r) => r.name)).toEqual(["Zeta regression"]);
    expect(body.related.harder.map((r) => r.name)).toEqual(["Bravo progression"]);
    expect(body.related.swapFor.map((r) => r.name)).toEqual([
      "Alpha swap",
      "Charlie swap",
      "Leg press",
    ]);
    expect(JSON.stringify(body)).not.toContain("Priya private swap");
    expect(JSON.stringify(body)).not.toContain("Archived progression");
  });

  it("uses one query per table however many related exercises there are", async () => {
    const counter = installRoundTripCounter(handle);
    const run = async (id: string) => {
      const headers = await loginHeaders(DEMO_TRAINER, "trainer", env);
      counter.reset();
      const res = await app.request(`/libraries/exercises/${id}`, { headers }, env);
      expect(res.status).toBe(200);
      return [...counter.trips];
    };
    const bare = await run(await createOwn(DEMO_TRAINER, "Bare own"));
    const rich = await run(prepareGlobalSquat());
    const count = (trips: typeof rich, table: string) =>
      trips.filter((t) => t.sql.some((s) => s.includes(table))).length;
    expect(count(rich, "exercise_library_instructions"), describeTrips(rich)).toBe(1);
    expect(count(rich, "exercise_library_relations"), describeTrips(rich)).toBe(1);
    expect(count(rich, "exercise_library_media"), describeTrips(rich)).toBe(1);
    expect(rich.length, describeTrips(rich)).toBe(bare.length);
  });
});
