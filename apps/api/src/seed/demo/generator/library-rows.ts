/** Trainer-owned plan templates and forms (Rahul + Priya copies). Nova stays empty. */
import { materializePlanContent } from "@fitbud/core";
import { addDaysFromLocalDate, demoUuid } from "../ids.js";
import type { DemoLibraryIndex } from "../personas.js";
import { buildTemplateContent } from "./content.js";
import { DIET_TEMPLATES } from "./templates/diets.js";
import { CHECKIN_FORMS, ONBOARDING_FORMS } from "./templates/forms.js";
import { WORKOUT_TEMPLATES } from "./templates/workouts.js";
import type { SeedRows } from "./sql.js";

export const TEMPLATE_TRAINERS = ["rahul.coach@demo.fitbud.test", "priya.coach@demo.fitbud.test"] as const;

const COMBINED = [
  { code: "C01", title: "Fat-loss starter · Home 4x + North Indian veg", workout: "W05", diet: "N01" },
  { code: "C02", title: "Lean bulk · Upper/Lower + Eggetarian", workout: "W02", diet: "N05" },
  { code: "C03", title: "Travel-proof · Hotel 3x + Eating-out", workout: "W06", diet: "N09" },
];

export function planTemplateId(trainerEmail: string, code: string): string {
  return demoUuid("plan-template", trainerEmail.split("@")[0]!, code);
}
export function onboardingFormVersionId(trainerEmail: string, key: string, version: number): string {
  return demoUuid("onboarding-form-version", trainerEmail.split("@")[0]!, key, String(version));
}
export function checkinFormVersionId(trainerEmail: string, key: string, version: number): string {
  return demoUuid("checkin-form-version", trainerEmail.split("@")[0]!, key, String(version));
}

function at(refDate: string, daysAgo: number, time = "10:30"): string {
  return `${addDaysFromLocalDate(refDate, -daysAgo)}T${time === "10:30" ? "05:00" : time}:00.000Z`;
}

export function addTrainerLibrary(rows: SeedRows, lib: DemoLibraryIndex, refDate: string, now: string, userId: (email: string) => string): void {
  for (const trainer of TEMPLATE_TRAINERS) {
    const isCopy = trainer.startsWith("priya.");
    const offset = isCopy ? 0 : 0;
    const trainerId = userId(trainer);
    const idKey = trainer.split("@")[0]!;
    WORKOUT_TEMPLATES.forEach((template, index) => {
      const created = at(refDate, (isCopy ? 40 : 200) - index * 3 - offset);
      rows.add("plan_templates", {
        id: planTemplateId(trainer, template.code),
        ownership: "trainer",
        trainer_user_id: trainerId,
        title: `${template.code} · ${template.title}`,
        template_type: "workout",
        content_json: JSON.stringify(materializePlanContent(buildTemplateContent(lib, { workout: template.code, diet: null, idKey: `${idKey}-tpl-${template.code}` }))),
        record_version: (index % 4) + 1,
        created_at: created,
        updated_at: at(refDate, (isCopy ? 20 : 60) - index),
      });
    });
    DIET_TEMPLATES.forEach((template, index) => {
      rows.add("plan_templates", {
        id: planTemplateId(trainer, template.code),
        ownership: "trainer",
        trainer_user_id: trainerId,
        title: `${template.code} · ${template.title}`,
        template_type: "nutrition",
        content_json: JSON.stringify(materializePlanContent(buildTemplateContent(lib, { workout: null, diet: template.code, idKey: `${idKey}-tpl-${template.code}` }))),
        record_version: (index % 3) + 1,
        created_at: at(refDate, (isCopy ? 39 : 190) - index * 3),
        updated_at: at(refDate, (isCopy ? 19 : 50) - index),
      });
    });
    COMBINED.forEach((template, index) => {
      rows.add("plan_templates", {
        id: planTemplateId(trainer, template.code),
        ownership: "trainer",
        trainer_user_id: trainerId,
        title: `${template.code} · ${template.title}`,
        template_type: "combined",
        content_json: JSON.stringify(materializePlanContent(buildTemplateContent(lib, { workout: template.workout, diet: template.diet, idKey: `${idKey}-tpl-${template.code}` }))),
        record_version: 1,
        created_at: at(refDate, (isCopy ? 30 : 100) - index * 5),
        updated_at: at(refDate, (isCopy ? 15 : 35) - index),
      });
    });
    for (const form of ONBOARDING_FORMS) {
      const templateId = demoUuid("onboarding-form-template", idKey, form.key);
      rows.add("onboarding_form_templates", {
        id: templateId,
        ownership: "trainer",
        trainer_user_id: trainerId,
        name: isCopy ? `${form.name} (Priya)` : form.name,
        description: form.description,
        created_at: at(refDate, isCopy ? 40 : form.createdDaysAgo),
        updated_at: at(refDate, isCopy ? 40 : form.versions.at(-1)!.createdDaysAgo),
      });
      for (const version of form.versions) {
        rows.add("onboarding_form_versions", {
          id: onboardingFormVersionId(trainer, form.key, version.version),
          template_id: templateId,
          key: `${idKey}-${form.key}`,
          version: version.version,
          scope: "trainer",
          trainer_user_id: trainerId,
          schema_json: JSON.stringify({ fields: version.fields }),
          created_at: at(refDate, isCopy ? 40 - version.version : version.createdDaysAgo),
        });
      }
    }
    for (const form of CHECKIN_FORMS) {
      const templateId = demoUuid("checkin-form-template", idKey, form.key);
      rows.add("checkin_form_templates", {
        id: templateId,
        ownership: "trainer",
        trainer_user_id: trainerId,
        name: isCopy ? `${form.name} (Priya)` : form.name,
        description: form.description,
        created_at: at(refDate, isCopy ? 40 : form.createdDaysAgo),
        updated_at: at(refDate, isCopy ? 40 : form.versions.at(-1)!.createdDaysAgo),
      });
      for (const version of form.versions) {
        rows.add("checkin_form_versions", {
          id: checkinFormVersionId(trainer, form.key, version.version),
          template_id: templateId,
          key: `${idKey}-${form.key}`,
          version: version.version,
          scope: "trainer",
          trainer_user_id: trainerId,
          schema_json: JSON.stringify({ fields: version.fields }),
          created_at: at(refDate, isCopy ? 40 - version.version : version.createdDaysAgo),
        });
      }
    }
  }
}
