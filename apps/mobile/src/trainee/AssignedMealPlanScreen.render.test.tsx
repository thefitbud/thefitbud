/**
 * Assigned meal plan must not treat `unavailable` as still loading
 * (BT15, D-W4-16). The screen does not fetch; the shell does. This harness
 * is react-native-web (D-W4-17) and does not exercise the native branch.
 *
 * Z14-14: fixed header with Back top left and a compact Ask pill, no bottom
 * Back, a skeleton under the real header while loading, and the friendly load
 * error with Try again (TR-07l, TR-07l3, TR-07l4).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../test/render";
import {
  EFFECTIVE_PLAN_LOADING,
  EFFECTIVE_PLAN_UNAVAILABLE,
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

const LOAD_ERROR_TITLE = "Couldn't load your meal plan";

function renderPlan(
  planState: Parameters<typeof AssignedMealPlanScreen>[0]["planState"],
  props: Partial<Parameters<typeof AssignedMealPlanScreen>[0]> = {},
) {
  return render(
    <AssignedMealPlanScreen
      planState={planState}
      onBack={() => undefined}
      {...props}
    />,
  );
}

describe("AssignedMealPlanScreen plan state", () => {
  it("shows a skeleton under the real header only while the plan is loading", () => {
    const onBack = vi.fn();
    const onAskCoach = vi.fn();
    renderPlan(EFFECTIVE_PLAN_LOADING, { onBack, onAskCoach, coachName: "Rahul Verma" });
    expect(screen.getByTestId("assigned-plan-skeleton")).toBeTruthy();
    expect(screen.queryByText(LOAD_ERROR_TITLE)).toBeNull();

    // Back and Ask work at once, before the plan arrives (TR-07l3).
    screen.getByRole("button", { name: "Back to Diet" }).click();
    expect(onBack).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Ask Rahul about this plan" }).click();
    expect(onAskCoach).toHaveBeenCalledTimes(1);
  });

  it("does not spin when the plan is unavailable, and keeps the header", () => {
    const onRetryPlan = vi.fn();
    renderPlan(EFFECTIVE_PLAN_UNAVAILABLE, { onRetryPlan });

    expect(screen.queryByTestId("assigned-plan-skeleton")).toBeNull();
    expect(screen.getByText(LOAD_ERROR_TITLE)).toBeTruthy();
    expect(
      screen.getByText("Something went wrong on our side. Your Diet tab still works."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to Diet" })).toBeTruthy();

    screen.getByLabelText("Try again").click();
    expect(onRetryPlan).toHaveBeenCalledTimes(1);
  });

  it("shows the empty plan copy when the coach has published nothing", () => {
    renderPlan(effectivePlanStateFor(noPlan));
    expect(screen.queryByTestId("assigned-plan-skeleton")).toBeNull();
    expect(screen.queryByText(LOAD_ERROR_TITLE)).toBeNull();
    expect(
      screen.getByText(
        "Meals from your coach's plan appear here when a plan is published.",
      ),
    ).toBeTruthy();
  });

  it("has the header back and a compact Ask action, and no bottom Back", () => {
    renderPlan(effectivePlanStateFor(noPlan), {
      coachName: "Rahul Verma",
      onAskCoach: () => undefined,
    });
    // Exactly one way back: the header's.
    expect(screen.getAllByRole("button", { name: /back/i })).toHaveLength(1);
    expect(screen.getByText("Ask Rahul")).toBeTruthy();
    expect(screen.queryByText("Ask Rahul about this plan")).toBeNull();
    // `insetTabBar` no longer adds a band, and passing it changes nothing.
    expect(screen.getByTestId("assigned-plan-header")).toBeTruthy();
  });
});
