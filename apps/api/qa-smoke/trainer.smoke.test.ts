/**
 * The trainer's read endpoints (QT6), as QA Rahul. All read-only. Exceptions are only
 * ever listed here: resolving one is the trainer's own act and belongs to the UI suites
 * (no auto-resolve).
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
import { describe, expect, it } from "vitest";
import { errorOf, getData, relationshipIdOf, send, stable } from "./helpers.js";
import { sessionFor, smokeHttp } from "./run-context.js";

const http = smokeHttp();

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

  it("a relationship the trainer does not own is not found", async (t) => {
    const trainer = sessionFor(t, "trainer");
    const response = await send(
      http,
      trainer,
      "GET",
      "/workspaces/relationships/00000000-0000-4000-8000-000000000000",
    );
    expect(response.status).toBe(404);
    expect(errorOf(response).code).toMatch(/NOT_FOUND$/);
  });
});
