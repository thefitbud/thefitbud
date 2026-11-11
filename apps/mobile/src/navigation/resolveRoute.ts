import type {
  CoachingRelationship,
  MeResponse,
  Role,
} from "@fitbud/contracts";
import { rolesAllowedForSurface } from "@fitbud/core";

export type AppRoute =
  | { name: "auth" }
  | { name: "loading" }
  | { name: "unsupported_role" }
  | { name: "role_select" }
  | { name: "accept_invite" }
  | { name: "intake"; relationshipId: string }
  | { name: "waiting_review"; relationship: CoachingRelationship }
  | { name: "trainee_shell"; relationship: CoachingRelationship }
  | { name: "trainer_shell" };

/**
 * Resolve mobile navigation from auth + /me + selected role + relationships.
 * Trainer mode (D7) and trainee mode share this entry point.
 */
export function resolveAppRoute(input: {
  accessToken: string | null;
  bootstrapping: boolean;
  me: MeResponse | null;
  selectedRole: Role | null;
  /** True when /me returned 401 (no FitBud user yet) while a token is held. */
  needsAccountLink: boolean;
  relationships: CoachingRelationship[] | null;
}): AppRoute {
  if (!input.accessToken) {
    return { name: "auth" };
  }

  if (input.bootstrapping) {
    return { name: "loading" };
  }

  if (input.needsAccountLink) {
    return { name: "accept_invite" };
  }

  if (!input.me) {
    return { name: "auth" };
  }

  const mobileRoles = mobilePermittedRoles(input.me.permittedRoles);
  if (mobileRoles.length === 0) {
    return { name: "unsupported_role" };
  }

  if (!input.selectedRole || !mobileRoles.includes(input.selectedRole)) {
    if (mobileRoles.length > 1) {
      return { name: "role_select" };
    }
    // Sole role should have been auto-selected by AuthProvider.
    return { name: "loading" };
  }

  if (input.selectedRole === "trainer") {
    return { name: "trainer_shell" };
  }

  // Trainee path — relationships required for shell / onboarding.
  if (input.relationships === null) {
    return { name: "loading" };
  }

  const pending = input.relationships.find(
    (relationship) => relationship.onboardingStatus === "onboarding_pending",
  );
  if (pending) {
    return { name: "intake", relationshipId: pending.id };
  }

  const submitted = input.relationships.find(
    (relationship) => relationship.onboardingStatus === "onboarding_submitted",
  );
  if (submitted) {
    return { name: "waiting_review", relationship: submitted };
  }

  const ready = input.relationships.find(
    (relationship) =>
      relationship.onboardingStatus === "coaching_ready" ||
      relationship.onboardingStatus === "active",
  );
  if (ready) {
    return { name: "trainee_shell", relationship: ready };
  }

  const ended = input.relationships.find(
    (relationship) =>
      relationship.status === "ended" ||
      relationship.onboardingStatus === "ended",
  );
  if (ended) {
    return { name: "trainee_shell", relationship: ended };
  }

  return { name: "accept_invite" };
}

export function mobilePermittedRoles(
  permittedRoles: readonly Role[],
): Role[] {
  const allowed = rolesAllowedForSurface("mobile");
  return permittedRoles.filter((role) => allowed.includes(role));
}

/**
 * Auto-select when exactly one mobile-permitted role exists.
 * Dual-role users must choose explicitly (role_select).
 */
export function selectInitialMobileRole(
  permittedRoles: readonly Role[],
): Role | null {
  const mobileRoles = mobilePermittedRoles(permittedRoles);
  if (mobileRoles.length === 1) {
    return mobileRoles[0] ?? null;
  }
  return null;
}

/** Link kinds that open a trainer-only screen (coach view). */
const TRAINER_LINK_KINDS: ReadonlySet<string> = new Set([
  "exception",
  "ask",
  "client",
]);

/**
 * Link kinds that open a trainee-only screen (client view). `reactivate` goes
 * to the trainee (the confirm route lives in TraineeShell). `checkin` and
 * `plan` open for both roles, so they are in neither set: no prompt.
 */
const TRAINEE_LINK_KINDS: ReadonlySet<string> = new Set([
  "meal",
  "workout",
  "today",
  "progress",
  "note",
  "reactivate",
]);

/** Which mobile role a link needs, or null when the kind opens for both roles or is unknown. */
export function roleForLinkKind(kind: string): Extract<Role, "trainer" | "trainee"> | null {
  if (TRAINER_LINK_KINDS.has(kind)) return "trainer";
  if (TRAINEE_LINK_KINDS.has(kind)) return "trainee";
  return null;
}

/**
 * Frame 61: a link that needs the other role asks to switch instead of failing
 * silently. Returns the role to offer, or null when the link already fits the
 * selected role, or the account has no mobile access to the role it needs
 * (nothing to offer).
 */
export function roleSwitchPrompt(input: {
  selectedRole: Role | null;
  permittedRoles: readonly Role[];
  linkKind: string;
}): { targetRole: Extract<Role, "trainer" | "trainee"> } | null {
  const needed = roleForLinkKind(input.linkKind);
  if (!needed || !input.selectedRole || needed === input.selectedRole) {
    return null;
  }
  if (!mobilePermittedRoles(input.permittedRoles).includes(needed)) {
    return null;
  }
  return { targetRole: needed };
}
