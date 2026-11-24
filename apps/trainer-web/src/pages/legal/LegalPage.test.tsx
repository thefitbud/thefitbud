/**
 * @vitest-environment happy-dom
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LEGAL_EFFECTIVE_DATE, LEGAL_LAST_UPDATED, LEGAL_VALUES } from "@fitbud/core";
import { LEGAL_MARKDOWN } from "../../../../../docs/legal/published/documents";
import { parseLegalMarkdown } from "../../../../../docs/legal/published/markdown";
import { App } from "../../App";
import { ConfigProvider } from "../../lib/config";
import { LEGAL_DOC_LIST, LEGAL_NAV, SUPPORT_EMAIL, credits } from "./content";

/** A file in the repo, from the trainer-web package folder vitest runs in. */
const repoPath = (...parts: string[]) => resolve(process.cwd(), "../..", ...parts);
const publishedDir = repoPath("docs/legal/published");

// BT3, Z14-27: every legal route renders signed out, outside RequireAuth. The
// session lookup answers "no session" and /config is not reachable, so no
// request can succeed; the pages must not need either.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({}), { status: 401 })),
  );
  return render(
    <ConfigProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ConfigProvider>,
  );
}

/** A distinctive sentence from each draft, verbatim after substitution. */
const EXCERPTS: Record<string, string> = {
  "/terms": "These Terms apply to everyone who uses FitBud.",
  "/terms/trainer": "These Trainer Terms add to the FitBud",
  "/terms/trainee": "These terms add to the FitBud",
  "/privacy": "We do not advertise, and we do not sell or share your information",
  "/health": "This disclaimer forms part of the FitBud Terms of Service.",
  "/acceptable-use": "This policy forms part of the FitBud Terms of Service and applies to everyone.",
  "/beta": "FitBud is in closed beta.",
  "/credits": "Nutrition figures are estimates and may not match the food in front of you.",
};

describe("published documents", () => {
  it("documents.ts is in step with the .md files (run build-documents.mjs after editing one)", () => {
    for (const doc of LEGAL_DOC_LIST) {
      expect(LEGAL_MARKDOWN[doc.slug], doc.slug).toBe(
        readFileSync(resolve(publishedDir, `${doc.slug}.md`), "utf8"),
      );
    }
  });

  it("publishes only the eight user-facing documents, no counsel notes or draft markers", () => {
    const files = readdirSync(publishedDir).filter((f) => f.endsWith(".md")).sort();
    expect(files).toEqual(LEGAL_DOC_LIST.map((d) => `${d.slug}.md`).sort());
    for (const doc of LEGAL_DOC_LIST) {
      const text = LEGAL_MARKDOWN[doc.slug];
      expect(text, doc.slug).not.toMatch(/COUNSEL:|FACT:|Document notes|\[\[|not for publication/i);
    }
  });

  it("every {{token}} in the text is a key the config knows", () => {
    const known = new Set<string>([...Object.keys(LEGAL_VALUES), "noticePeriodPossessive"]);
    for (const doc of LEGAL_DOC_LIST) {
      for (const [, token] of LEGAL_MARKDOWN[doc.slug].matchAll(/\{\{(\w+)\}\}/g)) {
        expect(known.has(token ?? ""), `${doc.slug}: ${token}`).toBe(true);
      }
    }
  });

  it("the owner's address appears only through the config token", () => {
    const address = LEGAL_VALUES.ownerAddress ?? "";
    expect(address.length).toBeGreaterThan(10);
    for (const doc of LEGAL_DOC_LIST) {
      expect(LEGAL_MARKDOWN[doc.slug], doc.slug).not.toContain(address);
    }
  });

  it("parses with no stray markdown markers left", () => {
    for (const doc of LEGAL_DOC_LIST) {
      const blocks = parseLegalMarkdown(LEGAL_MARKDOWN[doc.slug]);
      expect(blocks.length, doc.slug).toBeGreaterThan(5);
    }
  });
});

describe("public legal pages", () => {
  it.each(LEGAL_DOC_LIST.map((d) => [d.path, d.title] as const))(
    "%s renders signed out with its h1, dates, banner and a back link to sign-in",
    async (path, title) => {
      renderAt(path);
      expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
      const back = screen.getByRole("link", { name: "Back to sign in" });
      expect(back.getAttribute("href")).toBe("/sign-in");
      const nav = screen.getByRole("navigation", { name: "Legal" });
      for (const item of LEGAL_NAV) {
        expect(within(nav).getByRole("link", { name: item.label })).toBeTruthy();
      }
      expect(within(nav).getByRole("link", { current: "page" }).textContent).toContain(title);
      const dates = screen.getByTestId("legal-dates").textContent ?? "";
      expect(dates).toContain(`Effective ${LEGAL_EFFECTIVE_DATE}`);
      expect(dates).toContain(`Last updated ${LEGAL_LAST_UPDATED}`);
      const banner = screen.getByTestId("legal-draft-notice");
      expect(banner.getAttribute("role")).toBe("note");
      expect(banner.textContent).toMatch(/pending counsel review/i);
      expect(banner.textContent).toMatch(/not yet in force/i);
    },
  );

  it.each(Object.entries(EXCERPTS))("%s shows the matching draft text", async (path, excerpt) => {
    renderAt(path);
    await screen.findByRole("heading", { level: 1 });
    expect(document.body.textContent).toContain(excerpt);
  });

  it("every nav item is at least 44px tall by its stylesheet rule", () => {
    const css = readFileSync(repoPath("apps/trainer-web/src/pages/legal/legal.css"), "utf8");
    expect(css).toMatch(/\.legal-nav-link\s*\{[^}]*min-height:\s*44px/);
  });

  it("headings are in order on every page: one h1, then no skipped level", async () => {
    for (const doc of LEGAL_DOC_LIST) {
      renderAt(doc.path);
      await screen.findByRole("heading", { level: 1, name: doc.title });
      const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName[1]));
      expect(levels.filter((l) => l === 1), doc.path).toHaveLength(1);
      expect(levels[0]).toBe(1);
      for (let i = 1; i < levels.length; i += 1) {
        expect((levels[i] ?? 0) - (levels[i - 1] ?? 0), `${doc.path} heading ${i}`).toBeLessThanOrEqual(1);
      }
      cleanup();
    }
  });

  it("values Firoz has not supplied show as 'To be confirmed', never as brackets", async () => {
    renderAt("/terms");
    await screen.findByRole("heading", { level: 1, name: "Terms of Service" });
    expect(screen.getAllByTestId("legal-tbc").length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("To be confirmed");
    expect(document.body.textContent).not.toMatch(/\[\[|\{\{/);
  });

  it("fills the contracting party and address from the config on the terms page", async () => {
    renderAt("/terms");
    await screen.findByRole("heading", { level: 1, name: "Terms of Service" });
    expect(document.body.textContent).toContain(LEGAL_VALUES.partyName ?? "x");
    expect(document.body.textContent).toContain(LEGAL_VALUES.ownerAddress ?? "x");
  });

  it("privacy has the #delete-account heading and describes the shipped in-app deletion", async () => {
    renderAt("/privacy#delete-account");
    await screen.findByRole("heading", { level: 1, name: "Privacy Policy" });
    const heading = document.getElementById("delete-account");
    expect(heading?.tagName).toBe("H3");
    expect(heading?.textContent).toBe("Deleting your FitBud account");
    const text = document.body.textContent ?? "";
    expect(text).toContain("More → Privacy → Delete account");
    expect(text).toContain("archived for 6 months");
    expect(text).toContain("deleted for good");
    expect(text).toContain("Delete my FitBud account");
    expect(text).not.toMatch(/building it into the app|we are building this into the app/);
  });

  it("the deletion wording matches the public API page", async () => {
    const api = readFileSync(repoPath("apps/api/src/routes/account-deletion-page.ts"), "utf8");
    for (const phrase of ["More → Privacy → Delete account", "archived for 6 months", "deleted for good", "tech@thefitbud.com"]) {
      expect(api, phrase).toContain(phrase);
    }
  });

  it("credits keeps every author with a licence link", async () => {
    renderAt("/credits");
    for (const author of ["Everkinetic (everkinetic.com)", "CFCF", "wger.de", "hans"]) {
      expect(await screen.findByRole("rowheader", { name: author })).toBeTruthy();
    }
    const licenceLinks = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h) => h?.startsWith("https://creativecommons.org/licenses/by-sa/"));
    expect(licenceLinks).toContain("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(licenceLinks).toContain("https://creativecommons.org/licenses/by-sa/3.0/");
    expect(screen.getByRole("heading", { name: "Indian Nutrient Databank (INDB)" })).toBeTruthy();
  });

  it("credits states the drawing counts and licence split from credits-and-licences.md", async () => {
    renderAt("/credits");
    const V4 = "https://creativecommons.org/licenses/by-sa/4.0/";
    const V3 = "https://creativecommons.org/licenses/by-sa/3.0/";
    const expected: [string, string, string[]][] = [
      ["Everkinetic (everkinetic.com)", "912", [V4, V3]],
      ["CFCF", "4", [V4]],
      ["wger.de", "2", [V3]],
      ["hans", "1", [V4]],
    ];
    for (const [author, count, hrefs] of expected) {
      const row = (await screen.findByRole("rowheader", { name: author })).closest("tr");
      if (!row) throw new Error(`no row for ${author}`);
      const cells = within(row).getAllByRole("cell");
      expect(cells[0]?.textContent).toBe(count);
      expect(within(row).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(hrefs);
    }
    expect(screen.getByText(/919 drawings for 460 exercises/)).toBeTruthy();
    expect(screen.getByText(/574 are CC BY-SA 4\.0 and 338 are CC BY-SA 3\.0/)).toBeTruthy();
    expect(credits.drawings.rows).toHaveLength(4);
  });

  it("credits adds the draft 08 notices: wger text, estimates note, fonts to be confirmed, questions", async () => {
    renderAt("/credits");
    await screen.findByRole("heading", { level: 1, name: "Credits and licences" });
    const text = document.body.textContent ?? "";
    expect(text).toContain("free-exercise-db");
    expect(text).toContain("The Unlicense");
    expect(text).toContain("Nutrition figures are estimates");
    expect(screen.getByRole("heading", { name: "Fonts, icons and software" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Questions" })).toBeTruthy();
    // The font and icon licence list is not generated yet: it must say so.
    expect(screen.getAllByTestId("legal-tbc").length).toBeGreaterThan(0);
  });
});

describe("sign-in footer", () => {
  it("links to privacy, terms and credits without a session (three links, pinned by the footer e2e)", async () => {
    renderAt("/sign-in");
    const nav = await screen.findByRole("navigation", { name: "Legal" });
    expect(within(nav).getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(within(nav).getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
    expect(
      within(nav).getByRole("link", { name: "Credits and licences" }).getAttribute("href"),
    ).toBe("/credits");
  });
});

describe("support address", () => {
  it("is the one already used across the product", () => {
    expect(SUPPORT_EMAIL).toBe("tech@thefitbud.com");
  });
});
