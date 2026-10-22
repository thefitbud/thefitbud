import { describe, expect, it } from "vitest";
import { AuthFlowError } from "./auth-flow";

describe("AuthFlowError", () => {
  it("carries a stable code for UI mapping", () => {
    const err = new AuthFlowError("network", "offline");
    expect(err.code).toBe("network");
    expect(err.message).toBe("offline");
  });
});
