import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { PlanContent, PlanVersion, WorkoutDay } from "@fitbud/contracts";
import {
  PlanCompositionEditor,
  addExerciseFromLibrary,
  addFoodItemFromLibrary,
  clonePlanContent,
  isEditablePlanStatus,
  planContentError,
} from "../../components/plan-composition";
import { AssignPlanModal } from "../../components/plan/AssignPlanModal";
import { ExerciseSearchPane, FoodSearchPane } from "../templates/LibrarySearch";
import { apiClient } from "../../lib/api";

export function PlanBuilderPage() {
  const { relationshipId, planId, versionId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tab = params.get("tab") ?? "workout";
  const [version, setVersion] = useState<PlanVersion | null>(null);
  const [planTitle, setPlanTitle] = useState("");
  const [content, setContent] = useState<PlanContent | null>(null);
  const [activeDay] = useState<WorkoutDay | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [showAssign, setShowAssign] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!planId || !versionId) return;
    const [plan, v] = await Promise.all([
      apiClient.getPlan(planId),
      apiClient.getPlanVersion(planId, versionId),
    ]);
    setVersion(v);
    setPlanTitle(plan.plan.title);
    setContent(clonePlanContent(v.content));
    if (!isEditablePlanStatus(v.status)) {
      setError("Create a new version to edit this plan.");
    }
  }, [planId, versionId]);

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof ApiClientError ? err.message : "Could not load draft.");
    });
  }, [load]);

  async function save() {
    if (!planId || !versionId || !content || !version) return;
    const validation = planContentError(content);
    if (validation) {
      setError(validation);
      return;
    }
    setSaveState("saving");
    setError(null);
    try {
      const updated = await apiClient.updatePlanDraft(planId, versionId, {
        title: planTitle,
        content,
        expectedRecordVersion: version.recordVersion,
      });
      setVersion(updated);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setError(err instanceof ApiClientError ? err.message : "Could not save.");
    }
  }

  if (!planId || !versionId || !relationshipId) {
    return <p className="form-error">Missing plan route parameters.</p>;
  }

  const sections = tab === "nutrition" ? "nutrition" : tab === "workout" ? "workout" : "both";

  return (
    <section className="page plan-builder-page">
      <header className="builder-topbar">
        <div>
          <Link to={`/clients/${relationshipId}/plan`}>← Back to plan</Link>
          <h1>
            {planTitle} · Draft v{version?.versionNumber ?? "…"}
          </h1>
          <p className="muted">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Couldn't save"}
          </p>
        </div>
        <div className="button-row">
          <button type="button" className="button-secondary" onClick={() => void save()}>
            Save now
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!content || Boolean(error)}
            onClick={() => setShowAssign(true)}
          >
            Publish…
          </button>
        </div>
      </header>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {content ? (
        <div className="builder-layout">
          <aside className="builder-pane builder-days">
            <h2>Days</h2>
            <p className="muted">Mon–Sun sessions</p>
          </aside>
          <div className="builder-pane builder-main">
            <PlanCompositionEditor
              content={content}
              onChange={setContent}
              sections={sections}
              allowDuplicate
              renderWorkoutLibrary={(day) => (
                <ExerciseSearchPane
                  day={day ?? activeDay}
                  onAdd={(item) => {
                    const targetDay = day ?? activeDay;
                    if (!targetDay) return;
                    setContent((current) =>
                      current
                        ? addExerciseFromLibrary(current, targetDay.id, item)
                        : current,
                    );
                  }}
                />
              )}
              renderMealLibrary={(meal) => (
                <FoodSearchPane
                  meal={meal}
                  onAdd={(item, servingId) => {
                    if (!meal) return;
                    setContent((current) =>
                      current
                        ? addFoodItemFromLibrary(current, meal.id, item, servingId)
                        : current,
                    );
                  }}
                />
              )}
            />
          </div>
          <aside className="builder-pane builder-library">
            <h2>Library</h2>
            <p className="muted">Search v2 foods and exercises in the centre panels.</p>
          </aside>
        </div>
      ) : (
        <p className="muted">Loading builder…</p>
      )}
      {showAssign && version ? (
        <AssignPlanModal
          planId={planId}
          versionId={versionId}
          nutritionOnly={tab === "nutrition"}
          onClose={() => setShowAssign(false)}
          onAssigned={() => navigate(`/clients/${relationshipId}/plan`)}
        />
      ) : null}
    </section>
  );
}
