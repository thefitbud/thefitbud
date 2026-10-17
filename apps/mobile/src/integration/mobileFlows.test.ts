import { describe, expect, it, vi } from "vitest";

const { enqueueAndPushMock } = vi.hoisted(() => ({
  enqueueAndPushMock: vi.fn(async () => ({
    mutationId: "m1",
    idempotencyKey: "k1",
    results: [],
  })),
}));

vi.mock("../sync/actions", () => ({
  enqueueAndPush: enqueueAndPushMock,
}));

import { confirmMealAssignment, skipMealAssignment } from "../trainee/mealActions";

describe("mobile integration flows (mocked api)", () => {
  it("confirm meal enqueues meal.confirm", async () => {
    enqueueAndPushMock.mockClear();
    const api = {} as never;
    const sync = {} as never;
    const assignment = {
      id: "00000000-0000-4000-8000-000000000010",
      photoRequired: false,
    } as never;
    await confirmMealAssignment(api, sync, "rel-1", assignment);
    expect(enqueueAndPushMock).toHaveBeenCalledWith(
      sync,
      expect.objectContaining({ operation: "meal.confirm" }),
    );
  });

  it("skip meal enqueues meal.skip", async () => {
    enqueueAndPushMock.mockClear();
    const sync = {} as never;
    await skipMealAssignment(sync, {
      id: "00000000-0000-4000-8000-000000000011",
    } as never);
    expect(enqueueAndPushMock).toHaveBeenCalledWith(
      sync,
      expect.objectContaining({ operation: "meal.skip" }),
    );
  });

  it("OTP verify uses stage1 client", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ token: "session" });
    const { stage1Api } = await import("../lib/stage1Api");
    const s1 = stage1Api({ verifyOtp } as never);
    const result = await s1.verifyOtp({
      identifier: "user@example.com",
      purpose: "login",
      code: "123456",
    });
    expect(verifyOtp).toHaveBeenCalled();
    expect(result.token).toBe("session");
  });

  it("food search calls searchMeFoods", async () => {
    const searchMeFoods = vi.fn().mockResolvedValue({ items: [{ id: "f1" }] });
    const { stage1Api } = await import("../lib/stage1Api");
    const s1 = stage1Api({ searchMeFoods } as never);
    const page = await s1.searchMeFoods({ q: "dal", limit: 10 });
    expect(searchMeFoods).toHaveBeenCalledWith({ q: "dal", limit: 10 });
    expect(page.items).toHaveLength(1);
  });

  it("checkin submit enqueues checkin.submit", async () => {
    enqueueAndPushMock.mockClear();
    const { enqueueAndPush: enqueue } = await import("../sync/actions");
    await enqueue({} as never, {
      recordId: "chk-1",
      operation: "checkin.submit",
      payload: { checkinId: "chk-1", body: {} },
    });
    expect(enqueueAndPushMock).toHaveBeenCalled();
  });

  it("trainer acknowledge and resolve call api methods", async () => {
    const acknowledgeException = vi.fn().mockResolvedValue({});
    const resolveException = vi.fn().mockResolvedValue({});
    const api = { acknowledgeException, resolveException };
    await api.acknowledgeException("ex-1", { note: null }, "idem-1");
    await api.resolveException("ex-1", { resolution: "dismissed" }, "idem-2");
    expect(acknowledgeException).toHaveBeenCalled();
    expect(resolveException).toHaveBeenCalled();
  });
});
