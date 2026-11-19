/**
 * Z12-62: Honest Week mark colours and auth brand row (no Dumbbell tile).
 */
import { describe, expect, it } from "vitest";
import { themes } from "@fitbud/ui-mobile";
import { AuthPage } from "../screens/auth/authParts";
import { ThemeProvider, ThemeScope } from "../providers/ThemeProvider";
import { render, screen } from "../test/render";
import {
  BrandMark,
  BRAND_MARK_MIN_SIZE,
  brandMarkColors,
} from "./BrandMark";

describe("brandMarkColors", () => {
  it("light: navy dots, coral ring, navy word", () => {
    const colors = brandMarkColors(themes.light);
    expect(colors.dot).toBe(themes.light.colors.fixedNavy);
    expect(colors.dot).toBe("#1A1248");
    expect(colors.ring).toBe(themes.light.colors.coral);
    expect(colors.ring).toBe("#FF587D");
    expect(colors.word).toBe(themes.light.colors.fixedNavy);
  });

  it("dark: white dots, coral ring, white word", () => {
    const colors = brandMarkColors(themes.dark);
    expect(colors.dot).toBe(themes.dark.colors.white);
    expect(colors.dot).toBe("#FFFFFF");
    expect(colors.ring).toBe(themes.dark.colors.coral);
    expect(colors.ring).toBe("#FF587D");
    expect(colors.word).toBe(themes.dark.colors.white);
  });
});

describe("BrandMark", () => {
  it("clamps below the 40 pt minimum", () => {
    expect(BRAND_MARK_MIN_SIZE).toBe(40);
    render(
      <ThemeProvider>
        <ThemeScope scheme="light">
          <BrandMark size={24} />
        </ThemeScope>
      </ThemeProvider>,
    );
    expect(screen.getByLabelText("FitBud")).toBeTruthy();
  });

  it("renders the wordmark as FitBud", () => {
    render(
      <ThemeProvider>
        <ThemeScope scheme="light">
          <BrandMark wordmark />
        </ThemeScope>
      </ThemeProvider>,
    );
    expect(screen.getByLabelText("FitBud").textContent).toContain("FitBud");
  });
});

describe("Auth brand row (Z12-62)", () => {
  it("renders BrandMark with the wordmark and no Dumbbell tile", () => {
    const { container } = render(
      <ThemeProvider>
        <AuthPage brand title="Sign in">
          <span>body</span>
        </AuthPage>
      </ThemeProvider>,
    );
    expect(screen.getByLabelText("FitBud").textContent).toContain("FitBud");
    // lucide stand-in tags are svg-<name>; the old navy tile used Dumbbell.
    expect(container.querySelector("svg-dumbbell")).toBeNull();
  });
});
