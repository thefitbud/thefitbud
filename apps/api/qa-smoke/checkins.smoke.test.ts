/**
 * Check-ins (QT6): the form, a draft, a submit and the trainer's review, as one workflow
 * on QA Aarav (D-QA1-7).
 *
 * It deliberately does NOT use QA Rohan's seeded pending check-in: the Maestro and
 * Playwright suites (QT3, QT5) submit and review that one. This suite schedules its own
 * check-in for today on the on-track account, submits it, and has the trainer review it,
 * so the trainer's inbox returns to what it was. Nothing is auto-resolved: the review is
 * the trainer's own action.
 *
 * Each step is its own test and skips when an earlier step left it nothing to work on.
 */
import { missingRequiredCheckinAnswers } from "@fitbud/core";
import {
  checkinFormVersionSchema,
  checkinListResponseSchema,
  checkinReviewContextSchema,
  checkinSchema,
  scheduleCheckinResponseSchema,
  trainerCheckinInboxResponseSchema,
  type Checkin,
  type CheckinAnswers,
  type CheckinFieldDefinition,
} from "@fitbud/contracts";
import { describe, expect, it } from "vitest";
import {
  dataOf,
  errorOf,
  getData,
  localToday,
  newIdempotencyKey,
  relationshipIdOf,
  send,
} from "./helpers.js";
import { sessionFor, smokeHttp } from "./run-context.js";

const http = smokeHttp();
const rid = relationshipIdOf("ontrack");

type Answers = CheckinAnswers;

/** An answer for each required field, by type, so the pinned form is satisfied. */
function answersFor(fields: readonly CheckinFieldDefinition[]): Answers {
  const fieldAnswers: NonNullable<Answers["fieldAnswers"]> = {};
  for (const field of fields) {
    if (!field.required || ["wellbeing", "notes", "photo"].includes(field.id)) continue;
    switch (field.type) {
      case "short_text":
      case "long_text":
        fieldAnswers[field.id] = "QA smoke check";
        break;
      case "single_choice":
        fieldAnswers[field.id] = field.options[0]!.id;
        break;
      case "multiple_choice":
        fieldAnswers[field.id] = [field.options[0]!.id];
        break;
      case "yes_no":
        fieldAnswers[field.id] = true;
        break;
      case "number":
      case "measurement":
        fieldAnswers[field.id] = 70;
        break;
      case "scale_1_5":
        fieldAnswers[field.id] = 3;
        break;
      case "photo_intent":
        fieldAnswers[field.id] = { notedAt: new Date().toISOString() };
        break;
    }
  }
  return { wellbeing: "Steady and ready (QA smoke).", notes: null, fieldAnswers };
}

const state: { checkin?: Checkin; form?: { fields: CheckinFieldDefinition[] }; answers?: Answers } = {};

function open(t: { skip: (note?: string) => never }): Checkin {
  if (!state.checkin) t.skip("No open check-in to work on (see the first step).");
  return state.checkin!;
}

describe("check-in workflow on QA Aarav", () => {
  it("the trainer schedules today's check-in (idempotent) and it lists for the trainee", async (t) => {
    const trainer = sessionFor(t, "trainer");
    const trainee = sessionFor(t, "ontrack");
    const today = await localToday(http, trainee);
    const key = newIdempotencyKey();
    const body = { localDate: today };
    const first = dataOf(
      await send(http, trainer, "POST", `/checkins/relationships/${rid}/schedule`, { body, idempotencyKey: key }),
      scheduleCheckinResponseSchema,
    );
    const replay = dataOf(
      await send(http, trainer, "POST", `/checkins/relationships/${rid}/schedule`, { body, idempotencyKey: key }),
      scheduleCheckinResponseSchema,
    );
    expect(replay.checkin.id).toBe(first.checkin.id);
    expect(first.checkin.localDate).toBe(today);

    const list = await getData(http, trainee, `/checkins/relationships/${rid}`, checkinListResponseSchema);
    expect(list.items.map((c) => c.id)).toContain(first.checkin.id);

    if (first.checkin.recordStatus !== "draft") {
      t.skip("Today's check-in was already submitted by an earlier run; the nightly reset restores it.");
    }
    state.checkin = first.checkin;
  });

  it("the trainee reads the check-in and the form version it is pinned to", async (t) => {
    const checkin = open(t);
    const trainee = sessionFor(t, "ontrack");
    const read = await getData(http, trainee, `/checkins/${checkin.id}`, checkinSchema);
    expect(read.id).toBe(checkin.id);
    const form = await getData(http, trainee, `/checkins/${checkin.id}/form`, checkinFormVersionSchema);
    // Later template edits never move a pinned form.
    expect(form.id).toBe(checkin.checkinFormVersionId);
    state.form = form;
    state.answers = answersFor(form.fields);
    expect(missingRequiredCheckinAnswers(state.answers, form.fields)).toEqual([]);
  });

  it("a draft saves, and a stale version is refused with a conflict", async (t) => {
    const checkin = open(t);
    const trainee = sessionFor(t, "ontrack");
    const draft = dataOf(
      await send(http, trainee, "PUT", `/checkins/${checkin.id}/draft`, {
        body: { expectedVersion: checkin.recordVersion, answers: state.answers },
      }),
      checkinSchema,
    );
    expect(draft.recordStatus).toBe("draft");
    expect(draft.recordVersion).toBeGreaterThan(checkin.recordVersion);
    state.checkin = draft;

    const stale = await send(http, trainee, "PUT", `/checkins/${checkin.id}/draft`, {
      body: { expectedVersion: checkin.recordVersion, answers: state.answers },
    });
    expect(errorOf(stale)).toEqual({ status: 409, code: "CHECKIN_VERSION_CONFLICT" });
  });

  it("submit is idempotent and a second submit is refused", async (t) => {
    const checkin = open(t);
    const trainee = sessionFor(t, "ontrack");
    const key = newIdempotencyKey();
    const body = { expectedVersion: checkin.recordVersion, answers: state.answers };
    const submitted = dataOf(
      await send(http, trainee, "POST", `/checkins/${checkin.id}/submit`, { body, idempotencyKey: key }),
      checkinSchema,
    );
    expect(submitted.recordStatus).toBe("submitted");
    expect(submitted.submittedAt).not.toBeNull();

    const replay = dataOf(
      await send(http, trainee, "POST", `/checkins/${checkin.id}/submit`, { body, idempotencyKey: key }),
      checkinSchema,
    );
    expect(replay.recordVersion).toBe(submitted.recordVersion);

    const again = await send(http, trainee, "POST", `/checkins/${checkin.id}/submit`, {
      body: { ...body, expectedVersion: submitted.recordVersion },
      idempotencyKey: newIdempotencyKey(),
    });
    expect(errorOf(again)).toEqual({ status: 422, code: "CHECKIN_NOT_SUBMITTABLE" });
    state.checkin = submitted;
  });

  it("it reaches the trainer's inbox; only the trainer's review takes it out", async (t) => {
    const checkin = open(t);
    const trainer = sessionFor(t, "trainer");
    const inbox = () => getData(http, trainer, "/checkins/inbox", trainerCheckinInboxResponseSchema);

    expect((await inbox()).items.map((item) => item.checkin.id)).toContain(checkin.id);

    const context = await getData(http, trainer, `/checkins/${checkin.id}/review-context`, checkinReviewContextSchema);
    expect(context.pinnedForm.id).toBe(checkin.checkinFormVersionId);

    const reviewed = dataOf(
      await send(http, trainer, "POST", `/checkins/${checkin.id}/review`, {
        body: { outcome: "acknowledged", notes: null },
        idempotencyKey: newIdempotencyKey(),
      }),
      checkinSchema,
    );
    expect(reviewed.review?.outcome).toBe("acknowledged");
    expect((await inbox()).items.map((item) => item.checkin.id)).not.toContain(checkin.id);
  });
});

describe("QA Rohan's seeded pending check-in (read only)", () => {
  it("lists for the trainee and its pinned form parses", async (t) => {
    const trainee = sessionFor(t, "slipping");
    const slippingRid = relationshipIdOf("slipping");
    const list = await getData(http, trainee, `/checkins/relationships/${slippingRid}`, checkinListResponseSchema);
    expect(list.items.length).toBeGreaterThan(0);
    const latest = list.items[0]!;
    const form = await getData(http, trainee, `/checkins/${latest.id}/form`, checkinFormVersionSchema);
    expect(form.id).toBe(latest.checkinFormVersionId);
  });
});
