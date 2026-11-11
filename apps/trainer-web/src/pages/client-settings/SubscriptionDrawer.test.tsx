/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { ClientSettingsResponse, ClientSettingsSubscription } from "@fitbud/contracts";
import { ApiClientError } from "@fitbud/api-client";

const REL_ID = "c422296e-ed7b-4196-a2b4-647096af3002";
const SUB_ID = "5b0b8a52-2d0f-4a8e-9f55-0d7a3c1b9e01";

const api = vi.hoisted(() => ({
  getClientSettings: vi.fn(),
  updateClientBasics: vi.fn(),
  saveClientSubscription: vi.fn(),
}));
vi.mock("../../lib/api", () => ({ apiClient: api }));

import { ClientSettingsPage } from "./ClientSettingsPage";
import { parseRupeesInput, validateSubscriptionDraft } from "./SubscriptionDrawer";

function subscription(overrides: Partial<ClientSettingsSubscription> = {}): ClientSettingsSubscription {
  return {
    id: SUB_ID,
    versionNumber: 2,
    planName: "Fat Loss 12-week",
    paymentFrequency: "monthly",
    startsOn: "2026-08-24",
    renewsOn: "2026-10-24",
    renewalState: "current",
    amountPaise: 600_000,
    subscriptionType: "monthly",
    coachingMode: "hybrid",
    createdAt: "2026-08-24T04:30:00.000Z",
    ...overrides,
  };
}

function settings(overrides: Partial<ClientSettingsResponse> = {}): ClientSettingsResponse {
  return {
    relationshipId: REL_ID,
    relationshipStatus: "active",
    startedAt: "2026-08-24T04:30:00.000Z",
    endedAt: null,
    readOnly: false,
    basics: {
      displayName: "Rohan Mehta",
      phoneE164: "+919000000008",
      clientDisplayName: null,
      contactPhoneE164: null,
    },
    subscription: subscription(),
    payments: [],
    ...overrides,
  };
}

const reloadWorkspace = vi.fn();

function renderPage({ online = true } = {}) {
  const context = {
    workspace: {
      header: {
        relationshipId: REL_ID,
        traineeDisplayName: "Rohan Mehta",
        onboardingStatus: "active",
        traineeProfile: { displayName: "Rohan Mehta", age: 29, gender: "male" },
        traineeTimezone: "Asia/Kolkata",
      },
    },
    openWorkspaceModal: vi.fn(),
    reloadWorkspace,
    relationshipId: REL_ID,
    online,
    ended: false,
    refreshEpoch: 0,
  };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/settings#subscription`]}>
      <Routes>
        <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
          <Route path="settings" element={<ClientSettingsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

async function openDrawer() {
  fireEvent.click(await screen.findByRole("button", { name: "Edit subscription" }));
  return screen.getByRole("dialog", { name: "Edit subscription & package" });
}

function conflict(code: string, message: string) {
  return new ApiClientError({ status: 409, code, message, requestId: "req-9" });
}

beforeEach(() => {
  api.getClientSettings.mockResolvedValue(settings());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SubscriptionDrawer (frames 211 / 211b)", () => {
  it("opens prefilled with readable dates and only tracking fields", async () => {
    renderPage();
    const dialog = await openDrawer();
    expect((within(dialog).getByLabelText("Plan name") as HTMLInputElement).value).toBe(
      "Fat Loss 12-week",
    );
    expect((within(dialog).getByRole("radio", { name: "Monthly" }) as HTMLInputElement).checked).toBe(true);
    expect((within(dialog).getByRole("radio", { name: "Hybrid" }) as HTMLInputElement).checked).toBe(true);
    expect((within(dialog).getByLabelText("Amount") as HTMLInputElement).value).toBe("6,000");
    // Dates read like "Mon 24 Aug"; the ISO value stays inside the native input.
    expect(within(dialog).getByText("Mon 24 Aug")).toBeTruthy();
    expect(within(dialog).getByText("Sat 24 Oct")).toBeTruthy();
    expect(within(dialog).getByText("Home shows a renewal reminder 7 days before.")).toBeTruthy();
    expect(within(dialog).getByText("Tracking only.")).toBeTruthy();
    const text = dialog.textContent ?? "";
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // D-W8-2: no session package, counts, collection or invoices.
    expect(text).not.toMatch(/\bsessions?\b|package ·|Carried over|Counts as used|invoice/i);
    expect(text).not.toMatch(/collect|pay now/i);
  });

  it("saves a new version with every tracked field and shows it on the page", async () => {
    const saved = subscription({
      id: "6c1c9b63-3e1f-4b9f-8a66-1e8b4d2c0f12",
      versionNumber: 3,
      planName: "Hybrid coaching",
      paymentFrequency: "quarterly",
      renewsOn: "2026-11-24",
      amountPaise: 1_800_000,
      coachingMode: "in_person",
    });
    api.saveClientSubscription.mockResolvedValue(saved);
    renderPage();
    const dialog = await openDrawer();
    fireEvent.change(within(dialog).getByLabelText("Plan name"), {
      target: { value: "  Hybrid coaching " },
    });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Quarterly" }));
    fireEvent.change(within(dialog).getByLabelText("Renewal date"), {
      target: { value: "2026-11-24" },
    });
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "18,000" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "In person" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.saveClientSubscription).toHaveBeenCalledTimes(1));
    const [rid, body, key] = api.saveClientSubscription.mock.calls[0]!;
    expect(rid).toBe(REL_ID);
    expect(body).toEqual({
      expectedVersion: 2,
      planName: "Hybrid coaching",
      paymentFrequency: "quarterly",
      startsOn: "2026-08-24",
      renewsOn: "2026-11-24",
      amountPaise: 1_800_000,
      subscriptionType: "monthly",
      coachingMode: "in_person",
    });
    expect(typeof key).toBe("string");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const sub = screen.getByTestId("cs-section-subscription");
    expect(within(sub).getByText("Hybrid coaching")).toBeTruthy();
    expect(within(sub).getByText("Quarterly")).toBeTruthy();
    expect(within(sub).getByText("Tue 24 Nov")).toBeTruthy();
    expect(within(sub).getByText("₹18,000")).toBeTruthy();
    expect(within(sub).getByRole("status").textContent).toBe("Saved as a new subscription version.");
    expect(reloadWorkspace).toHaveBeenCalled();
  });

  it("refuses a renewal on or before the start date inline (211b) without calling the API", async () => {
    renderPage();
    const dialog = await openDrawer();
    fireEvent.change(within(dialog).getByLabelText("Renewal date"), {
      target: { value: "2026-08-20" },
    });
    // Shown as soon as the field changes, with the start date spelled out.
    expect(
      within(dialog).getByText("Renewal date must be after the start date, Mon 24 Aug."),
    ).toBeTruthy();
    const save = within(dialog).getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    // 211b: the summary names the field next to the disabled Save.
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "Fix 1 field to save: Renewal date",
    );
    // A forced submit (Enter) still sends nothing and focuses the field.
    fireEvent.submit(save.closest("form")!);
    expect(within(dialog).getByLabelText("Renewal date").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Renewal date"));
    expect(api.saveClientSubscription).not.toHaveBeenCalled();

    // The same day is refused too; a later day clears the error.
    fireEvent.change(within(dialog).getByLabelText("Renewal date"), {
      target: { value: "2026-08-24" },
    });
    expect(within(dialog).getByText(/Renewal date must be after the start date/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Renewal date"), {
      target: { value: "2026-09-24" },
    });
    expect(within(dialog).queryByText(/Renewal date must be after/)).toBeNull();
    expect(save.disabled).toBe(false);
  });

  it("names every invalid field in the summary", async () => {
    renderPage();
    const dialog = await openDrawer();
    fireEvent.change(within(dialog).getByLabelText("Plan name"), { target: { value: " " } });
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "12abc" } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Save changes" }).closest("form")!);
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "Fix 2 fields to save: Plan name, Amount",
    );
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Plan name"));
    expect(api.saveClientSubscription).not.toHaveBeenCalled();
  });

  it("closes without a request when nothing changed", async () => {
    renderPage();
    const dialog = await openDrawer();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.saveClientSubscription).not.toHaveBeenCalled();
  });

  it("creates version 1 when no subscription exists yet", async () => {
    api.getClientSettings.mockResolvedValue(settings({ subscription: null }));
    api.saveClientSubscription.mockResolvedValue(subscription({ versionNumber: 1 }));
    renderPage();
    const dialog = await openDrawer();
    expect(within(dialog).getAllByText("Choose a date")).toHaveLength(2);
    fireEvent.change(within(dialog).getByLabelText("Plan name"), {
      target: { value: "Fat Loss 12-week" },
    });
    fireEvent.change(within(dialog).getByLabelText("Start date"), {
      target: { value: "2026-08-24" },
    });
    fireEvent.change(within(dialog).getByLabelText("Renewal date"), {
      target: { value: "2026-10-24" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.saveClientSubscription).toHaveBeenCalledTimes(1));
    expect(api.saveClientSubscription.mock.calls[0]![1]).toEqual({
      expectedVersion: 0,
      planName: "Fat Loss 12-week",
      paymentFrequency: "monthly",
      startsOn: "2026-08-24",
      renewsOn: "2026-10-24",
      amountPaise: null,
      subscriptionType: null,
      coachingMode: null,
    });
  });

  it("shows the API's message on a version conflict and reloads instead of retrying", async () => {
    api.saveClientSubscription.mockRejectedValue(
      conflict("SUBSCRIPTION_VERSION_CONFLICT", "Subscription was changed after this version was loaded."),
    );
    renderPage();
    const dialog = await openDrawer();
    fireEvent.change(within(dialog).getByLabelText("Plan name"), { target: { value: "Hybrid" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(
      await within(dialog).findByText("Subscription was changed after this version was loaded."),
    ).toBeTruthy();
    // A stale version is never resent: Save stays off until the latest is loaded.
    expect(
      (within(dialog).getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    api.getClientSettings.mockResolvedValue(
      settings({ subscription: subscription({ versionNumber: 3, planName: "Strength block" }) }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Reload latest" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Strength block")).toBeTruthy();
    expect(api.getClientSettings).toHaveBeenCalledTimes(2);
    expect(api.saveClientSubscription).toHaveBeenCalledTimes(1);

    // Reopening sends the newly loaded version.
    api.saveClientSubscription.mockResolvedValue(subscription({ versionNumber: 4 }));
    const again = await openDrawer();
    fireEvent.change(within(again).getByLabelText("Plan name"), { target: { value: "Strength" } });
    fireEvent.click(within(again).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.saveClientSubscription).toHaveBeenCalledTimes(2));
    expect(api.saveClientSubscription.mock.calls[1]![1].expectedVersion).toBe(3);
  });

  it("goes read-only after a 409 RELATIONSHIP_ENDED and reload", async () => {
    api.saveClientSubscription.mockRejectedValue(
      conflict("RELATIONSHIP_ENDED", "Coaching relationship has ended."),
    );
    renderPage();
    const dialog = await openDrawer();
    fireEvent.change(within(dialog).getByLabelText("Plan name"), { target: { value: "Hybrid" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText("Coaching relationship has ended.")).toBeTruthy();
    api.getClientSettings.mockResolvedValue(
      settings({ relationshipStatus: "ended", readOnly: true, endedAt: "2026-10-30T04:30:00.000Z" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Reload latest" }));
    expect(await screen.findByTestId("cs-readonly-banner")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit subscription" })).toBeNull();
  });

  it("shows an error code, not a guessed cause, when the save fails otherwise; retry reuses the key", async () => {
    api.saveClientSubscription.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();
    const dialog = await openDrawer();
    fireEvent.change(within(dialog).getByLabelText("Plan name"), { target: { value: "Hybrid" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText("Couldn't save. Try again. (CS-SUB-SAVE)")).toBeTruthy();
    expect(within(dialog).queryByText(/Failed to fetch/)).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Reload latest" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.saveClientSubscription).toHaveBeenCalledTimes(2));
    expect(api.saveClientSubscription.mock.calls[1]![2]).toBe(api.saveClientSubscription.mock.calls[0]![2]);
  });

  it("disables saving while offline", async () => {
    renderPage({ online: false });
    expect(
      ((await screen.findByRole("button", { name: "Edit subscription" })) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("closes on Escape and returns focus to Edit", async () => {
    renderPage();
    await openDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit subscription" })),
    );
  });
});

describe("subscription draft rules", () => {
  it("parses rupee amounts into paise", () => {
    expect(parseRupeesInput("")).toBeNull();
    expect(parseRupeesInput("₹ 18,000")).toBe(1_800_000);
    expect(parseRupeesInput("0")).toBe(0);
    expect(parseRupeesInput("499.5")).toBe(49_950);
    expect(parseRupeesInput("1.234")).toBe("invalid");
    expect(parseRupeesInput("-5")).toBe("invalid");
    expect(parseRupeesInput("10000001")).toBe("invalid");
  });

  it("matches the contract's renewal-after-start rule", () => {
    const base = {
      planName: "Plan",
      paymentFrequency: "monthly" as const,
      startsOn: "2026-09-07",
      renewsOn: "2026-08-31",
      amount: "",
      coachingMode: null,
    };
    expect(validateSubscriptionDraft(base).renewsOn).toBe(
      "Renewal date must be after the start date, Mon 7 Sep.",
    );
    expect(validateSubscriptionDraft({ ...base, renewsOn: "2026-11-07" })).toEqual({});
  });
});
