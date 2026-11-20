import type { TemplateUsedBy } from "@fitbud/contracts";
import { and, eq, gt, isNotNull, isNull, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { coachingRelationships, plans, planVersions } from "../db/schema.js";

const EMPTY_USED_BY: TemplateUsedBy = { count: 0, clientIds: [] };

/**
 * One join for the whole page. A client counts when this coach's active
 * relationship has a live plan whose provenance is the template.
 *
 * Live matches GET /plans/relationships/:id/effective: status effective, an
 * open horizon (effective_to null or still in the future), and the latest
 * effective_from for that relationship. A closed horizon stays status
 * effective after end or reactivation, and a later plan does not supersede
 * an older plan, so those rows are not a second assignment.
 * Draft, scheduled, published, and superseded versions do not count. Ended
 * relationships do not count. Another coach's use of a shared base does not
 * count. `clientIds` are relationship ids, ascending, capped at three.
 */
export async function loadTemplateUsedBy(
  db: Db,
  trainerUserId: string,
  templateIds: readonly string[],
  now: string,
): Promise<Map<string, TemplateUsedBy>> {
  const usage = new Map<string, TemplateUsedBy>();
  if (templateIds.length === 0) {
    return usage;
  }
  const wanted = new Set(templateIds);

  const rows = await db
    .select({
      templateId: planVersions.sourceTemplateId,
      clientId: coachingRelationships.id,
      effectiveFrom: planVersions.effectiveFrom,
      versionNumber: planVersions.versionNumber,
    })
    .from(planVersions)
    .innerJoin(plans, eq(plans.id, planVersions.planId))
    .innerJoin(
      coachingRelationships,
      eq(coachingRelationships.id, plans.coachingRelationshipId),
    )
    .where(
      and(
        eq(planVersions.status, "effective"),
        isNotNull(planVersions.effectiveFrom),
        or(isNull(planVersions.effectiveTo), gt(planVersions.effectiveTo, now)),
        eq(coachingRelationships.trainerUserId, trainerUserId),
        eq(coachingRelationships.status, "active"),
      ),
    );

  const liveByClient = new Map<
    string,
    { templateId: string | null; effectiveFrom: string; versionNumber: number }
  >();
  for (const row of rows) {
    if (!row.effectiveFrom) continue;
    const current = liveByClient.get(row.clientId);
    const later =
      !current ||
      row.effectiveFrom > current.effectiveFrom ||
      (row.effectiveFrom === current.effectiveFrom &&
        row.versionNumber > current.versionNumber);
    if (later) {
      liveByClient.set(row.clientId, {
        templateId: row.templateId,
        effectiveFrom: row.effectiveFrom,
        versionNumber: row.versionNumber,
      });
    }
  }

  const byTemplate = new Map<string, string[]>();
  for (const [clientId, live] of liveByClient) {
    if (!live.templateId || !wanted.has(live.templateId)) continue;
    const ids = byTemplate.get(live.templateId);
    if (ids) {
      ids.push(clientId);
    } else {
      byTemplate.set(live.templateId, [clientId]);
    }
  }

  for (const [templateId, clientIds] of byTemplate) {
    const sorted = [...new Set(clientIds)].sort();
    usage.set(templateId, {
      count: sorted.length,
      clientIds: sorted.slice(0, 3),
    });
  }
  return usage;
}

export function usedByFor(
  usage: Map<string, TemplateUsedBy>,
  templateId: string,
): TemplateUsedBy {
  return usage.get(templateId) ?? EMPTY_USED_BY;
}
