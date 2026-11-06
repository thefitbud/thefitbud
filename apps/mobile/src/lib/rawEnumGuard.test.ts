/**
 * Z5-3: no trainer or trainee-settings screen on mobile may show a raw enum
 * value ("portion_adjustment", "client_logged_later").
 *
 * This file runs in the `node` vitest project, so it cannot mount screens.
 * It guards the two places a raw value gets into mobile copy:
 *
 * 1. The pure builders that produce the text the screens print (client list,
 *    review sheet title and logged line, outcome phrases, attention rows),
 *    fed a fixture for every value of the enum they read.
 * 2. A scan of the screen sources for the shortcuts that print an enum without
 *    `labelFor`: underscore-to-space conversion and a bare enum field as JSX text.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  exceptionSeveritySchema,
  exceptionTypeSchema,
  mealDeviationKindSchema,
  onboardingStatusSchema,
  resolveExceptionOutcomeSchema,
  type AttentionGroupsResponse,
  type ClientDirectoryItem,
  type ExceptionDetail,
} from "@fitbud/contracts";
import { allLabelEntries } from "@fitbud/core";
import { needsYouRowModel, reviewedStillOpenChip } from "../trainer/attentionCards";
import { clientSubtitle, mapDirectoryItemToRow, onboardingStatusLabel } from "../trainer/clients";
import {
  buildReviewSheetCardModel,
  reviewSheetCardBody,
  reviewSheetCardTitle,
  reviewSheetLoggedLine,
} from "../trainer/reviewSheetContent";
import {
  reviewSheetItemOutcome,
  reviewSheetOutcomePhrase,
  reviewSheetResolvedBanner,
  reviewSheetResolvedRowLabel,
} from "../trainer/reviewSheetNav";

const ENTRIES = allLabelEntries();
const UNDERSCORE_KEYS = new Set(
  ENTRIES.map((e) => e.value).filter((v) => v.includes("_")),
);
/** "portion adjustment": an underscore key with underscores swapped for spaces. */
const SPACED_KEYS = new Set(
  [...UNDERSCORE_KEYS]
    .map((v) => v.replaceAll("_", " "))
    .filter((spaced) => !ENTRIES.some((e) => e.label === spaced)),
);

/** Raw enum values inside one piece of visible text. */
function rawEnumHits(text: string): string[] {
  const hits = new Set<string>();
  for (const token of text.match(/[A-Za-z0-9_]+/g) ?? []) {
    if (UNDERSCORE_KEYS.has(token)) hits.add(token);
  }
  for (const spaced of SPACED_KEYS) {
    if (text.includes(spaced)) hits.add(spaced);
  }
  return [...hits].sort();
}

function labelOf(namespace: string, value: string): string {
  const entry = ENTRIES.find((e) => e.namespace === namespace && e.value === value);
  if (!entry) throw new Error(`no label for ${namespace}.${value}`);
  return entry.label;
}

const NOW = "2026-10-21T04:00:00.000Z";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("rawEnumGuard detector (mobile)", () => {
  it("flags underscore keys and their spaced form, ignores labels", () => {
    expect(rawEnumHits("Changed · portion_adjustment")).toEqual(["portion_adjustment"]);
    expect(rawEnumHits("Changed · portion adjustment")).toEqual(["portion adjustment"]);
    expect(rawEnumHits("Changed · Portion adjustment")).toEqual([]);
  });
});

describe("rawEnumGuard: mobile trainer copy", () => {
  it("Clients: every onboarding status reads as a label in the list and subtitle", () => {
    for (const status of onboardingStatusSchema.options) {
      const label = onboardingStatusLabel(status);
      expect(label, status).toBe(labelOf("onboarding_status", status));
      expect(rawEnumHits(label), status).toEqual([]);
      const item = {
        traineeDisplayName: "Kavya Menon",
        status,
        goalShort: null,
        city: null,
        week: null,
        relationshipId: null,
        invitationId: uuid(1),
        updatedAt: NOW,
      } as unknown as ClientDirectoryItem;
      const row = mapDirectoryItemToRow(item);
      expect(rawEnumHits(row.subtitle), status).toEqual([]);
      expect(clientSubtitle(item)).toBe(label);
    }
  });

  it("Review sheet: every exception type titles as a label, with and without a date", () => {
    for (const type of exceptionTypeSchema.options) {
      const label = labelOf("exception_type", type);
      expect(reviewSheetCardTitle({ type }), type).toBe(label);
      const dated = reviewSheetCardTitle({ type, localDate: "2026-10-13" });
      expect(dated, type).toBe(`${label} · Tue 13 Oct`);
      expect(rawEnumHits(dated), type).toEqual([]);
      expect(rawEnumHits(reviewSheetCardBody({ type, sourceName: "Lunch", plannedClock: "1:00 pm" }) ?? ""), type).toEqual([]);
    }
  });

  it("Review sheet: the logged line for a changed meal names the deviation kind as a label", () => {
    for (const kind of mealDeviationKindSchema.options) {
      const line = reviewSheetLoggedLine({ type: "meal_deviation", deviationKind: kind });
      expect(line, kind).toBe(`Changed · ${labelOf("meal_deviation_kind", kind)}`);
      expect(rawEnumHits(line), kind).toEqual([]);
    }
  });

  it("Review sheet: the whole card model has no raw value for any deviation kind", () => {
    for (const kind of mealDeviationKindSchema.options) {
      const detail = {
        id: uuid(10),
        coachingRelationshipId: uuid(11),
        type: "meal_deviation",
        severity: "attention",
        status: "active",
        ruleVersion: "v1",
        sourceEntityType: "meal_assignment",
        sourceEntityId: uuid(12),
        summary: "Lunch changed",
        details: { localDate: "2026-10-13", deviationKind: kind, mealName: "Lunch" },
        detectedAt: NOW,
        activatedAt: null,
        acknowledgedAt: null,
        resolvedAt: null,
        closedReason: null,
        createdAt: NOW,
        updatedAt: NOW,
        actions: [],
      } as unknown as ExceptionDetail;
      const model = buildReviewSheetCardModel({ detail, ageMinutes: 600 });
      const text = [model.title, model.body, model.planned, model.logged, model.reminder]
        .filter((part): part is string => typeof part === "string")
        .join(" | ");
      expect(rawEnumHits(text), kind).toEqual([]);
      expect(model.logged, kind).toContain(labelOf("meal_deviation_kind", kind));
    }
  });

  it("Review sheet: every contract resolve outcome with a frame 31 phrase reads as that phrase, never raw", () => {
    // Frame 31 has three phrases. 'other' is the fourth contract value and has no
    // phrase: it is omitted (reviewSheetNav.test.ts pins that), never shown raw.
    // Whether it needs a phrase is an open question for Firoz (see the PR).
    const expected: Record<string, string | null> = {
      talked: "Talked to client",
      plan_adjusted: "Plan adjusted",
      no_action: "No action needed",
      other: null,
    };
    expect([...resolveExceptionOutcomeSchema.options].sort()).toEqual(Object.keys(expected).sort());
    for (const outcome of resolveExceptionOutcomeSchema.options) {
      const phrase = reviewSheetOutcomePhrase(outcome);
      expect(phrase, outcome).toBe(expected[outcome]);
      expect(reviewSheetItemOutcome({ outcome }), outcome).toBe(phrase);
      expect(reviewSheetItemOutcome({ resolveOutcome: outcome }), outcome).toBe(phrase);
      expect(rawEnumHits(reviewSheetResolvedBanner(phrase, true)), outcome).toEqual([]);
      expect(rawEnumHits(reviewSheetResolvedRowLabel(phrase)), outcome).toEqual([]);
    }
  });

  it("Review sheet: an outcome outside the contract is omitted, never shown raw", () => {
    // The demo seed stores 'client_logged_later' on one resolved exception.
    expect(reviewSheetItemOutcome({ outcome: "client_logged_later" })).toBeNull();
    expect(reviewSheetResolvedRowLabel(reviewSheetItemOutcome({ outcome: "client_logged_later" }))).toBe(
      "Resolved",
    );
  });

  it("Attention: severity and chip labels come from the shared labels", () => {
    for (const severity of exceptionSeveritySchema.options) {
      const group = {
        relationshipId: uuid(20),
        traineeDisplayName: "Kavya Menon",
        items: [
          {
            id: uuid(21),
            type: "missed_workout",
            severity,
            status: "active",
            ageMinutes: 3000,
            summary: "Missed workout",
            details: null,
          },
        ],
      } as unknown as AttentionGroupsResponse["groups"][number];
      const row = needsYouRowModel({ items: group.items, issue: "Missed workout" });
      expect(row.severityLabel, severity).toBe(labelOf("exception_severity", severity));
      expect(rawEnumHits(row.severityLabel), severity).toEqual([]);
    }
    expect(reviewedStillOpenChip()).toBe("Reviewed, still open");
  });
});

/** Source files of the mobile screens this task owns (not tests). */
function screenSources(): Array<{ file: string; source: string }> {
  const root = join(__dirname, "..");
  const dirs = ["trainer", "screens", join("trainee", "settings")];
  const out: Array<{ file: string; source: string }> = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        out.push({ file: full.slice(root.length + 1), source: readFileSync(full, "utf8") });
      }
    }
  };
  for (const dir of dirs) walk(join(root, dir));
  return out;
}

/** Enum-valued fields that must go through labelFor when printed. */
const ENUM_FIELDS =
  "status|outcome|paymentFrequency|frequency|basis|severity|cadence|visibility|classification|difficulty|onboardingStatus|renewalState|activityType|reminderType|deviationKind|resolveOutcome|nutritionBasis";

describe("rawEnumGuard: mobile screen sources", () => {
  const sources = screenSources();

  it("scans the trainer, screens and trainee settings folders", () => {
    expect(sources.length).toBeGreaterThan(30);
    expect(sources.some((s) => s.file.startsWith("trainer/"))).toBe(true);
    expect(sources.some((s) => s.file.startsWith("screens/"))).toBe(true);
    expect(sources.some((s) => s.file.startsWith("trainee/settings/"))).toBe(true);
  });

  it("no screen turns an enum into text by swapping underscores for spaces", () => {
    const offenders = sources
      .filter(({ source }) => /replace\(\s*\/_\/g|replaceAll\(\s*["']_["']|split\(\s*["']_["']\s*\)/.test(source))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("no screen prints an enum field as bare JSX text or inside a template string", () => {
    const bareChild = new RegExp(`(^|[^=\\w$])\\{\\s*[A-Za-z_.?!]+\\.(?:${ENUM_FIELDS})\\s*\\}`, "m");
    // HTTP status numbers in error copy are not enum values.
    const template = new RegExp(
      `\\$\\{(?!err\\.|error\\.|response\\.|res\\.)[A-Za-z_.?!]+\\.(?:${ENUM_FIELDS})\\}`,
    );
    const offenders = sources
      .filter(({ source }) => bareChild.test(source) || template.test(source))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("the scan itself catches the patterns it guards against", () => {
    const bareChild = new RegExp(`(^|[^=\\w$])\\{\\s*[A-Za-z_.?!]+\\.(?:${ENUM_FIELDS})\\s*\\}`, "m");
    expect(bareChild.test("<Text>{item.status}</Text>")).toBe(true);
    expect(bareChild.test("<Text>{labelFor('x', item.status)}</Text>")).toBe(false);
    expect(bareChild.test("<Chip value={item.status} />")).toBe(false);
  });
});
