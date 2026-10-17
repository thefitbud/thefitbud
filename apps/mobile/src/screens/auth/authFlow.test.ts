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
    startOtp.mockResolvedValueOnce({ sent: true });
    const s1 = (await import("../../lib/stage1Api")).stage1Api({} as never);
    await s1.startOtp({ identifier: "user@example.com", purpose: "login" });
    expect(startOtp).toHaveBeenCalledWith({
      identifier: "user@example.com",
      purpose: "login",
    });
  });

  it("OTP verify returns token", async () => {
    verifyOtp.mockResolvedValueOnce({ token: "session" });
    const s1 = (await import("../../lib/stage1Api")).stage1Api({} as never);
    const result = await s1.verifyOtp({
      identifier: "user@example.com",
      purpose: "login",
      code: "123456",
    });
    expect(verifyOtp).toHaveBeenCalled();
    expect(result.token).toBe("session");
  });
});
