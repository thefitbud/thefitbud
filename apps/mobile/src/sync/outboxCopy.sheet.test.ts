import { describe, expect, it } from "vitest";
import {
  conflictSheetCopy,
  failureReason,
  lastSentLabel,
  pillFromStatus,
  sendOutcomeLine,
  sheetItems,
  sheetTitle,
  type SheetRow,
} from "./outboxCopy";

/** TR-19a / TR-19b copy, built from outbox rows as the engine stores them. */

const MEAL = "10000000-0000-4000-8000-000000000001";
const EXECUTION = "20000000-0000-4000-8000-000000000001";
const ASSIGNMENT = "20000000-0000-4000-8000-000000000002";
const TZ = "Asia/Kolkata";

let n = 0;
function row(over: Partial<SheetRow> & Pick<SheetRow, "operation" | "payloadJson">): SheetRow {
  n += 1;
  return {
    mutationId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    recordId: MEAL,
    clientOccurredAt: "2026-11-15T11:34:00.000Z", // 5:04 pm IST
    status: "pending",
    lastError: null,
    lastErrorCode: null,
    lastErrorReason: null,
    keptAt: null,
    ...over,
  };
}

const meal = (over: Partial<SheetRow> = {}) =>
  row({
    operation: "meal.confirm",
    payloadJson: JSON.stringify({ assignmentId: MEAL, body: { photoIntent: null } }),
    ...over,
  });

const set = (setId: number, over: Partial<SheetRow> = {}) =>
  row({
    operation: "workout.complete_set",
    recordId: EXECUTION,
    clientOccurredAt: `2026-11-15T13:2${setId}:00.000Z`,
    payloadJson: JSON.stringify({
      executionId: EXECUTION,
      setExecutionId: `30000000-0000-4000-8000-00000000000${setId}`,
      assignmentId: ASSIGNMENT,
      body: { actualReps: 10 },
    }),
    ...over,
  });

const weight = (over: Partial<SheetRow> = {}) =>
  row({
    operation: "measurement.create",
    recordId: "40000000-0000-4000-8000-000000000001",
    clientOccurredAt: "2026-11-15T01:35:00.000Z", // 7:05 am IST
    payloadJson: JSON.stringify({
      coachingRelationshipId: "50000000-0000-4000-8000-000000000001",
      body: { type: "body_weight_kg", value: 78.3, unit: "kg" },
    }),
    ...over,
  });

const names = {
  meal: (id: string) => (id === MEAL ? "Evening snack" : null),
  workout: (id: string) => (id === ASSIGNMENT ? "Lower body B" : null),
};

describe("sync status sheet (TR-19a)", () => {
  it("shows a meal, a workout's sets as one line, and a weight, as the mock does", () => {
    const items = sheetItems(
      [meal(), set(0), set(1), set(2, { status: "in_flight" }), weight()],
      { names, timeZone: TZ },
    );

    expect(items.map((item) => [item.title, item.detail, item.state])).toEqual([
      ["Evening snack", "Diet · eaten as planned · 5:04 pm", "waiting"],
      ["Lower body B · 3 sets", "Workout · 6:52 pm", "sending"],
      ["Weight 78.3 kg", "Progress · 7:05 am", "waiting"],
    ]);
    expect(sheetTitle(items)).toBe("3 items waiting to send");
  });

  it("counts lines, not rows, and has a singular", () => {
    expect(sheetTitle(sheetItems([set(0), set(1)]))).toBe("1 item waiting to send");
    expect(sheetTitle([])).toBe("All saved");
  });

  it("never puts a count in parentheses, an id or an operation name on screen", () => {
    const items = sheetItems([meal(), set(0), weight(), meal({ status: "rejected", lastError: "Set already recorded." })]);
    const shown = [sheetTitle(items), ...items.flatMap((item) => [item.title, item.detail, item.reason ?? ""])].join(" | ");
    expect(shown).not.toMatch(/\(\d+\)/);
    expect(shown).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(shown).not.toMatch(/\b(meal|workout|measurement)\.[a-z_]+/);
    expect(shown).not.toMatch(/%/);
  });

  it("falls back to plain names when the phone has no record of them", () => {
    const [m, w] = sheetItems([meal(), set(0)]);
    expect(m?.title).toBe("Meal");
    expect(w?.title).toBe("Workout · 1 set");
  });

  it("a skipped meal and something different read as what the trainee did", () => {
    const items = sheetItems(
      [
        meal({ operation: "meal.skip" }),
        meal({ operation: "meal.deviate", recordId: "x", payloadJson: JSON.stringify({ assignmentId: "x", body: {} }) }),
      ],
      { timeZone: TZ },
    );
    expect(items.map((item) => item.detail)).toEqual([
      "Diet · skipped · 5:04 pm",
      "Diet · something different · 5:04 pm",
    ]);
  });

  it("sent rows are not in the outbox, and an acked leftover is never shown", () => {
    expect(sheetItems([meal({ status: "acked" })])).toEqual([]);
  });

  it("a refused line carries the reason; only refused lines are 'couldn't be sent'", () => {
    const items = sheetItems([
      meal({
        status: "rejected",
        lastError: "Set already recorded.",
        lastErrorCode: "SET_ALREADY_RECORDED",
      }),
    ]);
    expect(items[0]).toMatchObject({ state: "failed", reason: "Set already recorded." });
    expect(sheetTitle(items)).toBe("1 item couldn't be sent");
  });

  it("Last sent shows the time, and nothing before the first send", () => {
    expect(lastSentLabel("2026-11-15T11:11:00.000Z", TZ)).toBe("Last sent 4:41 pm");
    expect(lastSentLabel(null, TZ)).toBeNull();
  });
});

describe("the pill is the outbox", () => {
  it.each([
    [{ waiting: 0, sending: 0, failed: 0 }, null],
    [{ waiting: 2, sending: 0, failed: 0 }, "Saved on phone"],
    [{ waiting: 1, sending: 1, failed: 0 }, "Sending…"],
    [{ waiting: 1, sending: 1, failed: 1 }, "Couldn't send"],
  ])("%j → %s", (status, label) => {
    expect(pillFromStatus(status)?.label ?? null).toBe(label);
  });
});

describe("Try sending now: the result line", () => {
  const status = (waiting: number, failed: number, waitingReason: string | null) => ({
    waiting,
    failed,
    waitingReason,
  });

  it("says Sent when the queue emptied, and nothing when there was nothing to send", () => {
    expect(sendOutcomeLine({ sent: 3, status: status(0, 0, null) })).toBe("Sent.");
    expect(sendOutcomeLine({ sent: 0, status: status(0, 0, null) })).toBeNull();
  });

  it("blames the connection only when the request never got an answer", () => {
    expect(sendOutcomeLine({ sent: 0, status: status(2, 0, "UNREACHABLE") })).toBe(
      "Can't reach FitBud. Check your connection.",
    );
    expect(sendOutcomeLine({ sent: 0, status: status(2, 0, "SERVER") })).toBe(
      "FitBud didn't respond. We'll keep trying.",
    );
    expect(sendOutcomeLine({ sent: 0, status: status(2, 0, "CLIENT") })).toContain("SYNC-PARSE");
    expect(sendOutcomeLine({ sent: 0, status: status(2, 0, "AUTH") })).toContain("SYNC-AUTH");
    for (const reason of ["SERVER", "CLIENT", "AUTH", null]) {
      expect(sendOutcomeLine({ sent: 0, status: status(1, 0, reason) })).not.toMatch(/connection|offline/i);
    }
  });
});

describe("conflict when the coach changed the plan (TR-19b)", () => {
  const superseded = meal({
    status: "conflicted",
    lastError: "This meal cannot be logged.",
    lastErrorCode: "LOCKED",
    lastErrorReason: "superseded",
  });

  it("marks the line as a plan-change conflict, with the coach's name in the reason", () => {
    const [item] = sheetItems([superseded], { names, coachFirstName: "Rahul" });
    expect(item).toMatchObject({
      conflict: true,
      kept: false,
      state: "failed",
      reason: "Rahul changed this while you were offline.",
    });
  });

  it("Keep my log is remembered on the line", () => {
    const [item] = sheetItems([{ ...superseded, keptAt: "2026-11-15T12:00:00.000Z" }]);
    expect(item?.kept).toBe(true);
  });

  it("other refusals are not plan-change conflicts", () => {
    const [closed] = sheetItems(
      [meal({ status: "conflicted", lastErrorCode: "LOCKED", lastErrorReason: "exception_resolved" })],
      { coachFirstName: "Rahul" },
    );
    expect(closed).toMatchObject({
      conflict: false,
      reason: "Rahul closed this before your log was sent.",
    });
    expect(
      failureReason(
        { status: "conflicted", lastError: "x", lastErrorCode: "RELATIONSHIP_ENDED", lastErrorReason: null },
        "Rahul",
      ),
    ).toBe("Coaching has ended.");
  });

  it("uses the mock's title and buttons, and only claims what is true", () => {
    const copy = conflictSheetCopy({
      coachFirstName: "Rahul",
      kind: "meal",
      subject: "evening snack",
    });
    expect(copy).toEqual({
      title: "Rahul changed this meal",
      body: "While you were offline, Rahul updated your evening snack. Your log is kept on this phone.",
      keep: "Keep my log",
      see: "See Rahul's change",
    });
    expect(conflictSheetCopy({ coachFirstName: "Rahul", kind: "workout", subject: null }).title).toBe(
      "Rahul changed this workout",
    );
  });
});
