import { describe, expect, it } from "vitest";
import { isD1ImportBusyError, isD1ImportBusyText } from "./d1-busy";
import { markD1ImportBusy, sentryOptions } from "./sentry";
import type { Env } from "../types";

const BUSY = "D1_ERROR: Currently processing a long-running import. Cannot start another import until that completes or times out.";

describe("isD1ImportBusyError", () => {
  it("matches the D1 error itself and when wrapped as a cause (Drizzle)", () => {
    expect(isD1ImportBusyError(new Error(BUSY))).toBe(true);
    expect(isD1ImportBusyError(new Error("Failed query: select 1", { cause: new Error(BUSY) }))).toBe(true);
  });

  it("does not match other D1 errors, non-errors or a cause cycle", () => {
    expect(isD1ImportBusyError(new Error("D1_ERROR: UNIQUE constraint failed: users.email"))).toBe(false);
    expect(isD1ImportBusyError(undefined)).toBe(false);
    expect(isD1ImportBusyError("Currently processing")).toBe(false);
    const loop = new Error("a") as Error & { cause?: unknown };
    loop.cause = loop;
    expect(isD1ImportBusyError(loop)).toBe(false);
  });

  it("isD1ImportBusyText only accepts strings with the message", () => {
    expect(isD1ImportBusyText(`Error: ${BUSY}`)).toBe(true);
    expect(isD1ImportBusyText(42)).toBe(false);
  });
});

describe("markD1ImportBusy (Sentry)", () => {
  it("files every import-busy event as one warning issue", () => {
    const event = markD1ImportBusy({ exception: { values: [{ type: "Error", value: "Failed query" }, { type: "Error", value: BUSY }] } }) as {
      level?: string;
      fingerprint?: string[];
    };
    expect(event.level).toBe("warning");
    expect(event.fingerprint).toEqual(["d1-import-busy"]);
  });

  it("leaves other events alone", () => {
    const event = markD1ImportBusy({ exception: { values: [{ type: "TypeError", value: "x is undefined" }] } }) as {
      level?: string;
      fingerprint?: string[];
    };
    expect(event.level).toBeUndefined();
    expect(event.fingerprint).toBeUndefined();
  });

  it("runs in beforeSend", () => {
    const options = sentryOptions({ SENTRY_DSN: "https://k@o0.ingest.sentry.io/0", SENTRY_ENVIRONMENT: "staging" } as Env);
    const out = options.beforeSend!({ type: undefined, exception: { values: [{ type: "Error", value: BUSY }] } } as never, {}) as {
      level?: string;
      fingerprint?: string[];
    };
    expect(out.level).toBe("warning");
    expect(out.fingerprint).toEqual(["d1-import-busy"]);
  });
});
