import { randomUUID } from "node:crypto";
import { API, apiToken } from "../support/session";

/**
 * Z14-50: a brand-new client with exactly two open review items, built through
 * the same API calls the product makes, so a spec never depends on how many
 * open items the date-relative demo seed happens to give a client today.
 *
 * Flow (all real endpoints): trainer invites, the client accepts with a
 * password and an OTP proof, submits onboarding, the trainer marks the client
 * coaching-ready, configures and activates, publishes a plan whose two meals
 * are open all day, generates today's meals, and logs them as the coach does:
 * one skipped, one changed. That raises `skipped_meal` (nothing to remind
 * about) and `meal_deviation` (remindable), both open and not yet noted, on
 * any weekday and at any time of day.
 */

const CLIENT_PASSWORD = "FitBud-fresh-2026";
const TZ = "Asia/Kolkata";

type Json = Record<string, unknown>;

async function call<T = Json>(
  method: string,
  pathname: string,
  opts: { token?: string; body?: unknown; role?: "trainer" | "trainee"; key?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.role) headers["x-fitbud-role"] = opts.role;
  if (method !== "GET") headers["Idempotency-Key"] = opts.key ?? randomUUID();
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  const parsed = text
    ? (JSON.parse(text) as { data?: T; error?: { code: string; details?: unknown } })
    : {};
  if (!res.ok) {
    throw new Error(
      `fresh client setup: ${method} ${pathname} -> ${res.status} ${parsed.error?.code ?? ""} ${JSON.stringify(parsed.error?.details ?? "")}`,
    );
  }
  return parsed.data as T;
}

/**
 * The client's civil date today in the client's timezone, from the API's own
 * clock (the invitation's createdAt), so a pinned API clock is honoured.
 */
function localDateOf(serverIso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(serverIso));
}

export type FreshClient = {
  relationshipId: string;
  displayName: string;
  firstName: string;
};

/** A surname no demo client has, so a spec finds this client's Home row by name alone. */
function uniqueSurname(): string {
  const letters = randomUUID().replace(/[^a-f]/g, "").padEnd(6, "x").slice(0, 6);
  return `Fresh${letters}`;
}

/** `firstName` is the client's first name; the surname is generated, so reruns never collide. */
export async function createClientWithTwoOpenItems(firstName: string): Promise<FreshClient> {
  const trainer = await apiToken();
  const displayName = `${firstName} ${uniqueSurname()}`;
  const stamp = `${Date.now()}-${randomUUID().slice(0, 6)}`;
  const email = `fresh.${stamp}@demo.fitbud.test`;

  // Invite, then accept with a password and the OTP proof from the dev mail sink.
  const invite = await call<{ token: string; createdAt: string }>("POST", "/invitations", {
    token: trainer,
    role: "trainer",
    body: { recipientEmail: email, recipientDisplayName: displayName, sendEmail: true },
  });
  await call("POST", "/auth/otp/start", { body: { identifier: email, purpose: "invite" } });
  const mail = await call<{ items: Array<{ textBody: string }> }>(
    "GET",
    `/dev/mail?to=${encodeURIComponent(email)}&limit=5`,
  );
  const code = mail.items.map((m) => m.textBody.match(/\b(\d{6})\b/)?.[1]).find(Boolean);
  if (!code) throw new Error("fresh client setup: no OTP code in the dev mail sink");
  const proof = await call<{ otpProof: string }>("POST", "/auth/otp/verify", {
    body: { identifier: email, purpose: "invite", code },
  });
  const accepted = await call<{ token: string; relationshipId: string }>(
    "POST",
    "/invitations/accept",
    {
      body: {
        token: invite.token,
        password: CLIENT_PASSWORD,
        otpProof: proof.otpProof,
        displayName,
        timezone: TZ,
      },
    },
  );
  const rid = accepted.relationshipId;
  const client = accepted.token;

  // Onboarding: the client submits, the trainer reviews.
  await call("PUT", `/onboarding/relationships/${rid}/draft`, {
    token: client,
    role: "trainee",
    body: {
      expectedVersion: 0,
      answers: {
        primary_goal: "fat_loss",
        goal_detail: "Lose a few kilos and keep steady habits.",
        height_cm: 168,
        weight_kg: 72,
        occupation_schedule: "Office, 10 am to 6 pm",
        medical_conditions: ["none"],
        experience: "lt1",
        where_train: "home",
        days_per_week: 3,
        preferred_time: "evening",
        diet_type: "veg",
        cuisine: "north",
        who_cooks: "family",
        sleep_hours: 7,
        photos_ok: true,
      },
    },
  });
  await call("POST", `/onboarding/relationships/${rid}/submit`, {
    token: client,
    role: "trainee",
    body: { expectedVersion: 1 },
  });
  await call("POST", `/onboarding/relationships/${rid}/review`, {
    token: trainer,
    role: "trainer",
    body: { outcome: "coaching_ready" },
  });

  // Configure and activate coaching.
  await call("PUT", `/configurations/relationships/${rid}/draft`, {
    token: trainer,
    role: "trainer",
    body: {
      expectedVersion: 0,
      goalShort: "Nutrition adherence",
      workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
      nutrition: { mealsPerDay: 2, confirmationWindowHours: 24, photoRequirement: "none" },
      checkin: { cadence: "weekly", dueWindowHours: 48 },
      tracking: { requireBodyWeight: false, requireProgressPhotos: false, requireSessionRpe: false },
    },
  });
  await call("POST", `/configurations/relationships/${rid}/configure`, {
    token: trainer,
    role: "trainer",
    body: { expectedVersion: 1 },
  });
  await call("POST", `/configurations/relationships/${rid}/activate`, {
    token: trainer,
    role: "trainer",
    body: { expectedVersion: 1 },
  });

  // Publish a plan whose two meals both open from midnight, so both are loggable all day.
  const meal = (order: number, name: string, mealType: string, localTime: string) => ({
    id: randomUUID(),
    order,
    name,
    mealType,
    applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
    localTime,
    scheduleHint: name,
    instructions: "Home-cooked, as usual",
    photoRequired: false,
  });
  const plan = await call<{ plan: { id: string }; version: { id: string; recordVersion: number } }>(
    "POST",
    `/plans/relationships/${rid}`,
    {
      token: trainer,
      role: "trainer",
      body: {
        title: "Nutrition foundation",
        content: {
          workoutDays: [{ id: randomUUID(), order: 1, name: "Day A", exercises: [] }],
          mealPrescriptions: [
            meal(1, "Breakfast", "breakfast", "00:00"),
            meal(2, "Lunch", "lunch", "00:00"),
          ],
        },
      },
    },
  );
  await call("POST", `/plans/${plan.plan.id}/versions/${plan.version.id}/publish`, {
    token: trainer,
    role: "trainer",
    body: { expectedRecordVersion: plan.version.recordVersion, mode: "immediate" },
  });
  const today = localDateOf(invite.createdAt);
  const generated = await call<{
    assignments: Array<{ id: string; localDate: string; mealName: string }>;
  }>("POST", `/meals/relationships/${rid}/assignments/generate`, {
    token: trainer,
    role: "trainer",
    body: { fromDate: today, toDate: today },
  });
  const todays = generated.assignments.filter((a) => a.localDate === today);
  const breakfast = todays.find((a) => a.mealName === "Breakfast");
  const lunch = todays.find((a) => a.mealName === "Lunch");
  if (!breakfast || !lunch) throw new Error("fresh client setup: today's meals were not generated");

  // The coach logs today's meals: breakfast skipped, lunch changed.
  await call("PUT", `/meals/compliance/${breakfast.id}/${today}`, {
    token: trainer,
    role: "trainer",
    body: { outcome: "skipped" },
  });
  await call("PUT", `/meals/compliance/${lunch.id}/${today}`, {
    token: trainer,
    role: "trainer",
    body: { outcome: "modified", deviationKind: "substitute", notes: "Had poha instead" },
  });

  return { relationshipId: rid, displayName, firstName };
}
