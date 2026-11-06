/**
 * Meals (QT6): today's assignments, the compliance summary, and one logged-meal round
 * trip as QA Aarav (D-QA1-7: the nightly run may log meals on the QA accounts; the reset
 * restores them).
 *
 * The write picks a meal that can honestly be confirmed: not logged yet, not locked and
 * not requiring a photo. If another suite already used them all, the round trip skips
 * with that reason rather than failing on state it does not own.
 */
import {
  mealAssignmentListResponseSchema,
  mealAssignmentSchema,
  mealComplianceSchema,
  mealComplianceSummaryResponseSchema,
  type MealAssignment,
} from "@fitbud/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { todaysExpectations } from "./expectations.js";
import {
  dataOf,
  errorOf,
  getData,
  localToday,
  newIdempotencyKey,
  relationshipIdOf,
  run,
  send,
  stable,
} from "./helpers.js";
import { sessionFor, smokeHttp } from "./run-context.js";

const http = smokeHttp();
const rid = relationshipIdOf("ontrack");
const dayLogsSchema = z.object({ logs: z.object({ meals: z.number().int() }) });

describe("meal assignments", () => {
  it("today's meals parse, match the seed, and are the same for the trainer", async (t) => {
    const trainee = sessionFor(t, "ontrack");
    const trainer = sessionFor(t, "trainer");
    const today = await localToday(http, trainee);
    const path = `/meals/relationships/${rid}/assignments?fromDate=${today}&toDate=${today}`;
    const asTrainee = await getData(http, trainee, path, mealAssignmentListResponseSchema);
    expect(asTrainee.items.length).toBeGreaterThanOrEqual(stable.guarantees.mealAssignmentsTodayMin);
    for (const item of asTrainee.items) expect(item.localDate).toBe(today);

    const expected = todaysExpectations(run, "ontrack", today);
    if (expected) {
      expect(asTrainee.items.map((item) => item.mealName).sort()).toEqual([...expected.mealNames].sort());
    }

    // Trainer and trainee surfaces show the same coaching state.
    const asTrainer = await getData(http, trainer, path, mealAssignmentListResponseSchema);
    expect(asTrainer.items.map((item) => item.id).sort()).toEqual(asTrainee.items.map((item) => item.id).sort());
  });

  it("the compliance summary parses", async (t) => {
    const trainee = sessionFor(t, "ontrack");
    const today = await localToday(http, trainee);
    const summary = await getData(
      http,
      trainee,
      `/meals/relationships/${rid}/compliance?fromDate=${today}&toDate=${today}`,
      mealComplianceSummaryResponseSchema,
    );
    expect(summary.items.length).toBeGreaterThanOrEqual(stable.guarantees.mealAssignmentsTodayMin);
  });
});

describe("logging a planned meal", () => {
  it("confirm is idempotent, shows in the day and the trainer's view, and cannot be logged twice", async (t) => {
    const trainee = sessionFor(t, "ontrack");
    const trainer = sessionFor(t, "trainer");
    const today = await localToday(http, trainee);
    const listPath = `/meals/relationships/${rid}/assignments?fromDate=${today}&toDate=${today}`;
    const before = await getData(http, trainee, listPath, mealAssignmentListResponseSchema);

    const candidates = before.items.filter(
      (item: MealAssignment) =>
        item.compliance === null &&
        !item.loggingLocked &&
        !item.photoRequired &&
        item.scheduleStatus === "scheduled",
    );
    const target = candidates.at(-1);
    if (!target) {
      t.skip("No unlogged, unlocked, photo-free meal is left today for QA Aarav; the nightly reset restores them.");
    }
    const dayBefore = await getData(http, trainee, `/me/day/${today}`, dayLogsSchema);

    const key = newIdempotencyKey();
    const confirmPath = `/meals/assignments/${target!.id}/confirm`;
    const first = dataOf(
      await send(http, trainee, "POST", confirmPath, { body: {}, idempotencyKey: key }),
      mealComplianceSchema,
    );
    expect(first.assignmentId).toBe(target!.id);
    expect(first.outcome).toBe("confirmed");

    // The same key and request replays the stored result: same record, not a second log.
    const replay = dataOf(
      await send(http, trainee, "POST", confirmPath, { body: {}, idempotencyKey: key }),
      mealComplianceSchema,
    );
    expect(replay.id).toBe(first.id);

    // It shows in the trainee's day, and the trainer sees the same state.
    const dayAfter = await getData(http, trainee, `/me/day/${today}`, dayLogsSchema);
    expect(dayAfter.logs.meals).toBeGreaterThanOrEqual(dayBefore.logs.meals + 1);
    const seenByTrainer = await getData(http, trainer, `/meals/assignments/${target!.id}`, mealAssignmentSchema);
    expect(seenByTrainer.compliance?.id).toBe(first.id);

    // A new key cannot log the same meal again.
    const again = await send(http, trainee, "POST", confirmPath, {
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
    expect(errorOf(again)).toEqual({ status: 409, code: "COMPLIANCE_ALREADY_RECORDED" });
  });
});
