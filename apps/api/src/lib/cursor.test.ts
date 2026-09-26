import { describe, expect, it } from "vitest";
import { buildPage, decodeCursor, encodeCursor } from "../lib/cursor.js";
import { createTestIdToken, verifyFirebaseIdToken } from "../auth/firebase.js";

describe("cursor helpers", () => {
  it("round-trips opaque cursors", () => {
    const encoded = encodeCursor({ k: "2026-01-01T00:00:00.000Z", id: "abc" });
    expect(decodeCursor(encoded)).toEqual({
      k: "2026-01-01T00:00:00.000Z",
      id: "abc",
    });
  });

  it("builds nextCursor when more results exist", () => {
    const page = buildPage(
      [
        { id: "1", createdAt: "a" },
        { id: "2", createdAt: "b" },
        { id: "3", createdAt: "c" },
      ],
      2,
      (item) => item.createdAt,
    );
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeCursor(page.nextCursor!)).toEqual({ k: "b", id: "2" });
  });
});

describe("firebase test double", () => {
  it("accepts structured test tokens", async () => {
    const token = createTestIdToken("firebase-uid-1", "trainer@example.com");
    await expect(
      verifyFirebaseIdToken(token, {
        projectId: "fitbud-local",
        authMode: "test",
      }),
    ).resolves.toEqual({
      uid: "firebase-uid-1",
      email: "trainer@example.com",
    });
  });

  it("rejects production mode until wired", async () => {
    const token = createTestIdToken("firebase-uid-1");
    await expect(
      verifyFirebaseIdToken(token, {
        projectId: "fitbud-local",
        authMode: "firebase",
      }),
    ).resolves.toBeNull();
  });
});
