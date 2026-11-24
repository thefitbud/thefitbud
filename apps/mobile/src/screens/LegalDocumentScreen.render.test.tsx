/**
 * Z14-27: the in-app legal documents. Text, roles and handlers through
 * react-native-web; layout is graded in docs/qa/Z14-27.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Linking } from "react-native";
import { LEGAL_EFFECTIVE_DATE, LEGAL_LAST_UPDATED } from "@fitbud/core";
import { fireEvent, mockAuth, render, screen } from "../test/render";
import { LEGAL_DOC_LIST } from "../lib/legalLinks";
import { LegalDocumentScreen, LegalEntryLinks, useLegalDocument } from "./LegalDocumentScreen";

const auth = mockAuth({ api: {}, accessToken: null });
vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});
vi.mock("../lib/stage1Api", () => ({ stage1Api: () => ({}) }));

const { AcceptInviteScreen } = await import("./AcceptInviteScreen");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("LegalDocumentScreen", () => {
  it.each(LEGAL_DOC_LIST.map((d) => [d.path, d.title] as const))(
    "%s shows its title, both dates and the not-in-force banner",
    (path, title) => {
      render(<LegalDocumentScreen path={path} onBack={vi.fn()} />);
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
      const dates = screen.getByTestId("legal-dates").textContent ?? "";
      expect(dates).toContain(`Effective ${LEGAL_EFFECTIVE_DATE}`);
      expect(dates).toContain(`Last updated ${LEGAL_LAST_UPDATED}`);
      const banner = screen.getByTestId("legal-draft-notice");
      expect(banner.getAttribute("aria-label")).toMatch(/pending counsel review/i);
      expect(banner.textContent).toMatch(/not yet in force/i);
    },
  );

  it("shows the same text as the web page, and no raw brackets", () => {
    render(<LegalDocumentScreen path="/privacy" onBack={vi.fn()} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("We do not advertise, and we do not sell or share your information");
    expect(text).toContain("Deleting your FitBud account");
    expect(text).toContain("More → Privacy → Delete account");
    expect(text).not.toMatch(/\[\[|\{\{/);
  });

  it("marks a value that is still to be confirmed", () => {
    render(<LegalDocumentScreen path="/terms" onBack={vi.fn()} />);
    expect(screen.getAllByTestId("legal-tbc").length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("To be confirmed");
  });

  it("Back calls onBack and is a 44 pt control", () => {
    const onBack = vi.fn();
    render(<LegalDocumentScreen path="/health" onBack={onBack} />);
    const back = screen.getByRole("button", { name: "Back" });
    expect(Number.parseFloat(window.getComputedStyle(back).height)).toBeGreaterThanOrEqual(44);
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("Open in browser uses the public URL, following the staging env var", () => {
    vi.stubEnv("EXPO_PUBLIC_TRAINER_WEB_URL", "https://app-staging.thefitbud.com");
    const openURL = vi.spyOn(Linking, "openURL").mockResolvedValue(true);
    render(<LegalDocumentScreen path="/terms/trainee" onBack={vi.fn()} />);
    const link = screen.getByTestId("legal-open-in-browser");
    expect(Number.parseFloat(window.getComputedStyle(link).minHeight)).toBeGreaterThanOrEqual(44);
    fireEvent.click(link);
    expect(openURL).toHaveBeenCalledWith("https://app-staging.thefitbud.com/terms/trainee");
  });

  it("keeps every credit author and the CC licence links in the in-app credits", () => {
    render(<LegalDocumentScreen path="/credits" onBack={vi.fn()} />);
    const text = document.body.textContent ?? "";
    for (const author of ["Everkinetic (everkinetic.com)", "CFCF", "wger.de", "hans"]) {
      expect(text).toContain(author);
    }
    expect(text).toContain("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(text).toContain("https://creativecommons.org/licenses/by-sa/3.0/");
  });
});

function Harness() {
  const legal = useLegalDocument();
  return (
    <>
      <LegalEntryLinks onOpen={legal.open} />
      {legal.modal}
    </>
  );
}

describe("legal entry links", () => {
  it("open each document in the app and Back closes it", () => {
    const openURL = vi.spyOn(Linking, "openURL").mockResolvedValue(true);
    render(<Harness />);
    expect(screen.queryByRole("heading", { name: "Terms of Service" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Terms of Service, opens in the app" }));
    expect(screen.getByRole("heading", { name: "Terms of Service" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("heading", { name: "Terms of Service" })).toBeNull();
    expect(openURL).not.toHaveBeenCalled();
  });
});

describe("Accept invite", () => {
  it("lets a person who is not signed in read Terms, Privacy and the Health notice before joining", () => {
    render(<AcceptInviteScreen initialToken="invite-token-for-test" />);
    const row = screen.getByTestId("legal-entry-links");
    expect(row.textContent).toContain("Before you join, you can read");
    for (const name of [
      "Terms of Service, opens in the app",
      "Privacy Policy, opens in the app",
      "Health and Fitness notice, opens in the app",
    ]) {
      expect(screen.getByRole("link", { name })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("link", { name: "Health and Fitness notice, opens in the app" }));
    expect(screen.getByRole("heading", { name: "Health and Fitness notice" })).toBeTruthy();
  });

  it("adds no consent tick: still no checkbox on the screen", () => {
    render(<AcceptInviteScreen initialToken="invite-token-for-test" />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });
});
