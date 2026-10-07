import type { Role, Surface } from "@fitbud/contracts";

/** Surfaces that may use a given role. */
export function rolesAllowedForSurface(surface: Surface): readonly Role[] {
  switch (surface) {
    case "trainer_web":
      return ["trainer"];
    case "mobile":
      return ["trainer", "trainee"];
    default: {
      const _exhaustive: never = surface;
      return _exhaustive;
    }
  }
}

export function isRolePermittedOnSurface(role: Role, surface: Surface): boolean {
  return rolesAllowedForSurface(surface).includes(role);
}

/**
 * Resolve selected role for an actor.
 * Returns null when the client has not selected a role yet and more than one
 * permitted role exists for the surface.
 */
export function resolveSelectedRole(input: {
  permittedRoles: readonly Role[];
  requestedRole: Role | null | undefined;
  surface: Surface;
}): Role | null {
  const allowed = input.permittedRoles.filter((role) =>
    isRolePermittedOnSurface(role, input.surface),
  );

  if (allowed.length === 0) {
    return null;
  }

  if (input.requestedRole) {
    return allowed.includes(input.requestedRole) ? input.requestedRole : null;
  }

  if (allowed.length === 1) {
    return allowed[0] ?? null;
  }

  return null;
}
