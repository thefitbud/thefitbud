import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { API, apiToken, signIn } from "./support/session";

const OUT = path.resolve("qa-captures/w13-22");
const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";
const GLOBAL_CHECKIN = "c1000001-0000-4000-8000-000000000001";

/** Sizes asserted for layout (capture + text checks). Taps are asserted at 1180. */
const SIZES: Array<[number, number]> = [
  [1440, 900],
  [1280, 800],
  [1180, 820],
  [1024, 1366],
];

async function api<T>(url: string): Promise<T> {
  const token = await apiToken();
  const res = await fetch(`${API}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok, `GET ${url} ${res.status}`).toBeTruthy();
  const json = (await res.json()) as { data?: T };
  return (json.data ?? json) as T;
}

async function windowLocked(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.main");
    const doc = document.documentElement;
    return {
      windowScrolls: doc.scrollHeight > doc.clientHeight + 1,
      mainOverflow: main ? getComputedStyle(main).overflowY : "missing",
    };
  });
}

// Copied from e2e/w13-2-shell.spec.ts (check-web.mjs checks).
async function textProblems(page: Page) {
  return page.evaluate(() => {
    const small: string[] = [];
    const clip: string[] = [];
    let broken = 0;
    document.querySelectorAll("img").forEach((img) => {
      if (!img.complete || img.naturalWidth === 0) broken += 1;
    });
    document.querySelectorAll("body *").forEach((el) => {
      const text = [...el.childNodes]
        .filter((node) => node.nodeType === 3 && node.textContent?.trim())
        .map((node) => node.textContent?.trim() ?? "")
        .join(" ");
      if (!text) return;
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      if (el.closest(".sr-only")) return;
      const size = Number.parseFloat(cs.fontSize);
      if (size < 12 && !el.closest(".shell-kbd, .ui-kbd, kbd")) {
        small.push(`${size}:${text.slice(0, 24)}`);
      }
      if (el.matches("main.main, .shell-bell-popover, .shell-palette-results")) return;
      if (
        el.scrollWidth > el.clientWidth + 2 &&
        cs.overflow !== "visible" &&
        cs.overflowX !== "visible"
      ) {
        clip.push(text.slice(0, 40));
      }
    });
    return { small, clip, broken };
  });
}

/**
 * Visible controls whose hit box is under 44 px in the smaller dimension.
 *
 * Hit box = the element's own box; for a checkbox / radio the box of its
 * wrapping or `for` label (the visible mark keeps its size; the label is the
 * 44 px hit area).
 *
 * Allow-list (reason in each case):
 *  - an anchor inside running text (`p`, `li`, `dd`, `td`, `.hint` with its own
 *    text next to it): WCAG 2.5.8 exempts inline links, and padding them would
 *    break the line height of the sentence.
 *  - `.sr-only` and the `.skip-link`: not visible to anyone until focused.
 *  - `input[type=hidden|file]`: the file input sits behind its visible button.
 *  - a label that wraps a button, link or text control: the inner control is
 *    measured instead.
 *  - a caption `label[for]` above a text field, text area or select: the field
 *    is measured on its own; the caption only moves focus to it.
 */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel = 'a, button, [role="button"], [role="tab"], input, select, label[for]';
    const describe = (el: Element) => {
      const id = el.getAttribute("data-testid");
      const cls = [...el.classList].slice(0, 3).join(".");
      const txt = (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24);
      return `${el.tagName.toLowerCase()}${id ? `[${id}]` : ""}${cls ? `.${cls}` : ""} "${txt}"`;
    };
    const rendered = (el: Element) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const inlineLink = (el: Element) => {
      if (el.tagName !== "A") return false;
      const parent = el.parentElement;
      if (!parent || !parent.matches("p, li, dd, td, .hint, .field-hint")) return false;
      const own = [...parent.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent?.trim() ?? "")
        .join("");
      return own.length > 3;
    };
    document.querySelectorAll(sel).forEach((el) => {
      if (el.closest(".sr-only, [aria-hidden='true'], [inert]")) return;
      if (el.matches(".skip-link")) return;
      const input = el as HTMLInputElement;
      if (el.tagName === "INPUT" && ["hidden", "file"].includes(input.type)) return;
      if (inlineLink(el)) return;
      const isChoice = el.tagName === "INPUT" && ["checkbox", "radio"].includes(input.type);
      if (el.tagName === "LABEL") {
        const inner = el.querySelector("input, select, textarea, a, button");
        if (inner) return;
        // A caption above a text field, text area or select: the field is the
        // 44 px target (asserted on its own); the caption only focuses it.
        const target = el.getAttribute("for")
          ? document.getElementById(el.getAttribute("for")!)
          : null;
        if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
          const t = target as HTMLInputElement;
          if (!["checkbox", "radio"].includes(t.type)) return;
        }
      }
      let box = el.getBoundingClientRect();
      if (isChoice || (el.tagName === "INPUT" && getComputedStyle(el).opacity === "0")) {
        const label =
          el.closest("label") ??
          (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
        if (label && rendered(label)) box = label.getBoundingClientRect();
      } else if (!rendered(el)) {
        return;
      }
      if (box.width === 0 || box.height === 0) return;
      if (Math.min(box.width, box.height) < 43.5) {
        out.push(`${describe(el)} ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    });
    return out;
  });
}

type Screen = { name: string; url: string; ready: (page: Page) => Promise<void> };

async function visit(page: Page, screen: Screen) {
  await page.goto(screen.url);
  await screen.ready(page);
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function layoutShot(page: Page, name: string, w: number, h: number): Promise<string[]> {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}-${w}x${h}.png`), fullPage: false });
  const bad: string[] = [];
  const locked = await windowLocked(page);
  if (locked.windowScrolls) bad.push("window scrolls");
  if (locked.mainOverflow !== "auto") bad.push(`main overflow ${locked.mainOverflow}`);
  const problems = await textProblems(page);
  if (problems.broken) bad.push(`${problems.broken} broken images`);
  for (const t of problems.small) bad.push(`small text ${t}`);
  for (const t of problems.clip) bad.push(`clipped ${t}`);
  return bad;
}

const byId = (id: string) => async (page: Page) => {
  await expect(page.getByTestId(id).first()).toBeVisible({ timeout: 30_000 });
};

type Listing = { items: Array<{ id: string; ownership: string }> };

test.describe("W13-22 44 px targets up to 1280 wide", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("every control is 44 px at 1180x820 and the layout holds at four sizes", async ({
    page,
  }) => {
    test.setTimeout(900_000);
    const workouts = await api<Listing>("/templates?limit=50&templateType=workout");
    const diets = await api<Listing>("/templates?limit=50&templateType=nutrition");
    const workoutId = workouts.items.find((t) => t.ownership === "trainer")?.id;
    const dietId = diets.items.find((t) => t.ownership === "trainer")?.id;
    expect(workoutId, "own workout template").toBeTruthy();
    expect(dietId, "own diet template").toBeTruthy();

    const screens: Screen[] = [
      { name: "home", url: "/", ready: byId("screen-TW-04") },
      { name: "overview", url: `/clients/${ROHAN}/overview`, ready: byId("screen-TW-09") },
      { name: "activity", url: `/clients/${ROHAN}/activity`, ready: byId("screen-TW-17") },
      { name: "progress", url: `/clients/${ROHAN}/progress`, ready: byId("screen-TW-18") },
      { name: "check-ins", url: `/clients/${ROHAN}/check-ins`, ready: byId("screen-TW-19") },
      { name: "checkins-queue", url: "/checkins", ready: byId("screen-TW-22") },
      { name: "templates", url: "/templates/workouts", ready: byId("screen-TW-23") },
      {
        name: "builder-workout",
        url: `/templates/workouts/${workoutId}`,
        ready: byId("screen-TW-13"),
      },
      { name: "builder-diet", url: `/templates/diets/${dietId}`, ready: byId("screen-TW-14") },
      {
        name: "builder-checkin",
        url: `/templates/checkins/${GLOBAL_CHECKIN}`,
        ready: byId("screen-TW-25"),
      },
      { name: "settings-profile", url: "/settings/profile", ready: byId("screen-TW-28") },
      {
        name: "settings-notifications",
        url: "/settings/notifications",
        ready: byId("screen-TW-29"),
      },
      {
        name: "settings-business",
        url: "/settings/business",
        ready: byId("screen-settings-business"),
      },
      { name: "settings-units", url: "/settings/units", ready: byId("screen-settings-units") },
    ];

    const offenders: string[] = [];
    const layout: string[] = [];
    const baseline = new Map<string, Set<string>>();
    for (const screen of screens) {
      for (const [w, h] of SIZES) {
        await page.setViewportSize({ width: w, height: h });
        await visit(page, screen);
        const bad = await layoutShot(page, screen.name, w, h);
        if (w === 1440) baseline.set(screen.name, new Set(bad));
        // 1440 is untouched by this task: a problem already there (for example
        // the check-in builder's measurement row at 1440) is not this change's.
        for (const item of bad) {
          if (w === 1440 || baseline.get(screen.name)?.has(item)) continue;
          layout.push(`${screen.name} ${w}x${h}: ${item}`);
        }
        if (w === 1180) {
          for (const item of await smallTargets(page)) offenders.push(`${screen.name}: ${item}`);
        }
      }
    }
    expect(layout, `layout problems:\n${layout.join("\n")}`).toEqual([]);
    expect(offenders, `controls under 44 px at 1180x820:\n${offenders.join("\n")}`).toEqual([]);
  });
});
