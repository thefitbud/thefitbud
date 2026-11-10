import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCivilDate, labelFor } from "@fitbud/core";
import type { WeekDayState } from "@fitbud/contracts";

vi.mock("react-native", () => ({
  StyleSheet: {
    create: <T,>(styles: T) => styles,
    flatten: (style: unknown) => style,
  },
  Platform: {
    select: (options: { default?: string }) => options.default,
  },
  View: () => null,
  Text: () => null,
}));

const { WeeklyConsistency } = await import("./WeeklyConsistency.js");

function accessibilityLabels(node: ReactNode): string[] {
  if (
    node == null ||
    typeof node === "boolean" ||
    typeof node === "string" ||
    typeof node === "number"
  ) {
    return [];
  }
  if (Array.isArray(node)) return node.flatMap(accessibilityLabels);
  if (!isValidElement(node)) return [];
  const props = node.props as {
    accessibilityLabel?: unknown;
    children?: ReactNode;
  };
  const own =
    typeof props.accessibilityLabel === "string" ? [props.accessibilityLabel] : [];
  return [...own, ...accessibilityLabels(props.children)];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WeeklyConsistency spoken day labels", () => {
  it("says a civil date and the week-day label, never an ISO date or raw state", () => {
    const days: Array<{ date: string; state: WeekDayState }> = [
      { date: "2026-10-21", state: "due" },
      { date: "2026-10-20", state: "partial" },
      { date: "2026-10-19", state: "missed" },
      { date: "2026-10-22", state: "future" },
      { date: "2025-10-21", state: "done" },
    ];
    const labels = accessibilityLabels(
      WeeklyConsistency({
        workoutCompleted: 2,
        workoutAssigned: 4,
        mealsLogged: 5,
        mealsAssigned: 6,
        days,
      }),
    );
    expect(labels).toEqual([
      "Wed 21 Oct, To do",
      "Tue 20 Oct, Partial",
      "Mon 19 Oct, Missed",
      "Thu 22 Oct, Upcoming",
      "Tue 21 Oct 2025, Done",
    ]);
    for (const day of days) {
      expect(labels).toContain(
        `${formatCivilDate(day.date)}, ${labelFor("week_day_state", day.state)}`,
      );
      expect(labels.join(" ")).not.toContain(day.date);
      expect(labels).not.toContain(day.state);
    }
  });
});
