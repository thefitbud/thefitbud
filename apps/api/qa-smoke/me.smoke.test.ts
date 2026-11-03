/** `/me`, the trainee profile and the public config (QT6). */
import { configResponseSchema, traineeProfileSchema } from "@fitbud/contracts";
import { describe, expect, it } from "vitest";
import { ACCOUNT_KEYS, dataOf, getData, getMe, stable } from "./helpers.js";
import { requireConfigured, sessionFor, smokeHttp } from "./run-context.js";

const http = smokeHttp();

describe("GET /me", () => {
  it.for(ACCOUNT_KEYS)("%s: the actor is the seeded account with the right role", async (key, t) => {
    const session = sessionFor(t, key);
    const account = stable.accounts[key];
    const me = await getMe(http, session);
    expect(me.userId).toBe(account.userId);
    expect(me.firebaseUid).toBe(account.firebaseUid);
    expect(me.email?.toLowerCase()).toBe(account.email);
    expect(me.permittedRoles).toContain(account.role);
    expect(me.selectedRole).toBe(account.role);
    expect(me.timezone.length).toBeGreaterThan(0);
    if (account.role === "trainer") {
      expect(me.trainerProfileId).not.toBeNull();
    } else {
      expect(me.traineeProfileId).not.toBeNull();
    }
  });
});

describe("GET /me/trainee-profile", () => {
  it.for(["ontrack", "slipping"] as const)("%s: returns the seeded display name", async (key, t) => {
    const session = sessionFor(t, key);
    const profile = await getData(http, session, "/me/trainee-profile", traineeProfileSchema);
    expect(profile.displayName).toBe(stable.accounts[key].displayName);
  });
});

describe("GET /config", () => {
  it("is public and answers the config contract", async (t) => {
    requireConfigured(t);
    const response = await http.request("GET", "/config");
    const config = dataOf(response, configResponseSchema);
    expect(config.supportEmail).toContain("@");
  });
});
