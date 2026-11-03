/**
 * The trainer's read endpoints (QT6), as QA Rahul. All read-only. Exceptions are only
 * ever listed here: resolving one is the trainer's own act and belongs to the UI suites
 * (no auto-resolve).
 *
 * The last block is the ownership boundary, and it is the reason the QA seed holds a
 * second trainer (CU11). It used to ask for `00000000-0000-4000-8000-000000000000`,
 * which proves only that the API 404s for an id belonging to nobody: that assertion
 * would have passed with every one of another trainer's clients on the response. It
 * now reads the *real* ids of each trainer's clients as the other trainer, in both
 * directions, and also checks that the refusal carries the same status and code as the
 * refusal for an id that exists for nobody — which is the property that keeps the API
 * from confirming that another trainer's record exists.
 */
import {
  activityFeedResponseSchema,
  attentionFeedResponseSchema,
  clientDirectoryListResponseSchema,
  clientWorkspaceSchema,
  exceptionDetailSchema,
  exceptionListResponseSchema,
  trainerCheckinInboxResponseSchema,
} from "@fitbud/contracts";
import { beforeAll, describe, expect, it, type TestContext } from "vitest";
import { readSmokeEnv } from "./env.js";
import type { AnyAccountKey } from "./expectations.js";
import { errorOf, getData, relationshipIdOf, send, stable } from "./helpers.js";
import { runContext, sessionFor, smokeHttp, type LiveSession } from "./run-context.js";
import { otpSignIn, passwordSignIn } from "./signin.js";

const http = smokeHttp();

/** An id no QA account owns, and that the seed never writes. */
const NOBODYS_RELATIONSHIP_ID = "00000000-0000-4000-8000-000000000000";

/** The code and status the API answers for a relationship the caller may not read. */
const NOT_OWNED = { status: 404, code: "RELATIONSHIP_NOT_FOUND" } as const;

function relationshipOf(key: AnyAccountKey): string {
  const id = stable.accounts[key].relationshipId;
  if (!id) throw new Error(`The QA expectations have no relationshipId for "${key}".`);
  return id;
}

/**
 * Trainer 2's session, signed in by this suite rather than by `global-setup.ts`.
 *
 * `run-context.ts` derives the role header from the account key (`key === "trainer"`),
 * so a second *trainer* key in `ACCOUNT_KEYS` would be sent as a trainee and refused
 * by `requireRole`. That file is outside this task's `files_owned`, so trainer 2 signs
 * in here, through the same endpoints (`signin.ts`) and the same environment contract
 * (`env.ts`, which is the one place that validates the OTP's shape and from which no
 * secret is ever logged).
 *
 * The outcome is *recorded*, never thrown from the hook: a hook that throws fails every
 * test in the file, and the five trainer-1 cases above have nothing to do with trainer 2.
 * On a staging database where this seed has not been applied yet, `qa+trainer2@` does
 * not exist, and the run must still report honestly on trainer 1's endpoints. This is
 * the same shape as `global-setup.ts`'s `signInAccount`: a sign-in that was attempted
 * and failed is an error on the tests that need the account, and nothing else.
 */
type SecondTrainerOutcome =
  | { status: "ok"; session: LiveSession }
  /** Not configured on this target (no secret for it). */
  | { status: "skip"; reason: string }
  /** Configured but sign-in failed. A failure of trainer 2's own tests, never a skip. */
  | { status: "error"; message: string };

let secondTrainerOutcome: SecondTrainerOutcome = {
  status: "skip",
  reason: "Trainer 2 was not signed in on this target.",
};

beforeAll(async () => {
  const ctx = runContext();
  const account = stable.accounts.trainer2;
  try {
    // Values come from the environment contract, not from `process.env` here, so the
    // six-digit OTP check applies to this sign-in too. Reading it inside the `try`
    // keeps even a malformed variable from failing trainer 1's tests; `global-setup.ts`
    // reads the same contract first, so the whole run would already have stopped.
    const env = readSmokeEnv(process.env);
    if (ctx.otp && env.otpCode !== undefined) {
      const session = await otpSignIn(http, account.email, env.otpCode);
      secondTrainerOutcome = {
        status: "ok",
        session: { token: session.token, userId: session.userId, role: "trainer" },
      };
      return;
    }
    if (ctx.password && env.password !== undefined) {
      const session = await passwordSignIn(http, account.email, env.password);
      secondTrainerOutcome = {
        status: "ok",
        session: { token: session.token, userId: session.userId, role: "trainer" },
      };
      return;
    }
    secondTrainerOutcome = {
      status: "skip",
      reason: "No sign-in secret for trainer 2 on this target.",
    };
  } catch (error) {
    // SignInError messages carry the step, status and code only, never a secret.
    secondTrainerOutcome = {
      status: "error",
      message: error instanceof Error ? error.message : "Sign-in failed.",
    };
  }
});

/**
 * Trainer 2's session. Skips the calling test when no secret configured it, and throws
 * on a sign-in that was attempted and failed — so that shows up as a failure, here and
 * nowhere else in the file.
 */
function secondTrainer(t: TestContext): LiveSession {
  if (secondTrainerOutcome.status === "skip") t.skip(secondTrainerOutcome.reason);
  if (secondTrainerOutcome.status === "error") {
    throw new Error(`trainer2: ${secondTrainerOutcome.message}`);
  }
  return secondTrainerOutcome.session;
}

describe("trainer endpoints", () => {
  it("GET /clients lists both QA trainees with their relationship ids", async (t) => {
    const trainer = sessionFor(t, "trainer");
    const clients = await getData(http, trainer, "/clients", clientDirectoryListResponseSchema);
    for (const key of ["ontrack", "slipping"] as const) {
      const row = clients.items.find((item) => item.relationshipId === relationshipIdOf(key));
      expect(row, `${key} is on the trainer's client list`).toBeDefined();
      expect(row!.traineeDisplayName).toBe(stable.accounts[key].displayName);
    }
  });

  it.for(["ontrack", "slipping"] as const)("GET /workspaces/relationships/:id gives %s's client status", async (key, t) => {
    const trainer = sessionFor(t, "trainer");
    const workspace = await getData(
      http,
      trainer,
      `/workspaces/relationships/${relationshipIdOf(key)}`,
      clientWorkspaceSchema,
    );
    expect(workspace.history.relationshipId).toBe(relationshipIdOf(key));
  });

  it("GET /exceptions/attention parses, and every item belongs to a QA client", async (t) => {
    const trainer = sessionFor(t, "trainer");
    const feed = await getData(http, trainer, "/exceptions/attention", attentionFeedResponseSchema);
    const mine = new Set([relationshipIdOf("ontrack"), relationshipIdOf("slipping")]);
    for (const item of feed.items) expect(mine.has(item.exception.coachingRelationshipId)).toBe(true);
  });

  it("QA Rohan has the seeded exceptions, each with its source signal", async (t) => {
    const trainer = sessionFor(t, "trainer");
    const rid = relationshipIdOf("slipping");
    // Other suites may resolve some during the night, so count every status.
    let total = 0;
    let firstId: string | undefined;
    for (const status of ["detected", "active", "acknowledged", "resolved"]) {
      const page = await getData(
        http,
        trainer,
        `/exceptions/relationships/${rid}?status=${status}`,
        exceptionListResponseSchema,
      );
      total += page.items.length;
      firstId ??= page.items[0]?.id;
      for (const exception of page.items) {
        expect(exception.sourceEntityId).toBeTruthy();
        expect(exception.sourceEntityType).toBeTruthy();
      }
    }
    expect(total).toBeGreaterThanOrEqual(stable.guarantees.openExceptionsSlippingMin);
    expect(firstId).toBeDefined();
    const detail = await getData(http, trainer, `/exceptions/${firstId!}`, exceptionDetailSchema);
    expect(detail.id).toBe(firstId);
  });

  it("GET /checkins/inbox parses", async (t) => {
    const trainer = sessionFor(t, "trainer");
    const inbox = await getData(http, trainer, "/checkins/inbox", trainerCheckinInboxResponseSchema);
    const mine = new Set([relationshipIdOf("ontrack"), relationshipIdOf("slipping")]);
    for (const item of inbox.items) expect(mine.has(item.coachingRelationshipId)).toBe(true);
  });

  it("GET /activity/feed parses", async (t) => {
    const trainer = sessionFor(t, "trainer");
    const feed = await getData(http, trainer, "/activity/feed", activityFeedResponseSchema);
    expect(feed.events.length).toBeGreaterThan(0);
  });

  it("the client list holds only this trainer's own clients", async (t) => {
    const trainer = sessionFor(t, "trainer");
    const clients = await getData(http, trainer, "/clients", clientDirectoryListResponseSchema);
    const ids = clients.items.map((item) => item.relationshipId);
    expect(ids).not.toContain(relationshipOf("client2"));
    const names = clients.items.map((item) => item.traineeDisplayName);
    expect(names).not.toContain(stable.accounts.client2.displayName);
  });
});

describe("one trainer cannot reach another trainer's client", () => {
  it("trainer 1 is refused trainer 2's real relationship", async (t) => {
    const trainer = sessionFor(t, "trainer");
    const response = await send(
      http,
      trainer,
      "GET",
      `/workspaces/relationships/${relationshipOf("client2")}`,
    );
    expect(errorOf(response)).toEqual(NOT_OWNED);
  });

  it.for(["ontrack", "slipping"] as const)(
    "trainer 2 is refused trainer 1's real relationship with %s",
    async (key, t) => {
      const trainer2 = secondTrainer(t);
      const response = await send(
        http,
        trainer2,
        "GET",
        `/workspaces/relationships/${relationshipIdOf(key)}`,
      );
      expect(errorOf(response)).toEqual(NOT_OWNED);
    },
  );

  it("trainer 2 reads their own client, so the refusals above are not a dead session", async (t) => {
    const trainer2 = secondTrainer(t);
    const workspace = await getData(
      http,
      trainer2,
      `/workspaces/relationships/${relationshipOf("client2")}`,
      clientWorkspaceSchema,
    );
    expect(workspace.history.relationshipId).toBe(relationshipOf("client2"));
  });

  // `errorOf` (`http.ts`, outside this task's files_owned) reads the status and the
  // code and not the message, so this pins status and code. That is the pair a client
  // branches on; the messages are equal today too, but this test does not guard it.
  it("the refusal carries the same status and code as for an id that exists for nobody", async (t) => {
    const trainer = sessionFor(t, "trainer");
    const nobodys = await send(
      http,
      trainer,
      "GET",
      `/workspaces/relationships/${NOBODYS_RELATIONSHIP_ID}`,
    );
    const anothers = await send(
      http,
      trainer,
      "GET",
      `/workspaces/relationships/${relationshipOf("client2")}`,
    );
    // Same status and same code: the API never confirms that a relationship it will
    // not show exists. A distinct "forbidden" here would leak exactly that — which is
    // what this case is here to catch.
    expect(errorOf(nobodys)).toEqual(NOT_OWNED);
    expect(errorOf(anothers)).toEqual(errorOf(nobodys));
  });

  it("neither trainer's exception list reaches the other's client", async (t) => {
    const trainer2 = secondTrainer(t);
    const response = await send(
      http,
      trainer2,
      "GET",
      `/exceptions/relationships/${relationshipIdOf("slipping")}?status=active`,
    );
    expect(errorOf(response)).toEqual(NOT_OWNED);
  });

  it("trainer 2's attention feed and inbox hold only their own client", async (t) => {
    const trainer2 = secondTrainer(t);
    const mine = relationshipOf("client2");
    const feed = await getData(http, trainer2, "/exceptions/attention", attentionFeedResponseSchema);
    for (const item of feed.items) {
      expect(item.exception.coachingRelationshipId).toBe(mine);
    }
    const inbox = await getData(http, trainer2, "/checkins/inbox", trainerCheckinInboxResponseSchema);
    for (const item of inbox.items) {
      expect(item.coachingRelationshipId).toBe(mine);
    }
  });
});
