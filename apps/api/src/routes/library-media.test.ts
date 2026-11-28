import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride } from "../db/client.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import {
  DEMO_TRAINEE,
  DEMO_TRAINER,
  describeTrips,
  installRoundTripCounter,
  loginHeaders,
  queryCountTestEnv,
} from "../test-support/query-count.js";
import { signedExerciseMediaPath } from "./library-media.js";
import type { Env } from "../types.js";

type MediaItem = {
  id: string;
  frame: string | null;
  author: string | null;
  licence: string;
  licenceUrl: string | null;
  attribution: string;
  url: string;
};
type ExerciseItem = {
  id: string;
  name: string;
  media?: MediaItem[];
  thumbnailMediaId?: string | null;
  thumbnailUrl?: string | null;
};

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe("library exercise drawings (Z14-48)", () => {
  let handle: MemoryDbHandle;
  let env: Env;
  const referenceInstant = new Date().toISOString();

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

  const seededMedia = () => {
    const row = handle.sqlite.exec(
      `SELECT m.id, m.storage_key, m.exercise_library_item_id
         FROM exercise_library_media m
         JOIN exercise_library_items i ON i.id = m.exercise_library_item_id
        WHERE i.status = 'active' AND i.ownership = 'global' AND m.kind = 'illustration'
        ORDER BY m.exercise_library_item_id, m.sort_order LIMIT 1`,
    )[0]!.values[0]!;
    return {
      id: String(row[0]),
      storageKey: String(row[1]),
      exerciseId: String(row[2]),
    };
  };

  async function putDrawing(storageKey: string, contentType = "image/png") {
    await env.MEDIA!.put(storageKey, PNG_BYTES, { httpMetadata: { contentType } });
  }

  describe("GET /library/exercise-media/:mediaId", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const { id } = seededMedia();
      const res = await app.request(`/library/exercise-media/${id}`, {}, env);
      expect(res.status).toBe(401);
    });

    it("rejects a forged or foreign signature", async () => {
      const { id, storageKey } = seededMedia();
      await putDrawing(storageKey);
      const signed = await signedExerciseMediaPath(env, id);
      const forged = signed.replace(/sig=.*/, "sig=deadbeef");
      expect((await app.request(forged, {}, env)).status).toBe(401);
      // A valid signature for another media id does not open this one.
      const otherId = "00000000-0000-4000-8000-000000000001";
      const other = await signedExerciseMediaPath(env, otherId);
      const query = other.slice(other.indexOf("?"));
      expect((await app.request(`/library/exercise-media/${id}${query}`, {}, env)).status).toBe(401);
    });

    it("returns the bytes with content type and cache headers to a trainer and a trainee", async () => {
      const { id, storageKey } = seededMedia();
      await putDrawing(storageKey);
      for (const [identifier, role] of [
        [DEMO_TRAINER, "trainer"],
        [DEMO_TRAINEE, "trainee"],
      ] as const) {
        const headers = await loginHeaders(identifier, role, env);
        const res = await app.request(`/library/exercise-media/${id}`, { headers }, env);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("image/png");
        expect(res.headers.get("cache-control")).toBe("private, max-age=86400, immutable");
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES);
      }
    });

    it("returns the bytes for a signed path with no session (img tag)", async () => {
      const { id, storageKey } = seededMedia();
      await putDrawing(storageKey);
      const res = await app.request(await signedExerciseMediaPath(env, id), {}, env);
      expect(res.status).toBe(200);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES);
    });

    it("404 LIBRARY_MEDIA_NOT_FOUND for an unknown id", async () => {
      const headers = await loginHeaders(DEMO_TRAINER, "trainer", env);
      const res = await app.request(
        "/library/exercise-media/00000000-0000-4000-8000-0000000000ff",
        { headers },
        env,
      );
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("LIBRARY_MEDIA_NOT_FOUND");
      expect(body.error.message).toBe("Drawing not found.");
    });

    it("404 with the same code (static text, no key) when the object is missing from R2", async () => {
      const { id, storageKey } = seededMedia();
      const headers = await loginHeaders(DEMO_TRAINER, "trainer", env);
      const res = await app.request(`/library/exercise-media/${id}`, { headers }, env);
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(JSON.parse(text).error.code).toBe("LIBRARY_MEDIA_NOT_FOUND");
      expect(text).not.toContain(storageKey);
      expect(text).not.toContain("exercises/");
    });

    it("applies MEDIA_PREFIX only at the R2 call", async () => {
      const { id, storageKey } = seededMedia();
      env = { ...env, MEDIA: createMemoryR2Bucket(), MEDIA_PREFIX: "staging/" } as Env;
      await env.MEDIA!.put(`staging/${storageKey}`, PNG_BYTES, {
        httpMetadata: { contentType: "image/png" },
      });
      const headers = await loginHeaders(DEMO_TRAINER, "trainer", env);
      const res = await app.request(`/library/exercise-media/${id}`, { headers }, env);
      expect(res.status).toBe(200);
    });
  });

  describe("exercise library payload", () => {
    it("lists media in sort order with credits and no storage keys", async () => {
      const { exerciseId } = seededMedia();
      const headers = await loginHeaders(DEMO_TRAINER, "trainer", env);
      const res = await app.request("/libraries/exercises?limit=100", { headers }, env);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain("exercises/");
      expect(text).not.toContain("storage");
      const items = (JSON.parse(text) as { data: { items: ExerciseItem[] } }).data.items;
      expect(items.every((item) => Array.isArray(item.media))).toBe(true);

      const expected = handle.sqlite.exec(
        `SELECT id FROM exercise_library_media WHERE exercise_library_item_id = '${exerciseId}'
          ORDER BY sort_order, id`,
      )[0]!.values.map((v) => String(v[0]));
      const item = items.find((candidate) => candidate.id === exerciseId);
      if (item) {
        expect(item.media!.map((m) => m.id)).toEqual(expected);
        expect(item.thumbnailMediaId).toBe(expected[0]);
        expect(item.thumbnailUrl).toBe(item.media![0]!.url);
        for (const m of item.media!) {
          expect(m.licence).toBeTruthy();
          expect(m.attribution).toBeTruthy();
          expect(m.url).toMatch(/^\/library\/exercise-media\/[0-9a-f-]{36}\?exp=\d+&sig=[0-9a-f]+$/);
        }
      }
      const withDrawing = items.filter((candidate) => (candidate.media ?? []).length > 0);
      expect(withDrawing.length).toBeGreaterThan(0);
      const first = withDrawing[0]!;
      expect(first.media![0]).toMatchObject({
        licence: expect.any(String),
        attribution: expect.any(String),
      });
    });

    it("filters to one exercise and its signed thumbnail loads the drawing", async () => {
      const { exerciseId, storageKey } = seededMedia();
      await putDrawing(storageKey);
      const headers = await loginHeaders(DEMO_TRAINER, "trainer", env);
      const name = handle.sqlite.exec(
        `SELECT name FROM exercise_library_items WHERE id = '${exerciseId}'`,
      )[0]!.values[0]![0] as string;
      const res = await app.request(
        `/libraries/exercises?q=${encodeURIComponent(name)}`,
        { headers },
        env,
      );
      const items = ((await res.json()) as { data: { items: ExerciseItem[] } }).data.items;
      const item = items.find((candidate) => candidate.id === exerciseId)!;
      expect(item.thumbnailUrl).toBeTruthy();
      const image = await app.request(item.thumbnailUrl!, {}, env);
      expect(image.status).toBe(200);
    });

    it("sends empty media for an exercise with no drawing", async () => {
      const headers = await loginHeaders(DEMO_TRAINER, "trainer", env);
      const created = await app.request(
        "/libraries/exercises",
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Sled drag (own)",
            instructions: null,
            primaryMuscles: ["quads"],
            secondaryMuscles: [],
            equipment: ["sled"],
            difficulty: "beginner",
          }),
        },
        env,
      );
      expect(created.status).toBe(201);
      const body = (await created.json()) as { data: ExerciseItem };
      expect(body.data.media).toEqual([]);
      expect(body.data.thumbnailMediaId).toBeNull();
      expect(body.data.thumbnailUrl).toBeNull();
    });

    it("adds at most one query for a page of 50 and none per exercise", async () => {
      const counter = installRoundTripCounter(handle);
      const headers = await loginHeaders(DEMO_TRAINER, "trainer", env);
      const run = async (limit: number) => {
        counter.reset();
        const res = await app.request(`/libraries/exercises?limit=${limit}`, { headers }, env);
        expect(res.status).toBe(200);
        return [...counter.trips];
      };
      const one = await run(1);
      const fifty = await run(50);
      const mediaQueries = (trips: typeof one) =>
        trips.filter((trip) => trip.sql.some((s) => s.includes("exercise_library_media"))).length;
      expect(mediaQueries(fifty), describeTrips(fifty)).toBe(1);
      expect(fifty.length, describeTrips(fifty)).toBe(one.length);
    });
  });
});
