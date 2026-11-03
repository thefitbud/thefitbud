import { OTP_FINISH_FAILED_COPY, OTP_INVALID_COPY, verifyCodeError } from "./verifyCodeError";

type VerifyResult = { purpose: string };

export type CodeVerifyOutcome =
  | { kind: "ignored" }
  | { kind: "signed-in" }
  | { kind: "error"; message: string };

/**
 * Verify-code controller. The in-flight flag is a plain boolean set
 * synchronously before the request, so two taps in the same frame cannot both
 * pass (React state has not re-rendered yet). A verified result is kept in
 * memory when finishing sign-in fails, so a retry never re-sends the
 * already-consumed code.
 */
export function createCodeVerifier<R extends VerifyResult>(deps: {
  verify: (code: string) => Promise<R>;
  finish: (result: R) => Promise<void>;
}) {
  let inFlight = false;
  let kept: R | null = null;

  return {
    get busy() {
      return inFlight;
    },
    get hasKept() {
      return kept !== null;
    },
    discardKept() {
      kept = null;
    },
    async submit(code: string): Promise<CodeVerifyOutcome> {
      if (inFlight) return { kind: "ignored" };
      inFlight = true;
      try {
        let result = kept;
        if (!result) {
          try {
            result = await deps.verify(code);
          } catch (err) {
            return { kind: "error", message: verifyCodeError(err) };
          }
          if (result.purpose !== "login") {
            return { kind: "error", message: OTP_INVALID_COPY };
          }
        }
        try {
          await deps.finish(result);
        } catch {
          kept = result;
          return { kind: "error", message: OTP_FINISH_FAILED_COPY };
        }
        kept = null;
        return { kind: "signed-in" };
      } finally {
        inFlight = false;
      }
    },
  };
}
