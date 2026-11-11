/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { ClientSettingsResponse } from "@fitbud/contracts";
import { ApiClientError } from "@fitbud/api-client";

const REL_ID = "c422296e-ed7b-4196-a2b4-647096af3002";

const api = vi.hoisted(() => ({
  getClientSettings: vi.fn(),
  updateClientBasics: vi.fn(),
}));
vi.mock("../../lib/api", () => ({ apiClient: api }));

import { ClientSettingsPage } from "./ClientSettingsPage";
import { parsePhoneInput, renewalChipLabel } from "./clientSettingsFormat";

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
    subscription: {
      id: "5b0b8a52-2d0f-4a8e-9f55-0d7a3c1b9e01",
      versionNumber: 2,
      planName: "Fat Loss 12-week",
      paymentFrequency: "monthly",
      startsOn: "2026-08-24",
      renewsOn: "2026-10-24",
      renewalState: "current",
      amountPaise: 400_000,
      subscriptionType: "monthly",
      coachingMode: "in_person",
      createdAt: "2026-08-24T04:30:00.000Z",
    },
    payments: [
      {
        id: "8d6e3f1a-1c2b-4d5e-8f90-a1b2c3d4e5f6",
        relationshipId: REL_ID,
        subscriptionVersionId: "5b0b8a52-2d0f-4a8e-9f55-0d7a3c1b9e01",
        amountPaise: 600_000,
        dueOn: "2026-09-24",
        paidOn: "2026-09-24",
        status: "paid",
        method: "upi",
        note: null,
        createdAt: "2026-09-24T04:30:00.000Z",
        updatedAt: "2026-09-24T04:30:00.000Z",
      },
      {
        id: "9e7f4a2b-2d3c-4e6f-9a01-b2c3d4e5f6a7",
        relationshipId: REL_ID,
        subscriptionVersionId: "5b0b8a52-2d0f-4a8e-9f55-0d7a3c1b9e01",
        amountPaise: 600_000,
        dueOn: "2026-10-24",
        paidOn: null,
        status: "unpaid",
        method: null,
        note: null,
        createdAt: "2026-10-24T04:30:00.000Z",
        updatedAt: "2026-10-24T04:30:00.000Z",
      },
    ],
    ...overrides,
  };
}

const openWorkspaceModal = vi.fn();

function renderPage({ ended = false, online = true } = {}) {
  const context = {
    workspace: {
      header: {
        relationshipId: REL_ID,
        traineeDisplayName: "Rohan Mehta",
        onboardingStatus: ended ? "ended" : "active",
        traineeProfile: { displayName: "Rohan Mehta", age: 29, gender: "male" },
        traineeTimezone: "Asia/Kolkata",
      },
    },
    openWorkspaceModal,
    relationshipId: REL_ID,
    online,
    ended,
    refreshEpoch: 0,
  };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/settings`]}>
      <Routes>
        <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
          <Route path="settings" element={<ClientSettingsPage />} />
          <Route path="configure" element={<p>coaching setup route</p>} />
          <Route path="overview" element={<p>overview route</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.getClientSettings.mockResolvedValue(settings());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClientSettingsPage overview (frame 209)", () => {
  it("shows the four sections with formatted dates, amounts and labels", async () => {
    renderPage();
    const basic = await screen.findByTestId("cs-section-basic");
    expect(api.getClientSettings).toHaveBeenCalledWith(REL_ID);
    expect(within(basic).getByText("Rohan Mehta")).toBeTruthy();
    expect(within(basic).getByText("+91 90000 00008")).toBeTruthy();
    expect(within(basic).getByText("Male")).toBeTruthy();
    expect(within(basic).getByText("29")).toBeTruthy();

    const sub = screen.getByTestId("cs-section-subscription");
    expect(within(sub).getByText("Fat Loss 12-week")).toBeTruthy();
    expect(within(sub).getByText("Monthly")).toBeTruthy();
    expect(within(sub).getByText("Mon 24 Aug")).toBeTruthy();
    expect(within(sub).getAllByText("Sat 24 Oct").length).toBeGreaterThanOrEqual(1);
    expect(within(sub).getByText("₹4,000")).toBeTruthy();

    const payments = screen.getByTestId("cs-payments");
    expect(within(payments).getAllByText("₹6,000")).toHaveLength(2);
    expect(within(payments).getByText("Thu 24 Sep")).toBeTruthy();
    expect(within(payments).getByText("Paid")).toBeTruthy();
    expect(within(payments).getByText("Unpaid")).toBeTruthy();
    expect(within(payments).getByText("UPI")).toBeTruthy();

    const rel = screen.getByTestId("cs-section-relationship");
    expect(within(rel).getByText(/^Mon 24 Aug/)).toBeTruthy();
    expect(within(rel).getByText("In person")).toBeTruthy();

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toMatch(/in_person|\bupi\b|\bunpaid\b|%/);
    // D-W8-2: no session or package counts, no collect/pay actions.
    expect(text).not.toMatch(/sessions? (left|used|remaining)|Add package|Renew package/i);
    expect(text).not.toMatch(/Collect|Pay now|Invoice/);
    expect(text).not.toMatch(/Add payment record/);
    // Frame 211/212 footnote is not built: spec wins over frame copy (orchestrator, Z8-3).
    expect(text).not.toMatch(/collect payments|invoice|remind clients to pay/i);
    expect(within(payments).getByRole("columnheader", { name: "Due" })).toBeTruthy();
  });

  it("shows the trainer-set name and contact phone over the profile values", async () => {
    api.getClientSettings.mockResolvedValue(
      settings({
        basics: {
          displayName: "Rohan Mehta",
          phoneE164: "+919000000008",
          clientDisplayName: "Rohan M (Tue/Thu)",
          contactPhoneE164: "+447700900123",
        },
      }),
    );
    renderPage();
    const basic = await screen.findByTestId("cs-section-basic");
    expect(within(basic).getByTestId("cs-basic-name").textContent).toContain("Rohan M (Tue/Thu)");
    expect(within(basic).getByTestId("cs-basic-phone").textContent).toContain("+447700900123");
  });

  it("shows empty states before a subscription or payments exist", async () => {
    api.getClientSettings.mockResolvedValue(settings({ subscription: null, payments: [] }));
    renderPage();
    expect(await screen.findByText("No subscription saved yet.")).toBeTruthy();
    expect(screen.getByText("No payment records yet.")).toBeTruthy();
  });

  it("links the coaching note to Plan › Coaching setup and opens End coaching", async () => {
    renderPage();
    await screen.findByTestId("cs-section-basic");
    fireEvent.click(screen.getByRole("button", { name: "End coaching…" }));
    expect(openWorkspaceModal).toHaveBeenCalledWith({ type: "end" });
    fireEvent.click(screen.getAllByRole("link", { name: "Plan › Coaching setup" })[0]!);
    expect(await screen.findByText("coaching setup route")).toBeTruthy();
  });

  it("is read-only for an ended client", async () => {
    api.getClientSettings.mockResolvedValue(
      settings({ relationshipStatus: "ended", readOnly: true, endedAt: "2026-10-30T04:30:00.000Z" }),
    );
    renderPage({ ended: true });
    await screen.findByTestId("cs-section-basic");
    expect(screen.queryByRole("button", { name: "Edit basic details" })).toBeNull();
    expect(screen.queryByRole("button", { name: "End coaching…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit subscription" })).toBeNull();
    // Frame 212: lock line, Ended chip, renewal row and the coached range.
    expect(screen.getByTestId("cs-readonly-banner").textContent).toBe(
      "Coaching with Rohan ended Fri 30 Oct. Client settings are read-only.",
    );
    const sub = screen.getByTestId("cs-section-subscription");
    expect(within(sub).getByText("Ended")).toBeTruthy();
    expect(within(sub).getByText("Ended Fri 30 Oct")).toBeTruthy();
    expect(within(sub).queryByText(/Renews in|Renews today|Renewal expired/)).toBeNull();
    const rel = screen.getByTestId("cs-section-relationship");
    expect(within(rel).getByText("Mon 24 Aug — Fri 30 Oct")).toBeTruthy();
    // No write controls anywhere on the page.
    expect(screen.queryAllByRole("button").map((b) => b.textContent)).toEqual([]);
    expect(document.querySelectorAll("input, select, textarea")).toHaveLength(0);
  });

  it("is read-only when only the server says so (relationship ended elsewhere)", async () => {
    api.getClientSettings.mockResolvedValue(
      settings({ relationshipStatus: "ended", readOnly: true, endedAt: "2026-10-30T04:30:00.000Z" }),
    );
    renderPage({ ended: false });
    await screen.findByTestId("cs-readonly-banner");
    expect(screen.queryByRole("button", { name: "Edit subscription" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit basic details" })).toBeNull();
  });

  it("shows the API's message when loading fails", async () => {
    api.getClientSettings.mockRejectedValue(
      new ApiClientError({ status: 404, code: "NOT_FOUND", message: "Client not found.", requestId: "req-1" }),
    );
    renderPage();
    expect(await screen.findByText("Client not found.")).toBeTruthy();
  });

  it("shows an error code, not a guessed cause, when loading fails otherwise", async () => {
    api.getClientSettings.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();
    expect(await screen.findByText(/\(CS-LOAD\)/)).toBeTruthy();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });
});

describe("Edit basic details drawer (frame 210)", () => {
  async function openDrawer() {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit basic details" }));
    return screen.getByRole("dialog", { name: "Edit basic details" });
  }

  it("saves only the changed name and contact phone (relationship fields)", async () => {
    api.updateClientBasics.mockResolvedValue(
      settings({
        basics: {
          displayName: "Rohan Mehta",
          phoneE164: "+919000000008",
          clientDisplayName: "Rohan M",
          contactPhoneE164: "+919876543210",
        },
      }),
    );
    const dialog = await openDrawer();
    const name = within(dialog).getByLabelText("Name") as HTMLInputElement;
    const phone = within(dialog).getByLabelText("Contact phone") as HTMLInputElement;
    expect(name.value).toBe("Rohan Mehta");
    expect(phone.value).toBe("90000 00008");
    expect(document.activeElement).toBe(name);

    fireEvent.change(name, { target: { value: "  Rohan M " } });
    fireEvent.change(phone, { target: { value: "98765 43210" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.updateClientBasics).toHaveBeenCalledTimes(1));
    const [rid, body, key] = api.updateClientBasics.mock.calls[0]!;
    expect(rid).toBe(REL_ID);
    // Only the Z6-8b fields exist in the body; no goal, profile or identity field.
    expect(body).toEqual({ displayName: "Rohan M", contactPhone: "+919876543210" });
    expect(typeof key).toBe("string");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const basic = screen.getByTestId("cs-section-basic");
    expect(within(basic).getByText("Rohan M")).toBeTruthy();
    expect(within(basic).getByText("+91 98765 43210")).toBeTruthy();
  });

  it("sends only the field that changed", async () => {
    api.updateClientBasics.mockResolvedValue(settings());
    const dialog = await openDrawer();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Rohan" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateClientBasics).toHaveBeenCalledTimes(1));
    expect(api.updateClientBasics.mock.calls[0]![1]).toEqual({ displayName: "Rohan" });
  });

  it("closes without a request when nothing changed", async () => {
    const dialog = await openDrawer();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.updateClientBasics).not.toHaveBeenCalled();
  });

  it("validates the name and phone before saving", async () => {
    const dialog = await openDrawer();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "   " } });
    fireEvent.change(within(dialog).getByLabelText("Contact phone"), {
      target: { value: "12345" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText("Enter a name.")).toBeTruthy();
    expect(within(dialog).getByText(/10-digit mobile number/)).toBeTruthy();
    expect(within(dialog).getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");
    // Focus moves to the first invalid field.
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Name"));
    expect(api.updateClientBasics).not.toHaveBeenCalled();
  });

  it("focuses the phone field when only the phone is invalid", async () => {
    const dialog = await openDrawer();
    fireEvent.change(within(dialog).getByLabelText("Contact phone"), {
      target: { value: "12345" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await within(dialog).findByText(/10-digit mobile number/);
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Contact phone"));
  });

  it("clears a saved contact phone with null", async () => {
    api.getClientSettings.mockResolvedValue(
      settings({
        basics: {
          displayName: "Rohan Mehta",
          phoneE164: "+919000000008",
          clientDisplayName: null,
          contactPhoneE164: "+919876543210",
        },
      }),
    );
    api.updateClientBasics.mockResolvedValue(settings());
    const dialog = await openDrawer();
    fireEvent.change(within(dialog).getByLabelText("Contact phone"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateClientBasics).toHaveBeenCalledTimes(1));
    expect(api.updateClientBasics.mock.calls[0]![1]).toEqual({ contactPhone: null });
  });

  it("shows the API message on a refused save and reuses the key on retry", async () => {
    api.updateClientBasics.mockRejectedValue(
      new ApiClientError({
        status: 409,
        code: "RELATIONSHIP_ENDED",
        message: "Coaching has ended for this client.",
        requestId: "req-2",
      }),
    );
    const dialog = await openDrawer();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Rohan" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText("Coaching has ended for this client.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateClientBasics).toHaveBeenCalledTimes(2));
    expect(api.updateClientBasics.mock.calls[1]![2]).toBe(api.updateClientBasics.mock.calls[0]![2]);
  });

  it("uses a new idempotency key when the body changes after a failed save", async () => {
    api.updateClientBasics.mockRejectedValue(
      new ApiClientError({
        status: 503,
        code: "UNAVAILABLE",
        message: "Service unavailable. Try again.",
        requestId: "req-3",
      }),
    );
    const dialog = await openDrawer();
    const name = within(dialog).getByLabelText("Name");
    fireEvent.change(name, { target: { value: "Rohan" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateClientBasics).toHaveBeenCalledTimes(1));
    await within(dialog).findByText("Service unavailable. Try again.");
    fireEvent.change(name, { target: { value: "Rohan M" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateClientBasics).toHaveBeenCalledTimes(2));
    expect(api.updateClientBasics.mock.calls[1]![1]).toEqual({ displayName: "Rohan M" });
    expect(api.updateClientBasics.mock.calls[1]![2]).not.toBe(
      api.updateClientBasics.mock.calls[0]![2],
    );
  });

  it("does not close on Escape while a save is in flight", async () => {
    let resolveSave: (value: ClientSettingsResponse) => void = () => {};
    api.updateClientBasics.mockReturnValue(
      new Promise<ClientSettingsResponse>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const dialog = await openDrawer();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Rohan" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await within(dialog).findByRole("button", { name: "Saving…" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    resolveSave(settings());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes on Escape and traps Tab inside the drawer", async () => {
    const dialog = await openDrawer();
    const close = within(dialog).getByRole("button", { name: "Close" });
    const save = within(dialog).getByRole("button", { name: "Save changes" });
    save.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(save);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.updateClientBasics).not.toHaveBeenCalled();
  });

  it("disables saving while offline", async () => {
    renderPage({ online: false });
    const edit = await screen.findByRole("button", { name: "Edit basic details" });
    expect((edit as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("client settings formatting", () => {
  it("parses Indian and international phone input", () => {
    expect(parsePhoneInput("90000 00008")).toEqual({ kind: "ok", e164: "+919000000008" });
    expect(parsePhoneInput("+91 90000 00008")).toEqual({ kind: "ok", e164: "+919000000008" });
    expect(parsePhoneInput("+44 7700 900123")).toEqual({ kind: "ok", e164: "+447700900123" });
    expect(parsePhoneInput("")).toEqual({ kind: "empty" });
    expect(parsePhoneInput("12345")).toEqual({ kind: "invalid" });
    expect(parsePhoneInput("900000000a")).toEqual({ kind: "invalid" });
    // 11 digits without "+" is not an Indian mobile.
    expect(parsePhoneInput("09000000008")).toEqual({ kind: "invalid" });
  });

  it("labels renewal from the server state", () => {
    expect(renewalChipLabel({ renewalState: "upcoming", renewsOn: "2026-10-24" }, "2026-10-18")).toBe(
      "Renews in 6 d",
    );
    expect(renewalChipLabel({ renewalState: "due", renewsOn: "2026-10-24" }, "2026-10-24")).toBe(
      "Renews today",
    );
    expect(renewalChipLabel({ renewalState: "expired", renewsOn: "2026-10-24" }, "2026-10-30")).toBe(
      "Renewal expired",
    );
    expect(renewalChipLabel({ renewalState: "current", renewsOn: "2026-12-24" }, "2026-10-30")).toBeNull();
  });
});
