/**
 * Plans (QT6): the trainee's current plan and the trainer's view of the same state.
 * Read-only. Published plan versions are immutable, so the effective version must be
 * a published one (status "published" or, once in force, "effective").
 */
import {
  effectivePlanResponseSchema,
  planListResponseSchema,
  planWithVersionsSchema,
} from "@fitbud/contracts";
import { describe, expect, it } from "vitest";
import { getData, relationshipIdOf } from "./helpers.js";
import { sessionFor, smokeHttp } from "./run-context.js";

const http = smokeHttp();

describe("plans", () => {
  it.for(["ontrack", "slipping"] as const)(
    "%s: the trainee's effective plan is a published, in-force version of a listed plan",
    async (key, t) => {
      const trainee = sessionFor(t, key);
      const rid = relationshipIdOf(key);
      const effective = await getData(http, trainee, `/plans/relationships/${rid}/effective`, effectivePlanResponseSchema);
      expect(effective.plan).not.toBeNull();
      expect(effective.version).not.toBeNull();
      // Published versions are immutable; the one in force reads "effective".
      expect(["published", "effective"]).toContain(effective.version!.status);
      expect(effective.version!.planId).toBe(effective.plan!.id);
      expect(effective.plan!.coachingRelationshipId).toBe(rid);

      const list = await getData(http, trainee, `/plans/relationships/${rid}`, planListResponseSchema);
      expect(list.items.length).toBeGreaterThan(0);

      const detail = await getData(http, trainee, `/plans/${effective.plan!.id}`, planWithVersionsSchema);
      expect(detail.versions.map((v) => v.id)).toContain(effective.version!.id);
    },
  );

  it.for(["ontrack", "slipping"] as const)("%s: the trainer sees the same effective version", async (key, t) => {
    const trainee = sessionFor(t, key);
    const trainer = sessionFor(t, "trainer");
    const rid = relationshipIdOf(key);
    const path = `/plans/relationships/${rid}/effective`;
    const asTrainee = await getData(http, trainee, path, effectivePlanResponseSchema);
    const asTrainer = await getData(http, trainer, path, effectivePlanResponseSchema);
    expect(asTrainer.version?.id).toBe(asTrainee.version?.id);
  });
});
