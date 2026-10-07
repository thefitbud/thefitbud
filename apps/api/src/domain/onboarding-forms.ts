import { and, eq, inArray, or } from "drizzle-orm";
import { canTrainerReadOnboardingTemplate, latestOnboardingFormVersion, resolveOnboardingForm } from "@fitbud/core";
import type { Db } from "../db/client";
import {
  clientInvitations,
  coachingRelationships,
  onboardingFormTemplates,
  onboardingFormVersions,
} from "../db/schema";

export async function resolveDefaultOnboardingVersion(
  db: Db,
  trainerUserId: string,
) {
  const rows = await db
    .select()
    .from(onboardingFormVersions)
    .where(
      or(
        eq(onboardingFormVersions.scope, "global"),
        and(
          eq(onboardingFormVersions.scope, "trainer"),
          eq(onboardingFormVersions.trainerUserId, trainerUserId),
        ),
      ),
    );
  return resolveOnboardingForm(rows, trainerUserId);
}

export async function latestStoredOnboardingVersion(db: Db, templateId: string) {
  const rows = await db
    .select()
    .from(onboardingFormVersions)
    .where(eq(onboardingFormVersions.templateId, templateId));
  return latestOnboardingFormVersion(rows, templateId);
}

/**
 * Pin a version once, at invitation creation.
 * An explicit template id uses that template's latest version and does not copy it.
 * An omitted id runs the existing resolver once.
 */
export async function versionIdForNewInvitation(
  db: Db,
  trainerUserId: string,
  templateId: string | undefined,
): Promise<
  | { ok: true; versionId: string }
  | { ok: false; code: "TEMPLATE_NOT_FOUND" | "ONBOARDING_FORM_MISSING" }
> {
  if (templateId) {
    const templates = await db
      .select()
      .from(onboardingFormTemplates)
      .where(eq(onboardingFormTemplates.id, templateId))
      .limit(1);
    const template = templates[0];
    if (!template || !canTrainerReadOnboardingTemplate(template, trainerUserId)) {
      return { ok: false, code: "TEMPLATE_NOT_FOUND" };
    }
    const latest = await latestStoredOnboardingVersion(db, template.id);
    if (!latest) {
      return { ok: false, code: "ONBOARDING_FORM_MISSING" };
    }
    return { ok: true, versionId: latest.id };
  }

  const resolved = await resolveDefaultOnboardingVersion(db, trainerUserId);
  if (!resolved) {
    return { ok: false, code: "ONBOARDING_FORM_MISSING" };
  }
  return { ok: true, versionId: resolved.id };
}

export async function pinnedOnboardingVersionForRelationship(
  db: Db,
  relationship: { invitationId: string | null },
) {
  if (!relationship.invitationId) {
    return null;
  }
  const invitations = await db
    .select()
    .from(clientInvitations)
    .where(eq(clientInvitations.id, relationship.invitationId))
    .limit(1);
  const invitation = invitations[0];
  if (!invitation) {
    return null;
  }
  const versions = await db
    .select()
    .from(onboardingFormVersions)
    .where(eq(onboardingFormVersions.id, invitation.onboardingFormTemplateVersionId))
    .limit(1);
  return versions[0] ?? null;
}

/** Versions of this template pinned to invitations the trainee accepted. */
export async function traineePinnedVersionsForTemplate(
  db: Db,
  traineeUserId: string,
  templateId: string,
) {
  const relationships = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.traineeUserId, traineeUserId));
  const invitationIds = relationships
    .map((relationship) => relationship.invitationId)
    .filter((id): id is string => id != null);
  if (invitationIds.length === 0) {
    return [];
  }
  const invitations = await db
    .select()
    .from(clientInvitations)
    .where(inArray(clientInvitations.id, invitationIds));
  const versionIds = invitations.map(
    (invitation) => invitation.onboardingFormTemplateVersionId,
  );
  if (versionIds.length === 0) {
    return [];
  }
  return db
    .select()
    .from(onboardingFormVersions)
    .where(
      and(
        inArray(onboardingFormVersions.id, versionIds),
        eq(onboardingFormVersions.templateId, templateId),
      ),
    );
}
