import { describe, expect, it } from "vitest";
import { chunkIds, IN_ARRAY_CHUNK_SIZE, selectInChunks } from "./in-array-chunks.js";

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `id-${i}`);
}

describe("chunkIds", () => {
  it.each([
    [0, []],
    [1, [1]],
    [90, [90]],
    [91, [90, 1]],
    [250, [90, 90, 70]],
  ])("splits %i ids into chunks of %j", (count, sizes) => {
    const chunks = chunkIds(ids(count));
    expect(chunks.map((chunk) => chunk.length)).toEqual(sizes);
    expect(chunks.flat()).toEqual(ids(count));
    expect(chunks.every((chunk) => chunk.length <= IN_ARRAY_CHUNK_SIZE)).toBe(true);
  });

  it("drops duplicate ids, keeping first-seen order", () => {
    expect(chunkIds(["b", "a", "b", "c", "a"])).toEqual([["b", "a", "c"]]);
  });

  it("rejects a non-positive chunk size", () => {
    expect(() => chunkIds(["a"], 0)).toThrow();
  });
});

describe("selectInChunks", () => {
  it("issues no query for no ids", async () => {
    let calls = 0;
    await expect(
      selectInChunks([], async () => {
        calls += 1;
        return [];
      }),
    ).resolves.toEqual([]);
    expect(calls).toBe(0);
  });

  it.each([
    [1, 1],
    [90, 1],
    [91, 2],
    [250, 3],
  ])("queries %i ids in %i chunks and merges rows in order", async (count, expectedCalls) => {
    const seen: number[] = [];
    const rows = await selectInChunks(ids(count), async (chunk) => {
      seen.push(chunk.length);
      return chunk.map((id) => ({ id }));
    });
    expect(seen).toHaveLength(expectedCalls);
    expect(seen.every((size) => size <= IN_ARRAY_CHUNK_SIZE)).toBe(true);
    expect(rows.map((row) => row.id)).toEqual(ids(count));
  });
});
