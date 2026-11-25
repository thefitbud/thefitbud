/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { BuilderLayout, type BuilderMode } from "./BuilderLayout";

afterEach(() => {
  cleanup();
});

/**
 * The props W13-4 (check-in form builder) relies on. Adding props is fine;
 * removing or renaming one fails this type check.
 */
const legacyProps: Required<ComponentProps<typeof BuilderLayout>> = {
  mode: "wide",
  topbar: <button type="button">Library</button>,
  banner: <p>Banner</p>,
  left: <p>Left pane</p>,
  center: <p>Canvas</p>,
  right: <p>Properties</p>,
  overlay: <aside data-testid="overlay">Drawer</aside>,
  smallScreen: <p>Read-only summary</p>,
  footer: <p>Footer</p>,
};

function renderMode(mode: BuilderMode, over: Partial<typeof legacyProps> = {}) {
  return render(<BuilderLayout {...legacyProps} {...over} mode={mode} />);
}

describe("BuilderLayout modes", () => {
  it("wide: library, canvas and properties panes fill the workspace", () => {
    renderMode("wide");
    const layout = screen.getByTestId("builder-layout");
    expect(layout.className).toContain("is-workspace");
    expect(layout.getAttribute("data-builder-mode")).toBe("wide");
    expect(screen.getByTestId("builder-pane-library").textContent).toBe("Left pane");
    expect(screen.getByTestId("builder-pane-canvas").textContent).toBe("CanvasFooter");
    expect(screen.getByTestId("builder-pane-properties").textContent).toBe("Properties");
    expect(screen.getByText("Banner")).toBeTruthy();
    expect(screen.queryByTestId("builder-small-screen")).toBeNull();
  });

  it("narrow: no library pane; the top bar's Library button and the drawer overlay render", () => {
    renderMode("narrow");
    expect(screen.getByTestId("builder-layout").className).toContain("is-workspace");
    expect(screen.queryByTestId("builder-pane-library")).toBeNull();
    expect(screen.getByTestId("builder-pane-canvas")).toBeTruthy();
    expect(screen.getByTestId("builder-pane-properties")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Library" })).toBeTruthy();
    expect(screen.getByTestId("overlay")).toBeTruthy();
  });

  it("small: read-only note and summary, no panes, not a workspace", () => {
    renderMode("small");
    const layout = screen.getByTestId("builder-layout");
    expect(layout.className).not.toContain("is-workspace");
    expect(screen.getByTestId("builder-small-screen").textContent).toMatch(
      /Open on a larger screen to edit/,
    );
    expect(screen.getByText("Read-only summary")).toBeTruthy();
    expect(screen.queryByTestId("builder-pane-canvas")).toBeNull();
    expect(screen.queryByTestId("overlay")).toBeNull();
  });

  it("optional props stay optional (banner, overlay, footer)", () => {
    render(
      <BuilderLayout
        mode="wide"
        topbar={null}
        left={null}
        center={<p>Canvas only</p>}
        right={null}
        smallScreen={null}
      />,
    );
    expect(screen.getByTestId("builder-pane-canvas").textContent).toBe("Canvas only");
    expect(document.querySelector(".builder-banners")).toBeNull();
  });
});
