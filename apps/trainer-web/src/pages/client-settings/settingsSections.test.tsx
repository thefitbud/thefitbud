/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  SETTINGS_SECTIONS,
  clientSettingsHref,
  isFirstSectionOfPanel,
  panelForSection,
  sectionFromHash,
} from "./settingsSections";
import { ClientSettingsRedirect } from "./SettingsRedirect";

const REL_ID = "c422296e-ed7b-4196-a2b4-647096af3002";

afterEach(cleanup);

describe("client Settings sections (W13-10)", () => {
  it("lists the seven sections in sub-nav order", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.label)).toEqual([
      "Client details",
      "Package and payments",
      "Coaching setup",
      "Check-ins",
      "Reminders",
      "Onboarding answers",
      "Danger zone",
    ]);
  });

  it("reads the section from the hash, keeping the old ids", () => {
    expect(sectionFromHash("#basic")).toBe("basic");
    expect(sectionFromHash("#subscription")).toBe("subscription");
    expect(sectionFromHash("#coaching")).toBe("coaching");
    expect(sectionFromHash("#checkins")).toBe("checkins");
    expect(sectionFromHash("#reminders")).toBe("reminders");
    expect(sectionFromHash("#onboarding")).toBe("onboarding");
    expect(sectionFromHash("#danger")).toBe("danger");
    // The Coaching relationship section's End coaching moved to the Danger zone.
    expect(sectionFromHash("#relationship")).toBe("danger");
    expect(sectionFromHash("")).toBe("basic");
    expect(sectionFromHash("#configure")).toBe("basic");
  });

  it("groups sections into panels; only later sections scroll", () => {
    expect(panelForSection("basic")).toBe("details");
    expect(panelForSection("subscription")).toBe("details");
    expect(panelForSection("danger")).toBe("details");
    expect(panelForSection("coaching")).toBe("coaching");
    expect(panelForSection("checkins")).toBe("coaching");
    expect(isFirstSectionOfPanel("basic")).toBe(true);
    expect(isFirstSectionOfPanel("coaching")).toBe(true);
    expect(isFirstSectionOfPanel("reminders")).toBe(true);
    expect(isFirstSectionOfPanel("subscription")).toBe(false);
    expect(isFirstSectionOfPanel("checkins")).toBe(false);
    expect(clientSettingsHref(REL_ID, "reminders")).toBe(`/clients/${REL_ID}/settings#reminders`);
  });
});

function Probe() {
  const { pathname, hash, search } = useLocation();
  return <p>{`${pathname}${search}${hash}`}</p>;
}

describe("old client URLs redirect into Settings sections (D-W13-15)", () => {
  it.each([
    ["configure", "coaching"],
    ["onboarding", "onboarding"],
  ] as const)("/%s lands on #%s", (segment, section) => {
    render(
      <MemoryRouter initialEntries={[`/clients/${REL_ID}/${segment}?from=home`]}>
        <Routes>
          <Route
            path="/clients/:relationshipId/configure"
            element={<ClientSettingsRedirect section="coaching" />}
          />
          <Route
            path="/clients/:relationshipId/onboarding"
            element={<ClientSettingsRedirect section="onboarding" />}
          />
          <Route path="/clients/:relationshipId/settings" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(`/clients/${REL_ID}/settings?from=home#${section}`)).toBeTruthy();
  });
});
