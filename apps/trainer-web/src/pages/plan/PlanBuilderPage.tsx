import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { ClientWorkspace, PlanContent, PlanVersion } from "@fitbud/contracts";
import { PlanBuilder, type BuilderTab } from "../../components/builder/PlanBuilder";
import type { PublishIssues } from "../../components/builder/validation";
import { AssignPlanModal } from "../../components/plan/AssignPlanModal";
import { ErrorState, LoadingBlock } from "../../components/StatePanels";
import { isEditablePlanStatus } from "../../components/plan-composition";
import { useAuth } from "../../auth/AuthProvider";
import { useOnline } from "../../hooks/useOnline";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { resolveTraineeTimezone } from "../../lib/trainee-timezone";
import "../../styles/plan.css";

type Loaded = {
  planTitle: string;
  version: PlanVersion;
  workspace: ClientWorkspace;
};

export function PlanBuilderPage() {
  const { relationshipId = "", planId = "", versionId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const online = useOnline();
  const tab: BuilderTab = params.get("tab") === "nutrition" ? "nutrition" : "workout";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<{
    title: string;
    content: PlanContent;
    issues: PublishIssues;
  } | null>(null);
  const recordVersion = useRef(0);
  const planPath = `/clients/${relationshipId}/plan`;

  const load = useCallback(async () => {
    setError(null);
    setLoaded(null);
    try {
      const [plan, version, workspace] = await Promise.all([
        apiClient.getPlan(planId),
        apiClient.getPlanVersion(planId, versionId),
        apiClient.getClientWorkspace(relationshipId),
      ]);
      recordVersion.current = version.recordVersion;
      setLoaded({ planTitle: plan.plan.title, version, workspace });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't load this draft.");
    }
  }, [planId, versionId, relationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (title: string, content: PlanContent) => {
      const updated = await apiClient.updatePlanDraft(planId, versionId, {
        expectedRecordVersion: recordVersion.current,
        title,
        content,
      });
      recordVersion.current = updated.recordVersion;
    },
    [planId, versionId],
  );

  if (!planId || !versionId || !relationshipId) {
    return <ErrorState message="This plan link is incomplete." screenId="TW-13" />;
  }
  if (error) {
    return (
      <section className="page plan-builder-page" data-testid="screen-TW-13">
        <ErrorState message={error} onRetry={() => void load()} screenId="TW-13" />
      </section>
    );
  }
  if (!loaded) {
    return (
      <section className="page plan-builder-page" data-testid="screen-TW-13">
        <LoadingBlock label="Loading the plan builder…" />
      </section>
    );
  }

  const { version, workspace, planTitle } = loaded;
  const header = workspace.header;
  const traineeTimezone = resolveTraineeTimezone(header).timezone;
  const configuration = workspace.configuration.configuration;
  const ended = header.onboardingStatus === "ended";
  const editable = isEditablePlanStatus(version.status);
  const effective = workspace.plan;
  const activePlan =
    effective.plan && effective.version && effective.version.id !== version.id
      ? {
          title: effective.plan.title,
          versionNumber: effective.version.versionNumber,
          content: effective.version.content,
        }
      : null;

  function isNutritionOnly(content: PlanContent): boolean {
    if (!activePlan) return false;
    const sameWorkouts =
      JSON.stringify(activePlan.content.workoutDays) === JSON.stringify(content.workoutDays);
    if (!sameWorkouts) return false;
    return (
      tab === "nutrition" ||
      JSON.stringify(activePlan.content.mealPrescriptions) !==
        JSON.stringify(content.mealPrescriptions)
    );
  }

  return (
    <>
      <PlanBuilder
        key={`${versionId}`}
        backTo={planPath}
        backLabel="Back to plan"
        initialTitle={planTitle}
        initialContent={version.content}
        statusLabel={`Draft v${version.versionNumber}`}
        tab={tab}
        onTabChange={(next) => setParams({ tab: next }, { replace: true })}
        save={save}
        readOnly={!editable || ended}
        readOnlyNote={
          !editable ? (
            <>
              Create a new version to edit this plan.{" "}
              <Link to={planPath}>Back to plan</Link>
            </>
          ) : ended ? (
            "Coaching has ended. This plan is read-only."
          ) : undefined
        }
        online={online}
        clientName={header.traineeDisplayName}
        expectations={
          configuration
            ? {
                sessionsPerWeek: configuration.workout.sessionsPerWeek,
                mealsPerDay: configuration.nutrition.mealsPerDay,
                photoRequirement: configuration.nutrition.photoRequirement,
              }
            : null
        }
        loadPreview={async () => (await apiClient.previewPlanVersion(planId, versionId)).content}
        onPublish={(args) => setPublishing(args)}
        screenId={tab === "nutrition" ? "screen-TW-14" : "screen-TW-13"}
      />
      {publishing ? (
        <AssignPlanModal
          relationshipId={relationshipId}
          planId={planId}
          versionId={versionId}
          content={publishing.content}
          traineeName={header.traineeDisplayName}
          traineeTimezone={traineeTimezone}
          trainerTimezone={me?.timezone ?? null}
          activePlan={activePlan}
          nutritionOnly={isNutritionOnly(publishing.content)}
          issues={publishing.issues}
          ended={ended}
          online={online}
          onClose={() => setPublishing(null)}
          onAssigned={() => {
            if (version.creationSource === "adjustment") {
              void apiClient
                .createIntervention(
                  relationshipId,
                  {
                    kind: "plan_adjustment",
                    summary: `Published plan adjustment v${version.versionNumber}`,
                    resultingPlanVersionId: versionId,
                  },
                  createIdempotencyKey(),
                )
                .catch(() => undefined);
            }
            navigate(planPath);
          }}
        />
      ) : null}
    </>
  );
}
