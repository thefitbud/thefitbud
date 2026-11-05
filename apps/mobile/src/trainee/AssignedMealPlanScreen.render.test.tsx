/**
 * Assigned meal plan must not treat `unavailable` as still loading
 * (BT15, D-W4-16). The screen does not fetch; the shell does. This harness
 * is react-native-web (D-W4-17) and does not exercise the native branch.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../test/render";
import {
  EFFECTIVE_PLAN_LOADING,
  EFFECTIVE_PLAN_UNAVAILABLE,
  PLAN_UNAVAILABLE_MESSAGE,
  effectivePlanStateFor,
} from "./TodayTab";
import { AssignedMealPlanScreen } from "./AssignedMealPlanScreen";
import {
  effectivePlanResponseSchema,
  type EffectivePlanResponse,
} from "@fitbud/contracts";

const noPlan: EffectivePlanResponse = effectivePlanResponseSchema.parse({
  plan: null,
  version: null,
});

function renderPlan(
  planState: Parameters<typeof AssignedMealPlanScreen>[0]["planState"],
  onRetryPlan?: () => void,
) {
  return render(
    <AssignedMealPlanScreen
      planState={planState}
      onRetryPlan={onRetryPlan}
      onBack={() => undefined}
    />,
  );
}

describe("AssignedMealPlanScreen plan state", () => {
  it("shows a loading line only while the plan is loading", () => {
    renderPlan(EFFECTIVE_PLAN_LOADING);
    expect(screen.getByText("Loading meal plan…")).toBeTruthy();
    expect(screen.queryByText(PLAN_UNAVAILABLE_MESSAGE)).toBeNull();
  });

  it("does not spin when the plan is unavailable", () => {
    const onRetryPlan = vi.fn();
    renderPlan(EFFECTIVE_PLAN_UNAVAILABLE, onRetryPlan);

    expect(screen.queryByText("Loading meal plan…")).toBeNull();
    expect(screen.getByText(PLAN_UNAVAILABLE_MESSAGE)).toBeTruthy();

    screen.getByLabelText("Try again").click();
    expect(onRetryPlan).toHaveBeenCalledTimes(1);
  });

  it("shows the empty plan copy when the coach has published nothing", () => {
    renderPlan(effectivePlanStateFor(noPlan));
    expect(screen.queryByText("Loading meal plan…")).toBeNull();
    expect(screen.queryByText(PLAN_UNAVAILABLE_MESSAGE)).toBeNull();
    expect(
      screen.getByText(
        "Meals from your coach's plan appear here when a plan is published.",
      ),
    ).toBeTruthy();
  });
});
