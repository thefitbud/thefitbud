/**
 * Z12-36 render check: every shared primitive renders in light and in dark,
 * and every colour it paints comes from that theme's tokens. A colour that
 * belongs only to the other theme (or to no theme) is how unreadable text
 * gets onto a dark screen.
 */
import { describe, expect, it } from "vitest";
import { themes } from "@fitbud/ui-mobile";
import { render, screen } from "../test/render";
import { PrimitiveGallery } from "./PrimitiveGallery";

/** Normalise any CSS colour the DOM reports to "r,g,b,a" for comparison. */
function canon(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (v === "" || v === "transparent" || v === "inherit" || v === "currentcolor" || v === "initial") {
    return null;
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (hex?.[1]) {
    const raw = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    const n = (i: number) => Number.parseInt(raw.slice(i, i + 2), 16);
    const a = raw.length === 8 ? Math.round((n(6) / 255) * 100) / 100 : 1;
    return `${n(0)},${n(2)},${n(4)},${a}`;
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(v);
  if (fn?.[1]) {
    const [r = "0", g = "0", b = "0", a = "1"] = fn[1].split(",").map((p) => p.trim());
    const alpha = Math.round(Number(a) * 100) / 100;
    // Fully transparent paints nothing.
    if (alpha === 0) return null;
    return `${Number(r)},${Number(g)},${Number(b)},${alpha}`;
  }
  return v;
}

function allowedColours(scheme: "light" | "dark"): Set<string> {
  const out = new Set<string>();
  for (const value of Object.values(themes[scheme].colors)) {
    const c = canon(value);
    if (c) out.add(c);
  }
  // Derived from tokens in the primitives: toast action (white 14%), hero overlays.
  out.add(canon("rgba(255,255,255,0.14)")!);
  // The WhatsApp brand green edge (sanctioned third-party literal).
  out.add(canon("#25D366")!);
  return out;
}

const SIDES = ["top", "right", "bottom", "left"] as const;

/** Colour properties that actually paint: text, fill, and borders with a width. */
function paintingProps(style: CSSStyleDeclaration): string[] {
  const props = ["color", "background-color"];
  for (const side of SIDES) {
    if (Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0) {
      props.push(`border-${side}-color`);
    }
  }
  return props;
}

function paintedColours(root: HTMLElement): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const node of nodes) {
    const style = window.getComputedStyle(node);
    for (const prop of paintingProps(style)) {
      const c = canon(style.getPropertyValue(prop));
      if (!c) continue;
      const where = `${node.tagName.toLowerCase()} ${prop} "${(node.textContent ?? "").slice(0, 30)}"`;
      found.set(c, [...(found.get(c) ?? []), where]);
    }
  }
  return found;
}

type Rgba = [number, number, number, number];

function parts(c: string): Rgba {
  const [r = 0, g = 0, b = 0, a = 1] = c.split(",").map(Number);
  return [r, g, b, a];
}

/** The opaque colour behind a node: its own and its ancestors' fills, composited. */
function backgroundBehind(node: HTMLElement): string {
  const layers: Rgba[] = [];
  for (let el: HTMLElement | null = node; el; el = el.parentElement) {
    const c = canon(window.getComputedStyle(el).getPropertyValue("background-color"));
    if (!c) continue;
    const layer = parts(c);
    layers.push(layer);
    if (layer[3] >= 1) break;
  }
  // Composite from the bottom (opaque, or white if none) up to the node.
  let [r, g, b] = [255, 255, 255];
  for (const [lr, lg, lb, la] of layers.reverse()) {
    r = lr * la + r * (1 - la);
    g = lg * la + g * (1 - la);
    b = lb * la + b * (1 - la);
  }
  return `${Math.round(r)},${Math.round(g)},${Math.round(b)},1`;
}

function luminance([r, g, b]: Rgba): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: string, bg: string): number {
  const back = parts(bg);
  const [fr, fgreen, fb, fa] = parts(fg);
  const front: Rgba = [
    fr * fa + back[0] * (1 - fa),
    fgreen * fa + back[1] * (1 - fa),
    fb * fa + back[2] * (1 - fa),
    1,
  ];
  const [hi, lo] = [luminance(front), luminance(back)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(["light", "dark"] as const)("PrimitiveGallery in %s", (scheme) => {
  it("renders every primitive", () => {
    render(<PrimitiveGallery scheme={scheme} sheetOpen />);
    for (const text of [
      "Large title 30",
      "Caption 12",
      "Primary",
      "Quiet danger",
      "Selected",
      "3 × 10 @ 40 kg",
      "Brand",
      "Card",
      "Due card",
      "Reminders",
      "Sign out",
      "Help text under the field.",
      "Could not save. Your entry is kept on this phone.",
      "Meal logged",
      "Sheet title",
    ]) {
      expect(screen.getAllByText(text).length, text).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole("tablist").some((el) => el.textContent?.includes("Today"))).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("Could not save");
  });

  it("paints only this theme's token colours", () => {
    const view = render(<PrimitiveGallery scheme={scheme} sheetOpen />);
    const allowed = allowedColours(scheme);
    const painted = paintedColours(view.baseElement);
    expect(painted.size, "no colours were read from the DOM").toBeGreaterThan(5);
    const stray = [...painted.entries()].filter(([colour]) => !allowed.has(colour));
    expect(stray.map(([colour, where]) => `${colour} at ${where.slice(0, 3).join("; ")}`)).toEqual([]);
  });

  it("keeps every text run readable on the surface behind it (WCAG AA)", () => {
    const view = render(<PrimitiveGallery scheme={scheme} sheetOpen />);
    const ink4 = canon(themes[scheme].colors.ink4);
    const failures: string[] = [];
    let checked = 0;
    for (const node of Array.from(view.baseElement.querySelectorAll<HTMLElement>("*"))) {
      // Text leaves only: an element whose own child nodes include text.
      const ownText = Array.from(node.childNodes)
        .filter((child) => child.nodeType === 3)
        .map((child) => child.textContent ?? "")
        .join("")
        .trim();
      if (!ownText) continue;
      const style = window.getComputedStyle(node);
      const fg = canon(style.getPropertyValue("color"));
      if (!fg || fg === ink4) continue; // --ink4 is disabled-only and exempt (DESIGN-SYSTEM-v3 §2.3)
      const bg = backgroundBehind(node);
      const ratio = contrast(fg, bg);
      const size = Number.parseFloat(style.getPropertyValue("font-size")) || 16;
      const weight = Number.parseInt(style.getPropertyValue("font-weight"), 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      checked += 1;
      if (ratio < (large ? 3 : 4.5)) failures.push(`"${ownText}" ${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
    expect(checked).toBeGreaterThan(30);
    expect(failures).toEqual([]);
  });

  it("uses the theme's page and text colours", () => {
    const view = render(<PrimitiveGallery scheme={scheme} />);
    const painted = paintedColours(view.baseElement);
    expect(painted.has(canon(themes[scheme].colors.bg)!)).toBe(true);
    expect(painted.has(canon(themes[scheme].colors.ink)!)).toBe(true);
    const other = scheme === "light" ? "dark" : "light";
    // The other theme's page background never appears.
    expect(painted.has(canon(themes[other].colors.bg)!)).toBe(false);
  });
});
