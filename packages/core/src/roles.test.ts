import { describe, expect, it } from "vitest";
import { resolveSelectedRole, rolesAllowedForSurface } from "./index.js";

describe("roles", () => {
  it("limits trainer web to trainer role", () => {
    expect(rolesAllowedForSurface("trainer_web")).toEqual(["trainer"]);
  });

  it("auto-selects when only one permitted role matches the surface", () => {
    expect(
      resolveSelectedRole({
        permittedRoles: ["trainee"],
        requestedRole: null,
        surface: "mobile",
      }),
    ).toBe("trainee");
  });

  it("rejects a requested role not permitted for the surface", () => {
    expect(
      resolveSelectedRole({
        permittedRoles: ["trainer", "trainee"],
        requestedRole: "trainee",
        surface: "trainer_web",
      }),
    ).toBeNull();
  });
});
