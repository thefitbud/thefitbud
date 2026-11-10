/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReadOnlyField, ReadOnlyFieldList } from "./ReadOnlyField";

afterEach(() => cleanup());

describe("ReadOnlyField (Z7-13, frame 179 / DS7)", () => {
  it("renders the label and a plain value, with no input box", () => {
    const { container } = render(
      <ReadOnlyFieldList label="Coaching setup">
        <ReadOnlyField label="Short goal" value="Lose 4 kg before Diwali" />
      </ReadOnlyFieldList>,
    );
    expect(screen.getByText("Short goal").tagName).toBe("DT");
    expect(screen.getByText("Lose 4 kg before Diwali").tagName).toBe("DD");
    expect(container.querySelectorAll("input, select, textarea")).toHaveLength(0);
    expect(container.querySelector("[disabled]")).toBeNull();
  });

  it("names the value by its label alone", () => {
    render(
      <ReadOnlyFieldList>
        <ReadOnlyField label="Due on" value="Tue 17 Nov" />
        <ReadOnlyField label="Goal description" value="Rebuild strength." wide />
      </ReadOnlyFieldList>,
    );
    expect(screen.getByRole("definition", { name: "Due on" }).textContent).toBe(
      "Tue 17 Nov",
    );
    expect(
      screen.getByRole("definition", { name: "Goal description" }).textContent,
    ).toBe("Rebuild strength.");
  });

  it("gives each field its own label id and spans both columns when wide", () => {
    const { container } = render(
      <ReadOnlyFieldList>
        <ReadOnlyField label="Workouts" value="3 a week" />
        <ReadOnlyField label="Meals" value="4 a day" />
        <ReadOnlyField label="Goal description" value="Long text" wide />
      </ReadOnlyFieldList>,
    );
    const ids = Array.from(container.querySelectorAll("dt")).map((el) => el.id);
    expect(new Set(ids).size).toBe(3);
    expect(container.querySelectorAll(".readonly-field-wide")).toHaveLength(1);
  });
});
