/** Plan version chains and subscription billing chains per persona. */
import { materializePlanContent } from "@fitbud/core";
import type { PlanContent } from "@fitbud/contracts";
import { addDaysFromLocalDate, demoUuid } from "../ids.js";
import type { DemoLibraryIndex } from "../personas.js";
import { buildTemplateContent, type QuantityClamp } from "./content.js";
import type { PersonaConfig } from "./personas.js";
import type { SeedRows } from "./sql.js";

export type ChainVersion = {
  id: string;
  number: number;
  status: "superseded" | "effective";
  fromDate: string;
  /** Inclusive last local date, null when open-ended. */
  toDate: string | null;
  content: PlanContent;
  workout: string | null;
  diet: string | null;
  reason: string;
  /** Food amounts this version's dietScale pushed past the 100-unit limit (capped). */
  quantityClamps: QuantityClamp[];
};

/**
 * Last step → recipe "v2" (the id overlays and docs use), the one before → "v1",
 * earlier steps → "h1", "h2"… so ids from the original seed stay stable.
 */
export function buildPlanChain(input: {
  lib: DemoLibraryIndex;
  cfg: PersonaConfig;
  relId: string;
  refDate: string;
  /** Existing personas: fixed ids and Mon/Tue/Thu/Sat on versions active in the 28-day window. */
  legacyWindow: boolean;
  windowStart: string;
}): ChainVersion[] {
  const { cfg } = input;
  const steps = cfg.plan;
  return steps.map((step, index) => {
    const recipe =
      index === steps.length - 1 ? "v2" : index === steps.length - 2 ? "v1" : `h${index + 1}`;
    const fromDate = addDaysFromLocalDate(input.refDate, step.fromDay);
    const next = steps[index + 1];
    const toDate = next ? addDaysFromLocalDate(input.refDate, next.fromDay - 1) : null;
    const reachesWindow = toDate === null || toDate >= input.windowStart;
    const fixed = input.legacyWindow && reachesWindow;
    const quantityClamps: QuantityClamp[] = [];
    const content = materializePlanContent(
      buildTemplateContent(input.lib, {
        workout: step.workout,
        diet: step.diet,
        dietScale: step.dietScale,
        onClamp: (clamp) => quantityClamps.push(clamp),
        loadScale: step.loadScale,
        loads: cfg.loads,
        fixedIds: input.legacyWindow,
        weekdays: fixed ? [1, 2, 4, 6] : undefined,
        idKey: `${cfg.email.split("@")[0]}-${recipe}`,
        mealTimes: cfg.email.startsWith("imran.")
          ? { breakfast: "07:30", lunch: "13:30", snack: "17:00", dinner: "20:00" }
          : undefined,
      }),
    );
    return {
      id: demoUuid("plan-version", input.relId, recipe),
      number: index + 1,
      status: next ? "superseded" : "effective",
      fromDate,
      toDate,
      content,
      workout: step.workout,
      diet: step.diet,
      reason: step.reason,
      quantityClamps,
    };
  });
}

export function versionForDate(chain: ChainVersion[], localDate: string): ChainVersion | undefined {
  return chain.find((v) => v.fromDate <= localDate && (v.toDate === null || localDate <= v.toDate));
}

export function insertPlanRows(input: {
  rows: SeedRows;
  chain: ChainVersion[];
  planId: string;
  relId: string;
  title: string;
  startedAt: string;
  now: string;
  templateIdFor: (code: string | null) => string | null;
}): void {
  input.rows.add("plans", {
    id: input.planId,
    coaching_relationship_id: input.relId,
    title: input.title,
    created_at: input.startedAt,
    updated_at: input.now,
  });
  input.chain.forEach((version, index) => {
    const effectiveFrom = `${version.fromDate}T00:00:00.000Z`;
    const effectiveTo = version.toDate ? `${version.toDate}T00:00:00.000Z` : null;
    input.rows.add("plan_versions", {
      id: version.id,
      plan_id: input.planId,
      version_number: version.number,
      status: version.status,
      record_version: 0,
      content_json: JSON.stringify(version.content),
      creation_source: index === 0 ? "template" : version.workout === input.chain[index - 1]!.workout ? "adjustment" : "template",
      source_template_id: input.templateIdFor(version.workout),
      published_at: effectiveFrom,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      created_at: effectiveFrom,
      updated_at: input.now,
    });
  });
}

const PERIOD_DAYS = { weekly: 7, monthly: 30, quarterly: 91, yearly: 365 } as const;

/** Billing chain from start to the persona's latest renews_on. Latest keeps the old id recipe. */
export function insertSubscriptionChain(input: {
  rows: SeedRows;
  cfg: PersonaConfig;
  relId: string;
  refDate: string;
  startDate: string;
}): void {
  const period = PERIOD_DAYS[input.cfg.subscription.frequency];
  const lastRenews = addDaysFromLocalDate(input.refDate, input.cfg.subscription.renewsDay);
  const versions: Array<{ starts: string; renews: string }> = [];
  let renews = lastRenews;
  let starts = addDaysFromLocalDate(renews, -period);
  while (true) {
    versions.unshift({ starts: starts < input.startDate ? input.startDate : starts, renews });
    if (starts <= input.startDate) break;
    renews = starts;
    starts = addDaysFromLocalDate(renews, -period);
    if (versions.length > 60) break;
  }
  versions.forEach((version, index) => {
    const latest = index === versions.length - 1;
    input.rows.add("subscription_versions", {
      id: latest ? demoUuid("subscription", input.relId) : demoUuid("subscription", input.relId, String(index + 1)),
      coaching_relationship_id: input.relId,
      version_number: index + 1,
      plan_name: input.cfg.subscription.planName,
      payment_frequency: input.cfg.subscription.frequency,
      starts_on: version.starts,
      renews_on: version.renews,
      created_at: `${version.starts}T05:30:00.000Z`,
    });
  });
}
