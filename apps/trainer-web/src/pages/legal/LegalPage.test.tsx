/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { ConfigProvider } from "../../lib/config";
import { LEGAL_NAV, SUPPORT_EMAIL, credits, privacy, terms } from "./content";

// BT3: the three legal routes render signed out, outside RequireAuth. The
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

describe("public legal pages", () => {
  it.each([
    ["/privacy", privacy.title],
    ["/terms", terms.title],
    ["/credits", credits.title],
  ])("%s renders signed out with its h1 and a back link to sign-in", async (path, title) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
    const back = screen.getByRole("link", { name: "Back to sign in" });
    expect(back.getAttribute("href")).toBe("/sign-in");
    const nav = screen.getByRole("navigation", { name: "Legal" });
    for (const item of LEGAL_NAV) {
      expect(within(nav).getByRole("link", { name: item.label })).toBeTruthy();
    }
    expect(within(nav).getByRole("link", { current: "page" }).textContent).toContain(title);
  });

  it("privacy and terms say at the top that they are drafts and not in force", async () => {
    for (const path of ["/privacy", "/terms"]) {
      renderAt(path);
      const notice = await screen.findByTestId("legal-draft-notice");
      expect(notice.textContent).toMatch(/not yet in force/i);
      expect(notice.textContent).toMatch(/counsel/i);
      cleanup();
    }
  });

  it("privacy states account deletion is by email to support", async () => {
    renderAt("/privacy");
    const fact = await screen.findByTestId("legal-account-deletion");
    const link = within(fact).getByRole("link", { name: SUPPORT_EMAIL });
    expect(link.getAttribute("href")).toBe(`mailto:${SUPPORT_EMAIL}`);
    expect(SUPPORT_EMAIL).toBe("tech@thefitbud.com");
  });

  it("headings are in order: one h1, then h2 sections, then h3 cards", async () => {
    renderAt("/credits");
    await screen.findByRole("heading", { level: 1, name: credits.title });
    const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName[1]));
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect((levels[i] ?? 0) - (levels[i - 1] ?? 0)).toBeLessThanOrEqual(1);
    }
  });

  it("credits lists every author with a licence link", async () => {
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
  });
});

describe("sign-in footer", () => {
  it("links to privacy, terms and credits without a session", async () => {
    renderAt("/sign-in");
    const nav = await screen.findByRole("navigation", { name: "Legal" });
    expect(within(nav).getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(within(nav).getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
    expect(
      within(nav).getByRole("link", { name: "Credits and licences" }).getAttribute("href"),
    ).toBe("/credits");
  });
});
