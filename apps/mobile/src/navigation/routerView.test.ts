import { describe, expect, it } from "vitest";
import type { CoachingRelationship } from "@fitbud/contracts";
import type { AppRoute } from "./resolveRoute.js";
import { routerView } from "./routerView.js";

const rel: CoachingRelationship = {
  id: "44444444-4444-4444-8444-444444444444",
  trainerUserId: "55555555-5555-4555-8555-555555555555",
  traineeUserId: "11111111-1111-4111-8111-111111111111",
  status: "active",
  onboardingStatus: "active",
  invitationId: null,
  startedAt: "2026-09-26T00:00:00.000Z",
  endedAt: null,
  createdAt: "2026-09-26T00:00:00.000Z",
  updatedAt: "2026-09-26T00:00:00.000Z",
};

// Record<AppRoute["name"], ...> makes adding a route without a case here a
// typecheck error, so the table always covers every route the union allows.
const routes: Record<AppRoute["name"], AppRoute> = {
  auth: { name: "auth" },
  loading: { name: "loading" },
  unsupported_role: { name: "unsupported_role" },
  role_select: { name: "role_select" },
  accept_invite: { name: "accept_invite" },
  intake: { name: "intake", relationshipId: rel.id },
  waiting_review: { name: "waiting_review", relationship: rel },
  trainee_shell: { name: "trainee_shell", relationship: rel },
  trainer_shell: { name: "trainer_shell" },
};

const all = Object.values(routes);
const nonAuthNonLoading = all.filter(
  (r) => r.name !== "auth" && r.name !== "loading",
);
const ERROR = "Could not reach FitBud. Check your connection.";

describe("routerView", () => {
  it.each(nonAuthNonLoading.map((r) => [r.name, r] as const))(
    "error message wins over route %s",
    (_name, route) => {
      expect(routerView(route, ERROR)).toEqual({ view: "error", message: ERROR });
    },
  );

  it("error message wins over the placeholder route AuthProvider returns when offline", () => {
    expect(routerView({ name: "unsupported_role" }, ERROR).view).toBe("error");
  });

  it("shows the auth screen, not the error screen, when on the auth route", () => {
    expect(routerView(routes.auth, ERROR)).toEqual({
      view: "route",
      route: routes.auth,
    });
  });

  it.each(all.filter((r) => r.name !== "loading").map((r) => [r.name, r] as const))(
    "with no error, route %s shows its own screen",
    (_name, route) => {
      expect(routerView(route, null)).toEqual({ view: "route", route });
      expect(routerView(route, undefined)).toEqual({ view: "route", route });
      expect(routerView(route, "")).toEqual({ view: "route", route });
    },
  );

  it("loading stays the spinner with or without an error message", () => {
    expect(routerView(routes.loading, null)).toEqual({ view: "loading" });
    expect(routerView(routes.loading, ERROR)).toEqual({ view: "loading" });
  });
});
