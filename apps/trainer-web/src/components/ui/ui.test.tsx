/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Button } from "./Button";
import { LibraryThumb } from "./LibraryThumb";
import { Modal } from "./Modal";
import { Seg } from "./Seg";
import { Toggle } from "./Toggle";

afterEach(() => {
  cleanup();
});

describe("ui kit", () => {
  it("paints the primary button with the navy brand, not coach", () => {
    render(<Button>New template</Button>);
    expect(screen.getByRole("button", { name: "New template" }).className).toContain("ui-btn-primary");
  });

  it("shows the drawing when an exercise has one", () => {
    render(<LibraryThumb name="Goblet squat" thumbnailUrl="/library/exercise-media/abc?exp=1&sig=x" />);
    const tile = screen.getByTestId("library-thumb-exercise");
    expect(tile.getAttribute("data-thumb")).toBe("image");
    const img = tile.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/\/library\/exercise-media\/abc/);
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("loading")).toBe("lazy");
  });

  it("falls back to a neutral dumbbell tile with no drawing or a failed image", () => {
    const { unmount } = render(<LibraryThumb name="Plank" thumbnailUrl={null} />);
    let tile = screen.getByTestId("library-thumb-exercise");
    expect(tile.getAttribute("data-thumb")).toBe("fallback");
    expect(tile.getAttribute("style") ?? "").not.toContain("gradient");
    expect(tile.textContent).toBe("");
    expect(tile.getAttribute("aria-hidden")).toBe("true");
    unmount();
    render(<LibraryThumb name="Squat" thumbnailUrl="/library/exercise-media/bad?exp=1&sig=x" />);
    tile = screen.getByTestId("library-thumb-exercise");
    fireEvent.error(tile.querySelector("img") as HTMLImageElement);
    expect(tile.getAttribute("data-thumb")).toBe("fallback");
    expect(tile.querySelector("img")).toBeNull();
  });

  it("changes the segmented value", () => {
    const onChange = vi.fn();
    render(
      <Seg
        aria-label="Range"
        value="6wk"
        onChange={onChange}
        options={[
          { value: "6wk", label: "6 wk" },
          { value: "3mo", label: "3 mo" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "3 mo" }));
    expect(onChange).toHaveBeenCalledWith("3mo");
  });

  it("toggles", () => {
    const onChange = vi.fn();
    render(
      <Toggle checked={false} onChange={onChange}>
        Off
      </Toggle>,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Off" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("closes a modal on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Use template" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("web tokens", () => {
  it("does not alias indigo to coach ink", () => {
    const css = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
    expect(css).not.toMatch(/--indigo\s*:/);
    expect(css).not.toMatch(/--brand-indigo\s*:/);
  });

  it("keeps kit font sizes on the 8-step scale", () => {
    const css = readFileSync(resolve(__dirname, "../../styles/kit.css"), "utf8");
    const sizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]));
    const shorthand = [...css.matchAll(/font:\s*\d+\s+(\d+)px/g)].map((match) => Number(match[1]));
    const allowed = new Set([12, 13, 14, 15, 17, 19, 20, 24, 28]);
    for (const size of [...sizes, ...shorthand]) {
      expect(allowed.has(size), `font size ${size}`).toBe(true);
    }
    expect(css).toContain("--panel-w");
    expect(css).not.toMatch(/width:\s*480px/);
  });
});
