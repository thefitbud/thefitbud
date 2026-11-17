import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCivilDate, labelFor } from "@fitbud/core";
import type { DateNavigatorDay } from "./DateNavigator.js";

vi.mock("react-native", () => ({
  StyleSheet: {
    create: <T,>(styles: T) => styles,
    flatten: (style: unknown) => style,
  },
  Platform: {
    select: (options: { default?: string }) => options.default,
  },
  View: () => null,
  Pressable: () => null,
  ScrollView: () => null,
  Text: () => null,
}));

const { DateNavigator } = await import("./DateNavigator.js");

const STATES = [
  "done",
  "partial",
  "due",
  "open",
  "rest",
  "future",
  "unknown",
] as const satisfies readonly DateNavigatorDay["state"][];

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

function day(state: DateNavigatorDay["state"], index: number): DateNavigatorDay {
  return {
    localDate: `2026-10-${String(12 + index).padStart(2, "0")}`,
    weekdayLabel: "Wed",
    dayLabel: String(12 + index),
    state,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DateNavigator spoken day labels", () => {
  it("says a civil date and labelFor text, never a raw state or ISO date", () => {
    const days = STATES.map((state, index) => day(state, index));
    const labels = accessibilityLabels(
      DateNavigator({
        days,
        selectedDate: "2026-10-14",
        todayDate: "2026-10-12",
        onSelect: () => {},
        onToday: () => {},
      }),
    );
    expect(labels).toContain("Go to today");
    // The week chevrons are controls, not days (Z10-20).
    expect(labels).toContain("Previous week");
    expect(labels).toContain("Next week");
    const dayLabels = labels.filter(
      (label) =>
        label !== "Go to today" &&
        label !== "Previous week" &&
        label !== "Next week",
    );
    expect(dayLabels).toEqual([
      "Mon 12 Oct, Done",
      "Tue 13 Oct, Partial",
      "Wed 14 Oct, To do",
      "Thu 15 Oct, Missed",
      "Fri 16 Oct, Rest",
      "Sat 17 Oct, Upcoming",
      "Sun 18 Oct, State not known",
    ]);
    for (const [index, state] of STATES.entries()) {
      const date = days[index]!.localDate;
      expect(dayLabels[index]).toBe(
        `${formatCivilDate(date)}, ${
          state === "open"
            ? labelFor("week_day_state", "missed")
            : state === "unknown"
              ? "State not known"
              : labelFor("week_day_state", state)
        }`,
      );
      expect(dayLabels[index]).not.toContain(date);
    }
  });
});

/** Every ring (a non-transparent border) on the element tree, with its day's label. */
function ringBorders(
  node: ReactNode,
  label: string | null = null,
  out: Array<{ label: string | null; borderColor: unknown }> = [],
) {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) ringBorders(child, label, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const props = node.props as {
    accessibilityLabel?: string;
    style?: unknown;
    children?: ReactNode;
  };
  const here =
    typeof props.accessibilityLabel === "string" ? props.accessibilityLabel : label;
  const styles = (Array.isArray(props.style) ? props.style : [props.style]).filter(
    (style): style is Record<string, unknown> =>
      Boolean(style) && typeof style === "object",
  );
  for (const style of styles) {
    if ("borderColor" in style && style.borderColor !== "transparent") {
      out.push({ label: here, borderColor: style.borderColor });
    }
  }
  ringBorders(props.children, here, out);
  return out;
}

describe("DateNavigator rings (TR-06a/c, Z12-40)", () => {
  it("rings today in coral and a selected other day in ink; nothing else", async () => {
    const { themes } = await import("./theme.js");
    const rings = ringBorders(
      DateNavigator({
        days: [day("done", 0), day("done", 1), day("future", 2)],
        selectedDate: "2026-10-13",
        todayDate: "2026-10-12",
        onSelect: () => {},
        onToday: () => {},
        showTodayPill: false,
      }),
    );
    expect(rings).toEqual([
      { label: "Mon 12 Oct, Done", borderColor: themes.light.colors.coralStrong },
      { label: "Tue 13 Oct, Done", borderColor: themes.light.colors.ink },
    ]);
  });

  it("keeps the coral ring on today when today is selected (TR-06a)", async () => {
    const { themes } = await import("./theme.js");
    const rings = ringBorders(
      DateNavigator({
        days: [day("done", 0), day("future", 1)],
        selectedDate: "2026-10-12",
        todayDate: "2026-10-12",
        onSelect: () => {},
        onToday: () => {},
      }),
    );
    expect(rings).toEqual([
      { label: "Mon 12 Oct, Done", borderColor: themes.light.colors.coralStrong },
    ]);
  });
});
