import { describe, expect, it } from "vitest";

/**
 * Models the CheckinScreen draft save mutex: await in-flight, then re-read etag.
 * Prevents CHECKIN_VERSION_CONFLICT when blur + debounce overlap.
 */
async function serializedDraftSaves(
  push: (
    etag: number,
  ) => Promise<{ serverVersion: number } | { conflict: true }>,
  initialEtag: number,
  saveCount: number,
): Promise<{ finalEtag: number; conflicts: number }> {
  let etag = initialEtag;
  let inFlight: Promise<void> | null = null;
  let conflicts = 0;

  async function saveDraft() {
    if (inFlight) await inFlight;
    const expected = etag;
    const run = (async () => {
      let result = await push(expected);
      if ("conflict" in result) {
        conflicts += 1;
        result = await push(etag);
        if ("conflict" in result) return;
      }
      etag = result.serverVersion;
    })();
    inFlight = run;
    try {
      await run;
    } finally {
      if (inFlight === run) inFlight = null;
    }
  }

  await Promise.all(Array.from({ length: saveCount }, () => saveDraft()));
  return { finalEtag: etag, conflicts };
}

describe("checkin draft etag sequencing", () => {
  it("overlapping saves do not keep a stale expectedVersion", async () => {
    let serverVersion = 0;
    const push = async (etag: number) => {
      if (etag !== serverVersion) return { conflict: true as const };
      serverVersion += 1;
      return { serverVersion };
    };
    const { finalEtag, conflicts } = await serializedDraftSaves(push, 0, 3);
    expect(finalEtag).toBe(3);
    expect(serverVersion).toBe(3);
    expect(conflicts).toBeLessThan(3);
  });
});
