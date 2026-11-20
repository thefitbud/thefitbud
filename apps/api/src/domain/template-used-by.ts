import type { TemplateUsedBy } from "@fitbud/contracts";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { coachingRelationships, plans, planVersions } from "../db/schema.js";

const EMPTY_USED_BY: TemplateUsedBy = { count: 0, clientIds: [] };

/**
 * One join for the whole page. A client counts when this coach's active
 * relationship has an effective plan version whose provenance is the template.
 * Draft, scheduled, published, and superseded versions do not count. Ended
 * relationships do not count. Another coach's use of a shared base does not
 * count. `clientIds` are relationship ids, ascending, capped at three.
 */
export async function loadTemplateUsedBy(
  db: Db,
  trainerUserId: string,
  templateIds: readonly string[],
): Promise<Map<string, TemplateUsedBy>> {
  const usage = new Map<string, TemplateUsedBy>();
  if (templateIds.length === 0) {
    return usage;
  }

  const rows = await db
    .selectDistinct({
      templateId: planVersions.sourceTemplateId,
      clientId: coachingRelationships.id,
    })
    .from(planVersions)
    .innerJoin(plans, eq(plans.id, planVersions.planId))
    .innerJoin(
      coachingRelationships,
      eq(coachingRelationships.id, plans.coachingRelationshipId),
    )
    .where(
      and(
        inArray(planVersions.sourceTemplateId, [...templateIds]),
        eq(planVersions.status, "effective"),
        eq(coachingRelationships.trainerUserId, trainerUserId),
        eq(coachingRelationships.status, "active"),
      ),
    );

  const byTemplate = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.templateId) continue;
    const ids = byTemplate.get(row.templateId);
    if (ids) {
      ids.push(row.clientId);
    } else {
      byTemplate.set(row.templateId, [row.clientId]);
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
