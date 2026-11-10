/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { Checkin } from "@fitbud/contracts";
import {
  GLOBAL_CHECKIN_FORM_TEMPLATE_ID,
  GLOBAL_CHECKIN_FORM_V1_VERSION_ID,
  GLOBAL_CHECKIN_FORM_V2_VERSION_ID,
} from "@fitbud/core";

const REL_ID = "77777777-7777-4777-8777-777777777777";
const TRAINER_ID = "88888888-8888-4888-8888-888888888888";
const NOW = new Date("2026-10-19T06:30:00.000Z"); // Mon 19 Oct, 12:00 pm IST

const api = vi.hoisted(() => ({
  listCheckins: vi.fn(),
  listCheckinFormTemplates: vi.fn(),
  scheduleCheckin: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));

import { ClientCheckinsPage, checkinRowState } from "./ClientCheckinsPage";

let seq = 0;
function checkin(input: {
  localDate: string;
  status: Checkin["status"];
  submittedAt?: string | null;
  bodyWeightKg?: number;
  notes?: string;
  review?: { outcome: "acknowledged" | "needs_follow_up" | "adjust_coaching"; notes?: string };
  formVersionId?: string;
}): Checkin {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  // Window: opens 00:00 IST on the day, closes 48 h later.
  const startsAt = new Date(`${input.localDate}T00:00:00+05:30`).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 48 * 3600_000).toISOString();
  const submitted = input.submittedAt ?? null;
  return {
    id,
    coachingRelationshipId: REL_ID,
    checkinScheduleId: null,
    localDate: input.localDate,
    windowStartsAt: startsAt,
    windowEndsAt: endsAt,
    recordStatus: submitted ? "submitted" : "draft",
    recordVersion: 1,
    definitionVersion: 2,
    checkinFormVersionId: input.formVersionId ?? GLOBAL_CHECKIN_FORM_V2_VERSION_ID,
    answers:
      input.bodyWeightKg !== undefined || input.notes !== undefined
        ? {
            ...(input.bodyWeightKg !== undefined
              ? { fieldAnswers: { weight: input.bodyWeightKg } }
              : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          }
        : null,
    submittedAt: submitted,
    status: input.status,
    review: input.review
      ? {
          id: `11111111-0000-4000-8000-${String(seq).padStart(12, "0")}`,
          checkinId: id,
          coachingRelationshipId: REL_ID,
          trainerUserId: TRAINER_ID,
          outcome: input.review.outcome,
          notes: input.review.notes ?? null,
          createdAt: submitted ?? startsAt,
          updatedAt: submitted ?? startsAt,
        }
      : null,
    createdAt: startsAt,
    updatedAt: startsAt,
  };
}

function activeHistory(): Checkin[] {
  return [
    checkin({ localDate: "2026-10-25", status: "scheduled" }),
    checkin({ localDate: "2026-10-16", status: "overdue" }),
    checkin({
      localDate: "2026-10-18",
      status: "submitted",
      submittedAt: "2026-10-18T15:42:00.000Z",
      bodyWeightKg: 88.2,
      notes: "Long week at work, missed two sessions.",
    }),
    checkin({
      localDate: "2026-10-11",
      status: "reviewed",
      submittedAt: "2026-10-11T14:10:00.000Z",
      bodyWeightKg: 88.8,
      review: { outcome: "needs_follow_up", notes: "Let's move leg day to Saturday." },
    }),
    checkin({ localDate: "2026-10-04", status: "overdue" }),
    checkin({
      localDate: "2026-09-27",
      status: "reviewed",
      submittedAt: "2026-09-27T14:35:00.000Z",
      bodyWeightKg: 89.2,
      review: { outcome: "acknowledged" },
    }),
    checkin({
      localDate: "2026-09-20",
      status: "reviewed",
      // Submitted the day after the window closed: 1 d late.
      submittedAt: "2026-09-23T05:00:00.000Z",
      bodyWeightKg: 89.5,
      review: { outcome: "adjust_coaching" },
      formVersionId: GLOBAL_CHECKIN_FORM_V1_VERSION_ID,
    }),
  ];
}

type Status = "active" | "ended";

function renderPage(
  status: Status,
  opts?: {
    phone?: string | null;
    endedAt?: string;
    configStatus?: "active" | "draft" | null;
  },
) {
  const configStatus = opts?.configStatus === undefined ? "active" : opts.configStatus;
  const context = {
    workspace: {
      header: {
        relationshipId: REL_ID,
        traineeDisplayName: status === "ended" ? "Kavya Menon" : "Arjun Kapoor",
        onboardingStatus: status,
        renewalState: null,
        traineeProfile: {
          displayName: "x",
          age: null,
          gender: status === "ended" ? "female" : "male",
        },
        traineeTimezone: "Asia/Kolkata",
        hasCustomMealTimes: false,
        trainerWhatsappE164: null,
        clientWhatsappE164: opts?.phone === undefined ? "919812345678" : opts.phone,
        endedAt: opts?.endedAt ?? null,
      },
      overview: { nextCheckin: null },
      configuration: {
        configuration: configStatus
          ? {
              status: configStatus,
              checkin: { cadence: "weekly", dueWindowHours: 48, formVersionId: null },
            }
          : null,
        subscription: null,
      },
    },
    refreshEpoch: 0,
    relationshipId: REL_ID,
    online: true,
    ended: status === "ended",
  };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/check-ins`]}>
      <Routes>
        <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
          <Route path="check-ins" element={<ClientCheckinsPage />} />
          <Route path="check-ins/:checkinId" element={<p>review route</p>} />
          <Route path="configure" element={<p>configure route</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function chip(name: RegExp) {
  return screen.getByRole("button", { name });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  seq = 0;
  api.listCheckins.mockResolvedValue({ items: activeHistory(), nextCursor: null });
  api.listCheckinFormTemplates.mockResolvedValue({
    items: [
      {
        id: GLOBAL_CHECKIN_FORM_TEMPLATE_ID,
        ownership: "global",
        trainerUserId: null,
        name: "Weekly check-in",
        description: null,
        latestVersionId: GLOBAL_CHECKIN_FORM_V2_VERSION_ID,
        latestVersionNumber: 2,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        ownership: "trainer",
        trainerUserId: TRAINER_ID,
        name: "Monthly review",
        description: null,
        latestVersionId: "33333333-3333-4333-8333-333333333333",
        latestVersionNumber: 1,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    nextCursor: null,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("checkinRowState", () => {
  it("maps server statuses to tab states", () => {
    expect(checkinRowState({ status: "scheduled" }, { ended: false })).toBe("upcoming");
    expect(checkinRowState({ status: "due" }, { ended: false })).toBe("due");
    expect(checkinRowState({ status: "submitted" }, { ended: false })).toBe("to_review");
    expect(checkinRowState({ status: "reviewed" }, { ended: false })).toBe("reviewed");
  });
  it("an active client's overdue check-in always reads Overdue, however old", () => {
    expect(checkinRowState({ status: "overdue" }, { ended: false })).toBe("overdue");
  });
  it("an ended client never has an overdue row: it reads Missed", () => {
    expect(checkinRowState({ status: "overdue" }, { ended: true })).toBe("missed");
  });
});

describe("ClientCheckinsPage chips (162)", () => {
  it("shows the summary and chips with counts", async () => {
    renderPage("active");
    expect(await screen.findByRole("button", { name: /^All 7$/ })).toBeTruthy();
    expect(chip(/^To review 1$/)).toBeTruthy();
    expect(chip(/^Overdue 2$/)).toBeTruthy();
    expect(chip(/^Reviewed 3$/)).toBeTruthy();
    // No server missed status: an active client's Missed chip reads 0.
    expect(chip(/^Missed 0$/)).toBeTruthy();
    expect(chip(/^All 7$/).getAttribute("aria-pressed")).toBe("true");

    expect(screen.getByText("Cadence")).toBeTruthy();
    expect(screen.getByText("Weekly · Weekly check-in")).toBeTruthy();
    expect(screen.getByText("Next check-in")).toBeTruthy();
    expect(screen.getByText("Sun 25 Oct", { selector: "dd" })).toBeTruthy();
    // October: 18 Oct submitted + 11 Oct reviewed of 16, 18, 11, 4 Oct.
    expect(screen.getByText("2 of 4 submitted")).toBeTruthy();

    expect(screen.getByRole("heading", { name: "October" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "September" })).toBeTruthy();
    expect(screen.getByText("Weight 88.2 kg · down 0.6 kg")).toBeTruthy();
    expect(screen.getByText('"Long week at work, missed two sessions."')).toBeTruthy();
    expect(screen.getByText('You: "Let\'s move leg day to Saturday."')).toBeTruthy();
    expect(screen.getByText("Reviewed · Needs follow-up")).toBeTruthy();
    expect(screen.getByText("Overdue · 1 d")).toBeTruthy();
    expect(screen.getByText("Overdue · 13 d")).toBeTruthy();
    expect(screen.getByText(/Submitted Wed 23 Sep, 10:30 am · 1 d late/)).toBeTruthy();
    // The v1 pin still reads its template name.
    expect(screen.getAllByText("Weekly check-in").length).toBeGreaterThan(1);
    // No ISO dates or raw enums.
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toMatch(/needs_follow_up|adjust_coaching|scheduled|overdue\b/);
    expect(text).not.toMatch(/%/);
  });

  it("filters the list by chip", async () => {
    renderPage("active");
    fireEvent.click(await screen.findByRole("button", { name: /^Reviewed 3$/ }));
    expect(chip(/^Reviewed 3$/).getAttribute("aria-pressed")).toBe("true");
    const rows = document.querySelectorAll(".client-checkins-row");
    expect(rows).toHaveLength(3);
    rows.forEach((row) => expect(row.getAttribute("data-state")).toBe("reviewed"));

    fireEvent.click(chip(/^Overdue 2$/));
    const overdue = document.querySelectorAll(".client-checkins-row");
    expect(overdue).toHaveLength(2);
    expect(within(overdue[1] as HTMLElement).getByText("Sun 4 Oct")).toBeTruthy();
    expect(within(overdue[1] as HTMLElement).getByText("Due Sun 4 Oct · not submitted yet")).toBeTruthy();

    fireEvent.click(chip(/^Missed 0$/));
    expect(document.querySelectorAll(".client-checkins-row")).toHaveLength(0);
    expect(screen.getByText("No check-ins match this filter.")).toBeTruthy();

    fireEvent.click(chip(/^To review 1$/));
    expect(document.querySelectorAll(".client-checkins-row")).toHaveLength(1);
    expect(screen.getByText("To review", { selector: "span span" })).toBeTruthy();
  });

  it("rows open the check-in review", async () => {
    renderPage("active");
    const link = await screen.findByRole("link", { name: "Open Sun 18 Oct check-in" });
    fireEvent.click(link);
    expect(await screen.findByText("review route")).toBeTruthy();
  });

  it("Change schedule goes to Coaching setup", async () => {
    renderPage("active");
    const link = await screen.findByRole("link", { name: "Change schedule" });
    expect(link.getAttribute("href")).toBe(`/clients/${REL_ID}/configure`);
  });
});

describe("ClientCheckinsPage overdue WhatsApp draft", () => {
  it("offers a wa.me prefill on overdue rows only", async () => {
    renderPage("active");
    const reminders = await screen.findAllByRole("link", { name: /Remind on WhatsApp/ });
    expect(reminders).toHaveLength(2);
    const remind = reminders[0] as HTMLElement;
    const href = remind.getAttribute("href") ?? "";
    expect(href.startsWith("https://wa.me/919812345678?text=")).toBe(true);
    expect(decodeURIComponent(href.split("text=")[1] ?? "")).toBe(
      "Hi Arjun, a quick reminder: your check-in for Fri 16 Oct is still open. Send it when you can.",
    );
    expect(remind.getAttribute("title")).toBe(
      "Opens WhatsApp with a draft. You press Send.",
    );
    for (const link of reminders) {
      expect(link.closest(".client-checkins-row")?.getAttribute("data-state")).toBe("overdue");
    }
  });

  it("no number on file: no reminder link", async () => {
    renderPage("active", { phone: null });
    await screen.findByRole("button", { name: /^All 7$/ });
    expect(screen.queryByRole("link", { name: /Remind on WhatsApp/ })).toBeNull();
  });
});

describe("ClientCheckinsPage ended (162c)", () => {
  it("is read-only: notice, no Overdue chip, no upcoming or overdue rows, no actions", async () => {
    renderPage("ended", { endedAt: "2026-10-03T10:00:00.000Z" });
    expect(
      await screen.findByText(
        "Coaching with Kavya ended Sat 3 Oct. Her check-ins are read-only.",
      ),
    ).toBeTruthy();
    expect(await screen.findByRole("button", { name: /^All 6$/ })).toBeTruthy();
    expect(chip(/^To review 1$/)).toBeTruthy();
    expect(chip(/^Reviewed 3$/)).toBeTruthy();
    expect(chip(/^Missed 2$/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Overdue/ })).toBeNull();
    const states = [...document.querySelectorAll(".client-checkins-row")].map((row) =>
      row.getAttribute("data-state"),
    );
    expect(states).not.toContain("overdue");
    expect(states).not.toContain("upcoming");
    expect(screen.queryByRole("link", { name: /Remind on WhatsApp/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Schedule check-in/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Change schedule" })).toBeNull();
    expect(screen.queryByText("Cadence")).toBeNull();
  });
});

describe("ClientCheckinsPage empty (162b)", () => {
  it("shows zero chips, the empty message and the schedule action", async () => {
    api.listCheckins.mockResolvedValue({ items: [], nextCursor: null });
    renderPage("active");
    expect(await screen.findByText("No check-ins yet")).toBeTruthy();
    expect(chip(/^All 0$/)).toBeTruthy();
    expect(chip(/^Missed 0$/)).toBeTruthy();
    expect(screen.getByText("None scheduled")).toBeTruthy();
    expect(screen.getByText("0 of 0")).toBeTruthy();
    expect(
      screen.getByText(
        "Arjun's first weekly check-in shows here once it's scheduled. Submitted check-ins show up here, newest first.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Schedule check-in/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change schedule" })).toBeTruthy();
  });

  it("no active configuration: no Schedule check-in or Change schedule (API would refuse)", async () => {
    api.listCheckins.mockResolvedValue({ items: [], nextCursor: null });
    renderPage("active", { configStatus: "draft" });
    expect(await screen.findByText("No check-ins yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Schedule check-in/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Change schedule" })).toBeNull();
    expect(screen.queryByText("Cadence")).toBeNull();
    expect(
      screen.getByText(
        "Check-ins start once his coaching setup is active. Submitted check-ins show up here, newest first.",
      ),
    ).toBeTruthy();
  });

  it("scheduling without picking a form sends no form id (preferred, else global v2)", async () => {
    api.listCheckins.mockResolvedValue({ items: [], nextCursor: null });
    api.scheduleCheckin.mockResolvedValue({
      checkin: checkin({ localDate: "2026-10-25", status: "scheduled" }),
      created: true,
    });
    renderPage("active");
    fireEvent.click(await screen.findByRole("button", { name: /Schedule check-in/ }));
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(await screen.findByRole("option", { name: "Arjun's default form (Weekly check-in)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    await vi.waitFor(() => expect(api.scheduleCheckin).toHaveBeenCalled());
    const body = api.scheduleCheckin.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("checkinFormVersionId");
  });
});

describe("ClientCheckinsPage paging", () => {
  it("loads every page before counting (more than 30 check-ins)", async () => {
    // 35 weekly check-ins back from Sun 18 Oct: 1 to review, 34 reviewed.
    const all: Checkin[] = [];
    for (let i = 0; i < 35; i += 1) {
      const d = new Date(Date.UTC(2026, 9, 18) - i * 7 * 86_400_000);
      const localDate = d.toISOString().slice(0, 10);
      all.push(
        checkin({
          localDate,
          status: i === 0 ? "submitted" : "reviewed",
          submittedAt: new Date(d.getTime() + 15 * 3600_000).toISOString(),
          ...(i === 0 ? {} : { review: { outcome: "acknowledged" as const } }),
        }),
      );
    }
    api.listCheckins.mockImplementation(
      async (_rid: string, query?: { cursor?: string }) =>
        query?.cursor === "page-2"
          ? { items: all.slice(30), nextCursor: null }
          : { items: all.slice(0, 30), nextCursor: "page-2" },
    );
    renderPage("active");
    expect(await screen.findByRole("button", { name: /^All 35$/ })).toBeTruthy();
    expect(chip(/^To review 1$/)).toBeTruthy();
    expect(chip(/^Reviewed 34$/)).toBeTruthy();
    expect(document.querySelectorAll(".client-checkins-row")).toHaveLength(35);
    expect(api.listCheckins).toHaveBeenCalledTimes(2);
    expect(api.listCheckins.mock.calls[1]?.[1]).toMatchObject({ cursor: "page-2" });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});
