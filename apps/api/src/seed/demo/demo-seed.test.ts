import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mealAssignmentListResponseSchema,
  mealComplianceSummaryResponseSchema,
  meDayResponseSchema,
} from "@fitbud/contracts";
import { NUTRIENT_SCALE, type PlanContent } from "@fitbud/contracts";
import { demoUuid } from "./ids.js";
import { hashPassword } from "../../auth/password.js";
import { app } from "../../index.js";
import { setTestDbOverride, type Db } from "../../db/client.js";
import { createMemoryR2Bucket } from "../../lib/memory-r2.js";
import type { Env } from "../../types.js";
import { buildDemoSeedSql } from "./build.js";
import { DEMO_ACCOUNTS, DEMO_PASSWORD_PLAINTEXT } from "./spec.js";
import { createMemoryDb } from "../../test-support/memory-db.js";
import { loadDemoLibraryIndex, personaByEmail } from "./personas.js";

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
      dump: async () => new ArrayBuffer(0),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
    EMAIL_PROVIDER: "dev_sink",
  };
}

function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + delta));
  return dt.toISOString().slice(0, 10);
}

async function login(email: string): Promise<string> {
  const response = await app.request(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: email,
        password: DEMO_PASSWORD_PLAINTEXT,
      }),
    },
    testEnv(),
  );
  const text = await response.text();
  expect(response.status, text).toBe(200);
  const body = JSON.parse(text) as { data: { token: string } };
  return body.data.token;
}

describe("demo seed", () => {
  let db: Db;
  let close: () => void = () => {};
  let refDate: string;
  let sqliteExec: (sql: string) => ReturnType<
    Awaited<ReturnType<typeof createMemoryDb>>["sqlite"]["exec"]
  >;

  beforeEach(async () => {
    const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    sqliteExec = handle.sqlite.exec.bind(handle.sqlite);
    const passwordHash = await hashPassword(DEMO_PASSWORD_PLAINTEXT);
    const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
    const referenceInstant = new Date().toISOString();
    refDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(referenceInstant));
    const sql = buildDemoSeedSql({
      referenceInstant,
      passwordHash,
      libraryIndex,
    });
    handle.sqlite.exec(sql);
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it(
    "applies twice with stable counts and valid foreign keys",
    async () => {
      const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
      try {
        const passwordHash = await hashPassword(DEMO_PASSWORD_PLAINTEXT);
        const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
        const sql = buildDemoSeedSql({
          referenceInstant: new Date().toISOString(),
          passwordHash,
          libraryIndex,
        });
        handle.sqlite.exec(sql);
        const fk = handle.sqlite.exec("PRAGMA foreign_key_check");
        expect(fk[0]?.values ?? []).toEqual([]);
        const users1 =
          handle.sqlite.exec("SELECT COUNT(*) FROM users")[0]?.values[0]?.[0];
        handle.sqlite.exec(sql);
        const users2 =
          handle.sqlite.exec("SELECT COUNT(*) FROM users")[0]?.values[0]?.[0];
        expect(users2).toBe(users1);
      } finally {
        handle.close();
      }
    },
    180_000,
  );

  it("logs in every demo account with the dev password", async () => {
    for (const account of DEMO_ACCOUNTS) {
      if (account.role === "invite") continue;
      const token = await login(account.email);
      expect(token.length).toBeGreaterThan(10);
    }
  });

  it("covers persona states via API queries", async () => {
    const rahulToken = await login("rahul.coach@demo.fitbud.test");
    const rahulHeaders = {
      Authorization: `Bearer ${rahulToken}`,
      "x-fitbud-role": "trainer",
    };

    const attention = await app.request(
      "/exceptions/attention?groupBy=relationship&limit=50",
      { headers: rahulHeaders },
      testEnv(),
    );
    expect(attention.status).toBe(200);
    const attentionBody = (await attention.json()) as {
      data: {
        groups?: Array<{
          relationshipId: string;
          traineeDisplayName: string;
          items: Array<{ type: string; severity: string; status: string }>;
        }>;
      };
    };
    expect((attentionBody.data.groups ?? []).length).toBeGreaterThan(0);

    const clients = await app.request("/clients", { headers: rahulHeaders }, testEnv());
    const clientsText = await clients.text();
    expect(clients.status, clientsText).toBe(200);
    const clientsBody = JSON.parse(clientsText) as {
      data: { facets: { status: Record<string, number> }; items: unknown[] };
    };
    expect(clientsBody.data.facets.status.ended ?? 0).toBeGreaterThanOrEqual(1);

    const coachAsks = await app.request(
      "/coach-asks?status=open",
      { headers: rahulHeaders },
      testEnv(),
    );
    expect(coachAsks.status).toBe(200);

    const feed = await app.request("/activity/feed", { headers: rahulHeaders }, testEnv());
    expect(feed.status).toBe(200);

    const aaravToken = await login("aarav.ontrack@demo.fitbud.test");
    const traineeHeaders = {
      Authorization: `Bearer ${aaravToken}`,
      "x-fitbud-role": "trainee",
    };
    const day = await app.request(
      `/me/day/${refDate}`,
      { headers: traineeHeaders },
      testEnv(),
    );
    expect(day.status).toBe(200);
    const week = await app.request("/me/week", { headers: traineeHeaders }, testEnv());
    expect(week.status).toBe(200);
    const notes = await app.request("/me/coach-notes", { headers: traineeHeaders }, testEnv());
    expect(notes.status).toBe(200);
    const mealTimes = await app.request("/me/meal-times", { headers: traineeHeaders }, testEnv());
    expect(mealTimes.status).toBe(200);

    const slipping = await app.request(
      "/clients?adherenceState=needs_attention",
      { headers: rahulHeaders },
      testEnv(),
    );
    expect(slipping.status).toBe(200);
    const slipBody = (await slipping.json()) as {
      data: { items: Array<{ traineeDisplayName: string; adherenceState: string }> };
    };
    expect(
      slipBody.data.items.some((i) =>
        i.traineeDisplayName.toLowerCase().includes("rohan"),
      ),
    ).toBe(true);

    expect(
      sqliteExec(`SELECT COUNT(*) FROM reminder_states WHERE mode='paused'`)[0]
        ?.values[0]?.[0],
    ).toBe(1);

    const onboarding = await app.request(
      "/clients?adherenceState=not_available",
      { headers: rahulHeaders },
      testEnv(),
    );
    const onboardingBody = (await onboarding.json()) as {
      data: { items: Array<{ traineeDisplayName: string }> };
    };
    expect(
      onboardingBody.data.items.some((i) =>
        i.traineeDisplayName.toLowerCase().includes("vikram"),
      ),
    ).toBe(true);

    const reengagement = await app.request(
      "/notifications/reengagement-candidates",
      { headers: rahulHeaders },
      testEnv(),
    );
    expect(reengagement.status).toBe(200);

    for (const account of DEMO_ACCOUNTS) {
      const persona = personaByEmail(account.email);
      expect(persona?.key).toBe(account.state);
    }

    const rohanToken = await login("rohan.slipping@demo.fitbud.test");
    const rohanClient = await app.request(
      "/clients",
      {
        headers: {
          Authorization: `Bearer ${rohanToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(rohanClient.status).toBe(403);

    const rohanRelRows = sqliteExec(
      `SELECT cr.id FROM coaching_relationships cr
       JOIN users u ON u.id = cr.trainee_user_id
       JOIN user_identities ui ON ui.user_id = u.id
       WHERE ui.email_norm = 'rohan.slipping@demo.fitbud.test'`,
    );
    const rohanRelId = String(rohanRelRows[0]?.values[0]?.[0] ?? "");
    expect(rohanRelId.length).toBeGreaterThan(10);
    const dbTypes = sqliteExec(
      `SELECT DISTINCT type FROM exceptions WHERE coaching_relationship_id = '${rohanRelId.replace(/'/g, "''")}'`,
    );
    for (const expected of [
      "missed_workout",
      "skipped_workout",
      "overdue_meal",
      "skipped_meal",
      "meal_deviation",
      "overdue_checkin",
    ]) {
      expect(
        dbTypes[0]?.values.some((row) => row[0] === expected),
      ).toBe(true);
    }

    const relRows = sqliteExec(
      `SELECT cr.id FROM coaching_relationships cr
       JOIN users u ON u.id = cr.trainee_user_id
       JOIN user_identities ui ON ui.user_id = u.id
       WHERE ui.email_norm = 'farhan.paused@demo.fitbud.test'`,
    );
    const farhanRid = String(relRows[0]?.values[0]?.[0] ?? "");
    const responsiveness = await app.request(
      `/notifications/relationships/${farhanRid}/responsiveness?days=14`,
      {
        headers: {
          Authorization: `Bearer ${rahulToken}`,
          "x-fitbud-role": "trainer",
        },
      },
      testEnv(),
    );
    expect(responsiveness.status).toBe(200);
    const respBody = (await responsiveness.json()) as {
      data: { label: string };
    };
    expect(respBody.data.label).toBe("reminders_paused");
  });

  it(
    "serves contract-valid meal and diet read models for every demo trainee",
    async () => {
      const windowFrom = addDays(refDate, -7);
      const windowTo = addDays(refDate, 7);
      for (const account of DEMO_ACCOUNTS) {
        if (account.role !== "trainee") continue;
        const token = await login(account.email);
        const relRows = sqliteExec(
          `SELECT cr.id FROM coaching_relationships cr
           JOIN users u ON u.id = cr.trainee_user_id
           JOIN user_identities ui ON ui.user_id = u.id
           WHERE ui.email_norm = '${account.email.replace(/'/g, "''")}'
           ORDER BY cr.started_at DESC LIMIT 1`,
        );
        const relationshipId = String(relRows[0]?.values[0]?.[0] ?? "");
        expect(relationshipId.length, account.email).toBeGreaterThan(10);
        const headers = {
          Authorization: `Bearer ${token}`,
          "x-fitbud-role": "trainee",
        };
        const assignments = await app.request(
          `/meals/relationships/${relationshipId}/assignments?fromDate=${windowFrom}&toDate=${windowTo}`,
          { headers },
          testEnv(),
        );
        const assignmentsText = await assignments.text();
        expect(assignments.status, `${account.email} assignments: ${assignmentsText}`).toBe(
          200,
        );
        mealAssignmentListResponseSchema.parse(JSON.parse(assignmentsText).data);

        const compliance = await app.request(
          `/meals/relationships/${relationshipId}/compliance?fromDate=${windowFrom}&toDate=${windowTo}`,
          { headers },
          testEnv(),
        );
        const complianceText = await compliance.text();
        expect(compliance.status, account.email).toBe(200);
        mealComplianceSummaryResponseSchema.parse(JSON.parse(complianceText).data);

        const day = await app.request(`/me/day/${refDate}`, { headers }, testEnv());
        const dayText = await day.text();
        expect(
          [200, 404].includes(day.status),
          `${account.email} /me/day: ${dayText}`,
        ).toBe(true);
        if (day.status === 200) {
          meDayResponseSchema.parse(JSON.parse(dayText).data);
        }
      }

      const lakshmiToken = await login("lakshmi.foods@demo.fitbud.test");
      const foodSearch = await app.request(
        "/me/foods/search?q=chapati&limit=5",
        {
          headers: {
            Authorization: `Bearer ${lakshmiToken}`,
            "x-fitbud-role": "trainee",
          },
        },
        testEnv(),
      );
      expect(foodSearch.status).toBe(200);
      const searchBody = (await foodSearch.json()) as {
        data: { items: Array<{ id: string; defaultServingId: string | null }> };
      };
      const foodId = searchBody.data.items[0]?.id;
      expect(foodId).toBeTruthy();
      expect(searchBody.data.items[0]?.defaultServingId).toBeTruthy();
      const detail = await app.request(
        `/me/foods/${foodId}`,
        {
          headers: {
            Authorization: `Bearer ${lakshmiToken}`,
            "x-fitbud-role": "trainee",
          },
        },
        testEnv(),
      );
      expect(detail.status).toBe(200);
      const detailBody = (await detail.json()) as {
        data: { servings: Array<{ isDefault: boolean }> };
      };
      expect(detailBody.data.servings.length).toBeGreaterThan(1);
    },
    180_000,
  );

  it("seeds roster meta: profiles, staggered check-ins, plan shape, reminders", async () => {
    const rows = (sql: string) => sqliteExec(sql)[0]?.values ?? [];
    const traineeRel = (email: string) =>
      String(
        rows(
          `SELECT cr.id FROM coaching_relationships cr
           JOIN user_identities ui ON ui.user_id = cr.trainee_user_id
           WHERE ui.email_norm = '${email}'`,
        )[0]?.[0] ?? "",
      );

    expect(
      rows(
        `SELECT COUNT(*) FROM trainee_profiles tp
         JOIN user_roles ur ON ur.user_id = tp.user_id AND ur.role = 'trainee'
         WHERE tp.date_of_birth IS NULL OR tp.gender IS NULL`,
      )[0]?.[0],
    ).toBe(0);
    const rohanProfile = rows(
      `SELECT tp.date_of_birth, tp.gender FROM trainee_profiles tp
       JOIN user_identities ui ON ui.user_id = tp.user_id
       WHERE ui.email_norm = 'rohan.slipping@demo.fitbud.test'`,
    )[0];
    expect(rohanProfile?.[1]).toBe("Male");
    const rohanAge =
      Number(refDate.slice(0, 4)) - Number(String(rohanProfile?.[0]).slice(0, 4));
    expect([29, 30]).toContain(rohanAge);

    const longAnswer = String(
      rows(
        `SELECT answers_json FROM onboarding_form_responses r
         JOIN coaching_relationships cr ON cr.id = r.coaching_relationship_id
         JOIN user_identities ui ON ui.user_id = cr.trainee_user_id
         WHERE ui.email_norm = 'sneha.review@demo.fitbud.test'`,
      )[0]?.[0],
    );
    const answers = JSON.parse(longAnswer) as Record<string, string>;
    expect(Object.keys(answers).sort()).toEqual(
      ["goals", "limitations", "preferences", "relevant_history", "schedule"].sort(),
    );
    expect(answers.relevant_history!.split("\n").length).toBeGreaterThan(6);

    const nextDates = rows(
      `SELECT DISTINCT local_date FROM checkins WHERE record_status='draft' AND local_date > '${refDate}'`,
    ).map((row) => String(row[0]));
    expect(nextDates.length).toBeGreaterThanOrEqual(5);
    const rohanNext = rows(
      `SELECT local_date FROM checkins WHERE id = '${demoUuid("checkin", "rohan.slipping@demo.fitbud.test-next")}'`,
    )[0]?.[0];
    expect(new Date(`${String(rohanNext)}T12:00:00Z`).getUTCDay()).toBe(5);
    const rohanRel = traineeRel("rohan.slipping@demo.fitbud.test");
    expect(
      Number(
        rows(
          `SELECT COUNT(*) FROM checkins c LEFT JOIN checkin_reviews r ON r.checkin_id = c.id
           WHERE c.coaching_relationship_id = '${rohanRel}'
             AND c.record_status = 'submitted' AND r.id IS NULL
             AND strftime('%w', c.local_date) = '5'`,
        )[0]?.[0],
      ),
    ).toBeGreaterThanOrEqual(1);

    expect(
      Number(
        rows(
          `SELECT COUNT(*) FROM notifications
           WHERE coaching_relationship_id = '${rohanRel}' AND notification_type = 'meal_reminder'`,
        )[0]?.[0],
      ),
    ).toBeGreaterThanOrEqual(3);
    expect(
      Number(
        rows(
          `SELECT COUNT(*) FROM notification_preferences WHERE quiet_hours_start IS NOT NULL`,
        )[0]?.[0],
      ),
    ).toBeGreaterThanOrEqual(2);

    expect(
      rows(`SELECT title FROM plans WHERE coaching_relationship_id = '${rohanRel}'`)[0]?.[0],
    ).toBe("Fat loss \u00b7 Phase 2");
    const rohanStarted = String(
      rows(`SELECT started_at FROM coaching_relationships WHERE id = '${rohanRel}'`)[0]?.[0],
    ).slice(0, 10);
    expect(
      (Date.parse(`${refDate}T00:00:00Z`) - Date.parse(`${rohanStarted}T00:00:00Z`)) /
        86_400_000,
    ).toBeGreaterThanOrEqual(38);

    const content = JSON.parse(
      String(
        rows(
          `SELECT content_json FROM plan_versions WHERE status = 'effective' AND plan_id = (SELECT id FROM plans WHERE coaching_relationship_id = '${rohanRel}')`,
        )[0]?.[0],
      ),
    ) as PlanContent;
    expect(content.workoutDays.map((day) => day.weekday)).toEqual([1, 3, 5]);
    let kcal = 0;
    let protein = 0;
    for (const meal of content.mealPrescriptions) {
      for (const item of meal.items ?? []) {
        kcal += (item.calculated.energyKcalScaled ?? 0) / NUTRIENT_SCALE;
        protein += (item.calculated.proteinScaled ?? 0) / NUTRIENT_SCALE;
      }
    }
    expect(kcal).toBeGreaterThan(1700);
    expect(kcal).toBeLessThan(2000);
    expect(protein).toBeGreaterThanOrEqual(90);
    expect(protein).toBeLessThanOrEqual(140);

    const mismatched = rows(
      `SELECT cr.id, we.sessions_per_week FROM coaching_relationships cr
       JOIN coaching_configurations cc ON cc.coaching_relationship_id = cr.id
       JOIN workout_expectations we ON we.coaching_configuration_id = cc.id`,
    ).filter((row) => Number(row[1]) !== 3);
    expect(mismatched.length).toBe(0);

    const rohanToken = await login("rahul.coach@demo.fitbud.test");
    const responsiveness = await app.request(
      `/notifications/relationships/${rohanRel}/responsiveness?days=14`,
      {
        headers: {
          Authorization: `Bearer ${rohanToken}`,
          "x-fitbud-role": "trainer",
        },
      },
      testEnv(),
    );
    expect(responsiveness.status).toBe(200);
    const respBody = (await responsiveness.json()) as { data: { label: string } };
    expect(respBody.data.label).not.toBe("not_enough_data");
  }, 120_000);

  it("does not reference wiped legacy library foods without seed_version", () => {
    const rows = sqliteExec(
      `SELECT COUNT(*) FROM food_library_items f
       JOIN plan_versions pv ON pv.content_json LIKE '%' || f.id || '%'
       WHERE f.ownership='global' AND f.seed_version IS NULL`,
    );
    expect(rows[0]?.values[0]?.[0]).toBe(0);
  });

  it("trainer week todayNutrition kcal matches trainee /me/day for Rohan and Aarav", async () => {
    const trainerToken = await login("rahul.coach@demo.fitbud.test");
    const cases = [
      {
        email: "rohan.slipping@demo.fitbud.test",
        rel: demoUuid("relationship", "rohan.slipping@demo.fitbud.test"),
      },
      {
        email: "aarav.ontrack@demo.fitbud.test",
        rel: demoUuid("relationship", "aarav.ontrack@demo.fitbud.test"),
      },
    ] as const;

    for (const c of cases) {
      const weekRes = await app.request(
        `/workspaces/relationships/${c.rel}/week`,
        {
          headers: {
            Authorization: `Bearer ${trainerToken}`,
            "x-fitbud-role": "trainer",
          },
        },
        testEnv(),
      );
      expect(weekRes.status, await weekRes.clone().text()).toBe(200);
      const weekBody = (await weekRes.json()) as {
        data: {
          todayNutrition: {
            date: string;
            logged: { kcal: number };
            assigned: { kcal: number } | null;
          };
        };
      };
      const today = weekBody.data.todayNutrition.date;
      const trainerLogged = weekBody.data.todayNutrition.logged.kcal;

      const traineeToken = await login(c.email);
      const dayRes = await app.request(`/me/day/${today}`, {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      }, testEnv());
      expect(dayRes.status, await dayRes.clone().text()).toBe(200);
      const dayBody = (await dayRes.json()) as {
        data: { totals: { kcalScaled: number } };
      };
      const traineeLogged = Math.round(
        dayBody.data.totals.kcalScaled / NUTRIENT_SCALE,
      );
      expect(
        traineeLogged,
        `${c.email}: trainer week logged ${trainerLogged} vs trainee /me/day ${traineeLogged}`,
      ).toBe(trainerLogged);
    }
  }, 120_000);
});
