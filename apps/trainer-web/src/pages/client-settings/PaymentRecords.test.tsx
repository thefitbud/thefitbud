/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { ClientSettingsResponse, PaymentRecord } from "@fitbud/contracts";
import {
  createPaymentRecordRequestSchema,
  updatePaymentRecordRequestSchema,
} from "@fitbud/contracts";
import { ApiClientError } from "@fitbud/api-client";

const REL_ID = "c422296e-ed7b-4196-a2b4-647096af3002";
const SUB_ID = "5b0b8a52-2d0f-4a8e-9f55-0d7a3c1b9e01";
const PAID_ID = "8d6e3f1a-1c2b-4d5e-8f90-a1b2c3d4e5f6";
const UNPAID_ID = "9e7f4a2b-2d3c-4e6f-9a01-b2c3d4e5f6a7";
const NEW_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const api = vi.hoisted(() => ({
  getClientSettings: vi.fn(),
  createPaymentRecord: vi.fn(),
  updatePaymentRecord: vi.fn(),
}));
vi.mock("../../lib/api", () => ({ apiClient: api }));
const authMe = vi.hoisted(() => ({
  timezone: "Asia/Kolkata" as string | null,
}));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ me: authMe }) }));

import { ClientSettingsPage } from "./ClientSettingsPage";
import {
  buildUpdateBody,
  validatePaymentDraft,
  type PaymentDraft,
} from "./PaymentDrawer";

function record(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: PAID_ID,
    relationshipId: REL_ID,
    subscriptionVersionId: SUB_ID,
    amountPaise: 600_000,
    dueOn: "2026-08-24",
    paidOn: "2026-08-25",
    status: "paid",
    method: "upi",
    note: "Month 1",
    createdAt: "2026-08-24T04:30:00.000Z",
    updatedAt: "2026-08-25T04:30:00.000Z",
    ...overrides,
  };
}

const unpaid = record({
  id: UNPAID_ID,
  dueOn: "2026-10-24",
  paidOn: null,
  status: "unpaid",
  method: null,
  note: null,
  createdAt: "2026-10-01T04:30:00.000Z",
  updatedAt: "2026-10-01T04:30:00.000Z",
});

function settings(
  overrides: Partial<ClientSettingsResponse> = {},
): ClientSettingsResponse {
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
      id: SUB_ID,
      versionNumber: 2,
      planName: "Fat Loss 12-week",
      paymentFrequency: "monthly",
      startsOn: "2026-08-24",
      renewsOn: "2026-10-24",
      renewalState: "current",
      amountPaise: 600_000,
      subscriptionType: "monthly",
      coachingMode: "online",
      createdAt: "2026-08-24T04:30:00.000Z",
    },
    // Newest due date first, as the API lists them.
    payments: [unpaid, record()],
    ...overrides,
  };
}

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
    openWorkspaceModal: vi.fn(),
    reloadWorkspace: vi.fn(),
    relationshipId: REL_ID,
    online,
    ended,
    refreshEpoch: 0,
  };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/settings#subscription`]}>
      <Routes>
        <Route
          path="/clients/:relationshipId"
          element={<Outlet context={context} />}
        >
          <Route path="settings" element={<ClientSettingsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

async function openAdd() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Add payment record" }),
  );
  return screen.getByRole("dialog", { name: "Add payment record" });
}

async function openEdit(name: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name }));
  return screen.getByRole("dialog", { name: "Edit payment record" });
}

function rows() {
  return within(screen.getByTestId("cs-payments"))
    .getAllByTestId("cs-payment-row")
    .map((row) => row.textContent ?? "");
}

beforeEach(() => {
  api.getClientSettings.mockResolvedValue(settings());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Payment records (frames 209 / IP-08, tracking only)", () => {
  it("lists every record with readable dates, labels, note and paid date", async () => {
    renderPage();
    const payments = await screen.findByTestId("cs-payments");
    for (const name of [
      "Due",
      "Note",
      "Amount",
      "Status",
      "Method",
      "Paid on",
    ]) {
      expect(within(payments).getByRole("columnheader", { name })).toBeTruthy();
    }
    expect(rows()).toEqual([
      expect.stringMatching(/^Sat 24 Oct.*₹6,000.*Unpaid.*Edit$/),
      expect.stringMatching(
        /^Mon 24 Aug.*Month 1.*₹6,000.*Paid.*UPI.*Tue 25 Aug.*Edit$/,
      ),
    ]);
    expect(
      within(payments).getByRole("button", {
        name: "Edit payment record due Mon 24 Aug, ₹6,000",
      }),
    ).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}|\bupi\b|\bunpaid\b|%/);
    // Tracking only (D-W8-2, D-P2-12): no collect, pay, invoice or gateway words.
    expect(text).not.toMatch(
      /collect|pay now|invoice|gateway|remind .* to pay|sessions? (left|used)/i,
    );
  });

  it("adds a paid record with one idempotency key and shows it in the list", async () => {
    const created = record({
      id: NEW_ID,
      dueOn: "2026-09-24",
      paidOn: "2026-09-26",
      method: "cash",
      amountPaise: 650_050,
      note: "Month 2",
      createdAt: "2026-09-26T04:30:00.000Z",
    });
    api.createPaymentRecord.mockResolvedValue(created);
    renderPage();
    const dialog = await openAdd();
    // Tracking-only fields, nothing that takes money.
    expect(within(dialog).getByText("Tracking only.")).toBeTruthy();
    expect(dialog.textContent).not.toMatch(/collect|invoice|gateway|pay now/i);
    expect(
      (within(dialog).getByRole("radio", { name: "Paid" }) as HTMLInputElement)
        .checked,
    ).toBe(true);

    fireEvent.change(within(dialog).getByLabelText("Amount"), {
      target: { value: "6,500.50" },
    });
    fireEvent.change(within(dialog).getByLabelText("Due date"), {
      target: { value: "2026-09-24" },
    });
    fireEvent.change(within(dialog).getByLabelText("Paid date"), {
      target: { value: "2026-09-26" },
    });
    expect(within(dialog).getByText("Thu 24 Sep")).toBeTruthy();
    expect(within(dialog).getByText("Sat 26 Sep")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Cash" }));
    fireEvent.change(within(dialog).getByLabelText("Note (optional)"), {
      target: { value: "  Month 2 " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add record" }));

    await waitFor(() =>
      expect(api.createPaymentRecord).toHaveBeenCalledTimes(1),
    );
    const [relId, body, key] = api.createPaymentRecord.mock.calls[0]!;
    expect(relId).toBe(REL_ID);
    expect(body).toEqual({
      amountPaise: 650_050,
      dueOn: "2026-09-24",
      status: "paid",
      paidOn: "2026-09-26",
      method: "cash",
      note: "Month 2",
    });
    expect(createPaymentRecordRequestSchema.safeParse(body).success).toBe(true);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status").textContent).toBe(
      "Payment record added.",
    );
    // Sorted into place by due date, between the two existing records.
    expect(rows()).toEqual([
      expect.stringMatching(/^Sat 24 Oct/),
      expect.stringMatching(
        /^Thu 24 Sep.*Month 2.*₹6,500\.50.*Paid.*Cash.*Sat 26 Sep/,
      ),
      expect.stringMatching(/^Mon 24 Aug/),
    ]);
  });

  it("adds an unpaid record without a paid date or method", async () => {
    api.createPaymentRecord.mockResolvedValue(
      record({
        id: NEW_ID,
        dueOn: "2026-11-24",
        status: "unpaid",
        paidOn: null,
        method: null,
        note: null,
      }),
    );
    renderPage();
    const dialog = await openAdd();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Unpaid" }));
    expect(within(dialog).queryByLabelText("Paid date")).toBeNull();
    expect(within(dialog).queryByRole("radio", { name: "UPI" })).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Amount"), {
      target: { value: "6000" },
    });
    fireEvent.change(within(dialog).getByLabelText("Due date"), {
      target: { value: "2026-11-24" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add record" }));
    await waitFor(() =>
      expect(api.createPaymentRecord).toHaveBeenCalledTimes(1),
    );
    const body = api.createPaymentRecord.mock.calls[0]![1];
    expect(body).toEqual({
      amountPaise: 600_000,
      dueOn: "2026-11-24",
      status: "unpaid",
      paidOn: null,
      method: null,
      note: null,
    });
    expect(createPaymentRecordRequestSchema.safeParse(body).success).toBe(true);
  });

  it("blocks saving with a field summary and sends nothing", async () => {
    renderPage();
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText("Amount"), {
      target: { value: "0" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add record" }));
    const summary = await within(dialog).findByRole("alert");
    expect(summary.textContent).toBe("Fix 2 fields to save: Amount, Method");
    expect(within(dialog).getByText("Choose Cash, UPI or Bank.")).toBeTruthy();
    expect(document.activeElement).toBe(
      within(dialog).getByLabelText("Amount"),
    );
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Add record",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(api.createPaymentRecord).not.toHaveBeenCalled();
  });

  it("marks an unpaid record paid, sending only the changed fields", async () => {
    api.updatePaymentRecord.mockResolvedValue({
      ...unpaid,
      status: "paid",
      paidOn: "2026-10-26",
      method: "bank",
      updatedAt: "2026-10-26T04:30:00.000Z",
    });
    renderPage();
    const dialog = await openEdit(/Edit payment record due Sat 24 Oct/);
    // Amount and due date are fixed on an existing record.
    expect(
      within(dialog).queryByRole("textbox", { name: "Amount" }),
    ).toBeNull();
    expect(within(dialog).getByText("₹6,000")).toBeTruthy();
    expect(within(dialog).getByText("Sat 24 Oct")).toBeTruthy();
    expect(within(dialog).queryByLabelText("Paid date")).toBeNull();
    expect(
      within(dialog).getByText(
        "Amount and due date can't be changed after a record is added.",
      ),
    ).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("radio", { name: "Paid" }));
    fireEvent.change(within(dialog).getByLabelText("Paid date"), {
      target: { value: "2026-10-26" },
    });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Bank" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(api.updatePaymentRecord).toHaveBeenCalledTimes(1),
    );
    const [relId, paymentId, body] = api.updatePaymentRecord.mock.calls[0]!;
    expect([relId, paymentId]).toEqual([REL_ID, UNPAID_ID]);
    expect(body).toEqual({
      status: "paid",
      paidOn: "2026-10-26",
      method: "bank",
    });
    expect(updatePaymentRecordRequestSchema.safeParse(body).success).toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status").textContent).toBe(
      "Payment record saved.",
    );
    expect(rows()[0]).toMatch(/^Sat 24 Oct.*Paid.*Bank.*Mon 26 Oct/);
  });

  it("changes only the note when only the note changes", async () => {
    api.updatePaymentRecord.mockResolvedValue(
      record({ note: "Month 1, paid late" }),
    );
    renderPage();
    const dialog = await openEdit(/Edit payment record due Mon 24 Aug/);
    fireEvent.change(within(dialog).getByLabelText("Note (optional)"), {
      target: { value: "Month 1, paid late" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(api.updatePaymentRecord).toHaveBeenCalledTimes(1),
    );
    expect(api.updatePaymentRecord.mock.calls[0]![2]).toEqual({
      note: "Month 1, paid late",
    });
  });

  it("going back to unpaid sends only the status", async () => {
    api.updatePaymentRecord.mockResolvedValue(
      record({ status: "unpaid", paidOn: null, method: null }),
    );
    renderPage();
    const dialog = await openEdit(/Edit payment record due Mon 24 Aug/);
    fireEvent.click(within(dialog).getByRole("radio", { name: "Unpaid" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(api.updatePaymentRecord).toHaveBeenCalledTimes(1),
    );
    const body = api.updatePaymentRecord.mock.calls[0]![2];
    expect(body).toEqual({ status: "unpaid" });
    expect(updatePaymentRecordRequestSchema.safeParse(body).success).toBe(true);
  });

  it("closes without a request when nothing changed", async () => {
    renderPage();
    const dialog = await openEdit(/Edit payment record due Mon 24 Aug/);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.updatePaymentRecord).not.toHaveBeenCalled();
  });

  it("reuses the idempotency key on retry and shows an error code, not a guessed cause", async () => {
    api.createPaymentRecord
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(record({ id: NEW_ID, dueOn: "2026-09-24" }));
    renderPage();
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText("Amount"), {
      target: { value: "6000" },
    });
    fireEvent.change(within(dialog).getByLabelText("Due date"), {
      target: { value: "2026-09-24" },
    });
    fireEvent.change(within(dialog).getByLabelText("Paid date"), {
      target: { value: "2026-09-24" },
    });
    fireEvent.click(within(dialog).getByRole("radio", { name: "UPI" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add record" }));
    expect(
      await within(dialog).findByText(
        "Couldn't save. Try again. (CS-PAY-SAVE)",
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/Failed to fetch/)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Add record" }));
    await waitFor(() =>
      expect(api.createPaymentRecord).toHaveBeenCalledTimes(2),
    );
    const first = api.createPaymentRecord.mock.calls[0]!;
    const second = api.createPaymentRecord.mock.calls[1]!;
    expect(second[1]).toEqual(first[1]);
    expect(second[2]).toBe(first[2]);
  });

  it("takes a new key when the change itself changes after a failure", async () => {
    api.updatePaymentRecord
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(record({ note: "B" }));
    renderPage();
    const dialog = await openEdit(/Edit payment record due Mon 24 Aug/);
    const note = within(dialog).getByLabelText("Note (optional)");
    fireEvent.change(note, { target: { value: "A" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await within(dialog).findByText(/CS-PAY-SAVE/);
    fireEvent.change(note, { target: { value: "B" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(api.updatePaymentRecord).toHaveBeenCalledTimes(2),
    );
    expect(api.updatePaymentRecord.mock.calls[1]![3]).not.toBe(
      api.updatePaymentRecord.mock.calls[0]![3],
    );
  });

  it("on 409 PAYMENT_CONFLICT shows the API message and reloads the latest records", async () => {
    api.updatePaymentRecord.mockRejectedValue(
      new ApiClientError({
        status: 409,
        code: "PAYMENT_CONFLICT",
        message:
          "This payment record changed while saving. Reload and try again.",
        requestId: "req-7",
      }),
    );
    renderPage();
    const dialog = await openEdit(/Edit payment record due Mon 24 Aug/);
    fireEvent.change(within(dialog).getByLabelText("Note (optional)"), {
      target: { value: "x" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    expect(
      await within(dialog).findByText(
        "This payment record changed while saving. Reload and try again.",
      ),
    ).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Save changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    api.getClientSettings.mockResolvedValue(
      settings({ payments: [record({ note: "Elsewhere" })] }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reload latest" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(rows()).toEqual([expect.stringMatching(/Elsewhere/)]),
    );
    expect(api.getClientSettings).toHaveBeenCalledTimes(2);
  });

  it("on 409 RELATIONSHIP_ENDED reloads into the read-only page", async () => {
    api.createPaymentRecord.mockRejectedValue(
      new ApiClientError({
        status: 409,
        code: "RELATIONSHIP_ENDED",
        message: "Coaching with this client has ended.",
        requestId: "req-8",
      }),
    );
    renderPage();
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText("Amount"), {
      target: { value: "6000" },
    });
    fireEvent.change(within(dialog).getByLabelText("Due date"), {
      target: { value: "2026-09-24" },
    });
    fireEvent.change(within(dialog).getByLabelText("Paid date"), {
      target: { value: "2026-09-24" },
    });
    fireEvent.click(within(dialog).getByRole("radio", { name: "UPI" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add record" }));
    await within(dialog).findByText("Coaching with this client has ended.");
    api.getClientSettings.mockResolvedValue(
      settings({
        relationshipStatus: "ended",
        readOnly: true,
        endedAt: "2026-10-30T04:30:00.000Z",
      }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reload latest" }),
    );
    await screen.findByTestId("cs-readonly-banner");
    expect(
      screen.queryByRole("button", { name: "Add payment record" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Edit payment record/ }),
    ).toBeNull();
  });

  it("is read-only for an ended client: records listed, no add or edit", async () => {
    api.getClientSettings.mockResolvedValue(
      settings({
        relationshipStatus: "ended",
        readOnly: true,
        endedAt: "2026-10-30T04:30:00.000Z",
      }),
    );
    renderPage({ ended: true });
    const payments = await screen.findByTestId("cs-payments");
    expect(rows()).toHaveLength(2);
    expect(within(payments).queryAllByRole("button")).toHaveLength(0);
    expect(
      within(payments).queryByRole("columnheader", { name: "Actions" }),
    ).toBeNull();
  });

  it("asks for a subscription before the first record (the API needs one)", async () => {
    api.getClientSettings.mockResolvedValue(
      settings({ subscription: null, payments: [] }),
    );
    renderPage();
    expect(await screen.findByText("No payment records yet.")).toBeTruthy();
    expect(
      screen.getByText(
        "Save a subscription first, then add payment records to it.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Add payment record" }),
    ).toBeNull();
  });

  it("disables add and edit while offline", async () => {
    renderPage({ online: false });
    const add = (await screen.findByRole("button", {
      name: "Add payment record",
    })) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    for (const button of screen.getAllByRole("button", {
      name: /Edit payment record/,
    })) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("returns focus to the control that opened the drawer", async () => {
    renderPage();
    const edit = await screen.findByRole("button", {
      name: /Edit payment record due Mon 24 Aug/,
    });
    fireEvent.click(edit);
    const dialog = screen.getByRole("dialog", { name: "Edit payment record" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(edit));
  });
});

describe("today in the trainer's timezone", () => {
  afterEach(() => {
    vi.useRealTimers();
    authMe.timezone = "Asia/Kolkata";
  });

  it("defaults new due and paid dates to the trainer's civil today, not the browser's", async () => {
    // 20:00 UTC on Tue 10 Nov is already Wed 11 Nov in Kolkata, still Tue in Los Angeles.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T20:00:00.000Z"));
    authMe.timezone = "Asia/Kolkata";
    renderPage();
    let dialog = await openAdd();
    expect(within(dialog).getAllByText("Wed 11 Nov")).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    cleanup();

    authMe.timezone = "America/Los_Angeles";
    renderPage();
    dialog = await openAdd();
    expect(within(dialog).getAllByText("Tue 10 Nov")).toHaveLength(2);
  });
});

describe("payment draft rules", () => {
  const base: PaymentDraft = {
    amount: "6000",
    dueOn: "2026-09-24",
    status: "paid",
    paidOn: "2026-09-24",
    method: "upi",
    note: "",
  };

  it("mirrors the contract: amount above ₹0, paid needs date and method", () => {
    expect(validatePaymentDraft(base, false)).toEqual({});
    expect(validatePaymentDraft({ ...base, amount: "" }, false).amount).toBe(
      "Enter the amount.",
    );
    expect(
      validatePaymentDraft({ ...base, amount: "0" }, false).amount,
    ).toMatch(/from ₹0.01/);
    expect(
      validatePaymentDraft({ ...base, amount: "12abc" }, false).amount,
    ).toBeTruthy();
    expect(validatePaymentDraft({ ...base, amount: "0.01" }, false)).toEqual(
      {},
    );
    expect(
      validatePaymentDraft({ ...base, paidOn: "", method: null }, false),
    ).toEqual({
      paidOn: "Choose the date it was paid.",
      method: "Choose Cash, UPI or Bank.",
    });
    expect(
      validatePaymentDraft(
        { ...base, status: "unpaid", paidOn: "", method: null },
        false,
      ),
    ).toEqual({});
    expect(
      validatePaymentDraft({ ...base, note: "x".repeat(501) }, false).note,
    ).toBeTruthy();
    // Editing never validates the fixed amount and due date.
    expect(
      validatePaymentDraft({ ...base, amount: "", dueOn: "" }, true),
    ).toEqual({});
  });

  it("builds a PATCH with only the changed fields", () => {
    const stored = record({ note: "Month 1" });
    const same: PaymentDraft = {
      amount: "",
      dueOn: stored.dueOn,
      status: "paid",
      paidOn: stored.paidOn!,
      method: "upi",
      note: " Month 1 ",
    };
    expect(buildUpdateBody(stored, same)).toBe("unchanged");
    expect(buildUpdateBody(stored, { ...same, method: "cash" })).toEqual({
      method: "cash",
    });
    expect(buildUpdateBody(stored, { ...same, note: "" })).toEqual({
      note: null,
    });
    expect(buildUpdateBody(stored, { ...same, status: "unpaid" })).toEqual({
      status: "unpaid",
    });
  });
});
