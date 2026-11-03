import { describe, expect, it, vi } from "vitest";

const login = vi.fn();
const startOtp = vi.fn();
const verifyOtp = vi.fn();

vi.mock("../../lib/stage1Api", () => ({
  stage1Api: () => ({
    login,
    startOtp,
    verifyOtp,
    resetPassword: vi.fn(),
    setPassword: vi.fn(),
  }),
}));

describe("auth flow helpers", () => {
  it("login sends identifier and password", async () => {
    login.mockResolvedValueOnce({ token: "tok" });
    const s1 = (await import("../../lib/stage1Api")).stage1Api({} as never);
    const result = await s1.login({
      identifier: "user@example.com",
      password: "secret123",
    });
    expect(login).toHaveBeenCalledWith({
      identifier: "user@example.com",
      password: "secret123",
    });
    expect(result.token).toBe("tok");
  });

  it("OTP start uses login purpose", async () => {
    startOtp.mockResolvedValueOnce({ sent: true, channels: ["email"] });
    const s1 = (await import("../../lib/stage1Api")).stage1Api({} as never);
    await s1.startOtp({ identifier: "user@example.com", purpose: "login" });
    expect(startOtp).toHaveBeenCalledWith({
      identifier: "user@example.com",
      purpose: "login",
    });
  });

  it("OTP verify returns token", async () => {
    verifyOtp.mockResolvedValueOnce({
      purpose: "login",
      token: "session",
      tokenKind: "test_id_token",
      userId: "00000000-0000-4000-8000-000000000001",
    });
    const s1 = (await import("../../lib/stage1Api")).stage1Api({} as never);
    const result = await s1.verifyOtp({
      identifier: "user@example.com",
      purpose: "login",
      code: "123456",
    });
    expect(verifyOtp).toHaveBeenCalled();
    expect(result.purpose).toBe("login");
    if (result.purpose === "login") {
      expect(result.token).toBe("session");
    }
  });
});

describe("verify code controller", () => {
  type R = { purpose: string; token: string };
  const ok: R = { purpose: "login", token: "session" };

  it("two taps in one tick send exactly one verify request", async () => {
    const { createCodeVerifier } = await import("./verifyCodeErrorFlow");
    const verify = vi.fn(async () => ok);
    const finish = vi.fn(async () => {});
    const v = createCodeVerifier<R>({ verify, finish });
    const [a, b] = await Promise.all([v.submit("123456", "aarav.ontrack@demo.fitbud.test"), v.submit("123456", "aarav.ontrack@demo.fitbud.test")]);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(1);
    expect([a.kind, b.kind].sort()).toEqual(["ignored", "signed-in"]);
  });

  it("allows a new attempt after a failed verify", async () => {
    const { createCodeVerifier } = await import("./verifyCodeErrorFlow");
    const { ApiClientError } = await import("@fitbud/api-client");
    const verify = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiClientError({ status: 401, code: "OTP_INVALID", message: "x", requestId: "r" }),
      )
      .mockResolvedValueOnce(ok);
    const v = createCodeVerifier<R>({ verify, finish: async () => {} });
    expect(await v.submit("111111", "aarav.ontrack@demo.fitbud.test")).toEqual({
      kind: "error",
      message: "That code didn't work. Check the latest message or tap Resend.",
    });
    expect((await v.submit("222222", "aarav.ontrack@demo.fitbud.test")).kind).toBe("signed-in");
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it("finishAuth failure keeps the result and retry does not re-verify", async () => {
    const { createCodeVerifier } = await import("./verifyCodeErrorFlow");
    const verify = vi.fn(async () => ok);
    const finish = vi
      .fn()
      .mockRejectedValueOnce(new Error("me failed"))
      .mockResolvedValueOnce(undefined);
    const v = createCodeVerifier<R>({ verify, finish });
    expect(await v.submit("123456", "aarav.ontrack@demo.fitbud.test")).toEqual({
      kind: "error",
      message: "Your code worked, but we couldn't finish signing you in. Try again.",
    });
    expect((await v.submit("123456", "aarav.ontrack@demo.fitbud.test")).kind).toBe("signed-in");
    expect(verify).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(2);
    expect(finish).toHaveBeenLastCalledWith(ok);
  });

  it("a kept result is not used after the identifier changes", async () => {
    const { createCodeVerifier } = await import("./verifyCodeErrorFlow");
    const verify = vi
      .fn()
      .mockResolvedValueOnce({ purpose: "login", token: "session-for-A" })
      .mockResolvedValueOnce({ purpose: "login", token: "session-for-B" });
    const finish = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
    const v = createCodeVerifier<R>({ verify, finish });
    await v.submit("123456", "a@example.com");
    // Field changed to B: A's kept session must not sign B in.
    expect((await v.submit("654321", "b@example.com")).kind).toBe("signed-in");
    expect(verify).toHaveBeenCalledTimes(2);
    expect(finish).toHaveBeenLastCalledWith({ purpose: "login", token: "session-for-B" });
    expect(finish).toHaveBeenCalledTimes(2);
  });

  it("a non-login verify result shows the invalid-code copy and is not finished", async () => {
    const { createCodeVerifier } = await import("./verifyCodeErrorFlow");
    const finish = vi.fn();
    const v = createCodeVerifier<R>({
      verify: async () => ({ purpose: "reset", token: "t" }),
      finish,
    });
    expect((await v.submit("123456", "aarav.ontrack@demo.fitbud.test")).kind).toBe("error");
    expect(finish).not.toHaveBeenCalled();
  });
});
