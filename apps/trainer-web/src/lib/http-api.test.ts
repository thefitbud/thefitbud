import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("./session", () => ({
  getStoredAccessToken: () => "test-token",
}));

vi.mock("./api", () => ({
  resolveApiUrl: (path: string) => `http://api.test${path}`,
}));

describe("http-api envelope unwrap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("unwraps { data } before schema parse for templates", async () => {
    const payload = {
      data: {
        items: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            ownership: "trainer",
            trainerUserId: "22222222-2222-4222-8222-222222222222",
            title: "Demo strength block",
            templateType: "workout",
            recordVersion: 0,
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z",
          },
        ],
        nextCursor: null,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      })),
    );

    const { listPlanTemplatesExtended } = await import("./http-api.js");
    const result = await listPlanTemplatesExtended();
    expect(result.items[0]?.title).toBe("Demo strength block");
  });
});
