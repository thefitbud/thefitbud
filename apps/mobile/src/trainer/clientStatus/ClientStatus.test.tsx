/**
 * Client status (Z12-53 TM-03*, frames TM-03a–i): kcal from the week read
 * model, Reminders card, ended overview with Reactivate. DOM-shaped harness:
 * proves copy and behaviour, not layout; the visual check is the authority there.
 */
import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { clientWorkspaceSchema, responsivenessResponseSchema } from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen, waitFor } from "../../test/render";
import { buildEndedSummary, kcalTileValue, reminderLine, weekDayCells } from "./model";

const RID = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const UID = "a0a69e20-297d-4101-a5e2-ecce9b8491cb";
const PV = "6d0f2a64-3c1b-4f6e-9a10-7b6f4e0c1d11";

function workspace(over: { ended: boolean; traineeTz?: string; endedAt?: string; wa?: string }) {
  return clientWorkspaceSchema.parse({
    header: {
      relationshipId: RID,
      traineeDisplayName: "Kavya Nair",
      onboardingStatus: over.ended ? "ended" : "coaching_ready",
      effectivePlan: null,
      goalShort: "Lose 4 kg",
      renewalState: null,
      startedAt: "2026-07-06T04:00:00.000Z",
      adherenceState: "on_track",
      traineeProfile: { displayName: "Kavya Nair", age: null, gender: null },
      traineeTimezone: over.traineeTz ?? "Asia/Kolkata",
      hasCustomMealTimes: false,
      trainerWhatsappE164: null,
      clientWhatsappE164: over.wa ?? null,
      endedAt: over.ended ? (over.endedAt ?? "2026-10-03T10:00:00.000Z") : null,
    },
    overview: {
      openException: null,
      nextCheckin: null,
      recentActivity: [
        {
          type: "workout",
          id: UID,
          occurredAt: "2026-11-10T04:00:00.000Z",
          localDate: "2026-11-10",
          title: "Lower body A",
          state: "completed",
          planVersionId: PV,
        },
      ],
      progress: { measurements: [], entries: [], media: [] },
    },
    plan: { plan: null, version: null },
    configuration: { configuration: null, subscription: null },
    history: { relationshipId: RID },
  });
}

const responsiveness = responsivenessResponseSchema.parse({
  label: "responds",
  counts: { sent: 7, opened: 6, loggedAfter: 5, loggedBefore: 1 },
});

const api = {
  getClientWorkspace: vi.fn(),
  listExceptions: vi.fn(),
  listWorkoutAssignments: vi.fn(async () => ({ items: [], nextCursor: null })),
  listMealAssignments: vi.fn(async () => ({ items: [], nextCursor: null })),
  listTrainerNotes: vi.fn<
    (
      rid: string,
      query?: { limit?: number; cursor?: string },
    ) => Promise<{ items: ReturnType<typeof note>[]; nextCursor: string | null }>
  >(async () => ({ items: [], nextCursor: null })),
  getWorkspaceWeek: vi.fn(async () => ({
    start: "2026-11-09",
    workouts: { assigned: 4, completed: 2 },
    meals: { assigned: 25, logged: 18 },
    days: [],
    todayNutrition: {
      date: "2026-11-11",
      logged: { kcal: 410, proteinG: 20, carbsG: 40, fatG: 10 },
      assigned: { kcal: 1950, proteinG: 120, carbsG: 200, fatG: 60 },
    },
  })),
  getResponsiveness: vi.fn(async () => responsiveness),
  getProgressMetrics: vi.fn(async () => ({
    series: [
      {
        key: "weight",
        unit: "kg",
        points: [
          { localDate: "2026-07-06", value: 68.2, checkinId: null },
          { localDate: "2026-10-02", value: 65.1, checkinId: null },
        ],
      },
    ],
  })),
  getWorkoutAdherence: vi.fn(async () => ({
    items: [
      { assignmentId: UID, localDate: "2026-09-28", workoutDayName: "A", status: "completed", planVersionId: PV, startedAt: null, completedAt: null, sessionRpe: null },
      { assignmentId: UID, localDate: "2026-09-30", workoutDayName: "B", status: "missed", planVersionId: PV, startedAt: null, completedAt: null, sessionRpe: null },
    ],
  })),
  getMealCompliance: vi.fn(async () => ({ items: [], totals: {} })),
  listCheckins: vi.fn(async () => ({ items: [], nextCursor: null })),
  getOnboardingResponse: vi.fn(async () => {
    throw new ApiClientError({ status: 404, code: "NOT_FOUND", message: "Not found.", requestId: "r" });
  }),
  createTrainerNote: vi.fn(async () => ({})),
  requestReactivation: vi.fn(async () => ({
    requestId: "b2c3d4e5-f6a7-4890-b123-456789abcdef",
    status: "pending" as const,
  })),
};
const auth = mockAuth({ api, me: { timezone: "Asia/Kolkata" } });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));

// The real Screen's RefreshControl is a native gesture; expose its handler as a button.
vi.mock("../../components/Screen", () => ({
  Screen: ({ children, onRefresh }: { children: React.ReactNode; onRefresh?: () => void }) => (
    <div>
      <button type="button" onClick={onRefresh}>
        Pull to refresh
      </button>
      {children}
    </div>
  ),
}));

const { ClientStatusScreen } = await import("../ClientStatusScreen");
const { clearTrainerCache, readTrainerCache, setTrainerCacheOwner } = await import("../cache");

const TRAINER_A = "6f1c2a9e-3b4d-4c5e-8f70-1a2b3c4d5e6f";
const TRAINER_B = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b";

function renderScreen() {
  render(
    <ClientStatusScreen
      relationshipId={RID}
      displayName="Kavya Nair"
      onBack={() => {}}
      onOpenException={() => {}}
      onOpenCheckin={() => {}}
    />,
  );
}

describe("model", () => {
  it("reads kcal as logged of assigned from the week model", () => {
    expect(
      kcalTileValue({ logged: { kcal: 410 }, assigned: { kcal: 1950 } }),
    ).toBe("410 of 1,950");
    expect(kcalTileValue(null)).toBe("–");
  });

  it("words the reminder line without percentages", () => {
    expect(reminderLine(responsiveness)).toBe(
      "Responds to reminders · Logged 5 of 7 after a reminder · 6 opened",
    );
  });

  it("marks a day done, missed or empty", () => {
    const cells = weekDayCells("Asia/Kolkata", ["2026-09-28", "2026-09-29", "2026-09-30"], [
      { localDate: "2026-09-28", status: "completed" },
      { localDate: "2026-09-30", status: "missed" },
    ]);
    expect(cells.map((c) => c.mark)).toEqual(["done", "none", "missed"]);
    expect(cells.map((c) => c.count)).toEqual(["1/1", "–", "0/1"]);
  });

  it("builds the ended summary on the trainee-local last week", async () => {
    const summary = buildEndedSummary({
      zone: "Asia/Kolkata",
      startedAt: "2026-07-06T04:00:00.000Z",
      endedAt: "2026-10-03T10:00:00.000Z",
      weights: (await api.getProgressMetrics()).series[0]!.points as never,
      workouts: (await api.getWorkoutAdherence()).items as never,
      meals: [],
      checkins: [],
    });
    expect(summary.weeksCoached).toBe(13);
    expect(summary.lastWeekStart).toBe("2026-09-28");
    expect(summary.workouts).toBe("1 of 2");
    expect(summary.weight?.headline).toBe("68.2 → 65.1 kg");
    expect(summary.weight?.sub).toBe("−3.1 kg from Mon 6 Jul to Fri 2 Oct");
    expect(summary.lastWeek.lastCheckin).toBe("None");
    // Sat 3 Oct is the end: Sunday has not happened and reads "—".
    expect(summary.lastWeek.cells.map((c) => c.letter).join("")).toBe("MTWTFSS");
    expect(summary.lastWeek.cells[6]).toMatchObject({ mark: "none", count: "—" });
    expect(summary.lastWeek.cells[0]).toMatchObject({ mark: "done", count: "1/1" });
    expect(summary.lastWeek.cells[2]).toMatchObject({ mark: "missed", count: "0/1" });
  });

  it("uses the client's calendar when the end is near local midnight", () => {
    // 19:00 UTC on Sat 3 Oct is 00:30 on Sun 4 Oct in Kolkata, still Sat 3 Oct in Los Angeles.
    const base = {
      startedAt: "2026-07-06T04:00:00.000Z",
      endedAt: "2026-10-03T19:00:00.000Z",
      weights: [],
      workouts: [],
      meals: [],
      checkins: [],
    };
    const kolkata = buildEndedSummary({ ...base, zone: "Asia/Kolkata" });
    const la = buildEndedSummary({ ...base, zone: "America/Los_Angeles" });
    expect(kolkata.endDate).toBe("2026-10-04");
    expect(kolkata.lastWeekStart).toBe("2026-09-28");
    expect(la.endDate).toBe("2026-10-03");
    expect(la.lastWeekStart).toBe("2026-09-28");
    expect(kolkata.lastWeek.cells[6]).toMatchObject({ count: "–" });
    expect(la.lastWeek.cells[6]).toMatchObject({ count: "—" });
  });
});

describe("ClientStatusScreen", () => {
  it("active client: kcal against the plan, Reminders card, Recent activity", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace({ ended: false }));
    renderScreen();
    await screen.findByText("410 of 1,950");
    expect(screen.getByText("Reminders")).toBeTruthy();
    expect(screen.getByText(/Responds to reminders/)).toBeTruthy();
    expect(screen.getByText("Recent activity")).toBeTruthy();
    expect(screen.getByText("Lower body A")).toBeTruthy();
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getByText("Today's food")).toBeTruthy();
    expect(screen.queryByText("Reactivate")).toBeNull();
  });

  it("Remind… offers only unlogged items: logged meals (deviation, logged later) are not offered", async () => {
    const item = (id: string, type: string, source: string) => ({
      id,
      coachingRelationshipId: RID,
      type,
      severity: "warning",
      status: "active",
      sourceEntityType: type === "missed_workout" ? "workout_assignment" : "meal_assignment",
      sourceEntityId: UID,
      summary: `${type} summary`,
      details: { localDate: "2026-11-17", mealName: source, workoutDayName: source },
      detectedAt: "2026-11-17T04:00:00.000Z",
    });
    api.getClientWorkspace.mockResolvedValue(workspace({ ended: false }));
    api.listExceptions.mockResolvedValue({
      items: [
        item("e1", "meal_deviation", "Dinner"),
        item("e2", "meal_logged_later", "Lunch"),
      ],
      nextCursor: null,
    });
    renderScreen();
    await screen.findByText("410 of 1,950");
    fireEvent.click(screen.getByText("Remind…"));
    await screen.findByText("Nothing open to nudge about");
    expect(screen.queryByText("Nudge Kavya")).toBeNull();

    api.listExceptions.mockResolvedValue({
      items: [item("e1", "meal_deviation", "Dinner"), item("e3", "missed_workout", "Lower body A")],
      nextCursor: null,
    });
    fireEvent.click(screen.getByText("Remind…"));
    await screen.findByText("Nudge Kavya");
    // Body is filled in a useEffect one tick after the heading (NudgeSheet).
    expect(
      await screen.findByText("Lower body A is waiting. Can you fit it in soon?"),
    ).toBeTruthy();
  });

  it("ended client: read-only banner, Reactivate, no live week/responsiveness", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace({ ended: true }));
    api.getWorkspaceWeek.mockClear();
    api.getResponsiveness.mockClear();
    renderScreen();
    await screen.findByText(/Coaching ended on Sat 3 Oct/);
    expect(screen.getByText(/History is read only/)).toBeTruthy();
    expect(screen.getByText("Reactivate")).toBeTruthy();
    expect(screen.getByText("No plan since Sat 3 Oct")).toBeTruthy();
    expect(screen.getByText("No check-ins after coaching ended")).toBeTruthy();
    expect(screen.getByText(/kcal · no plan/)).toBeTruthy();
    // Actions stay visible but disabled (TM-03d).
    expect(screen.getByText("WhatsApp")).toBeTruthy();
    expect(screen.getByText("Remind…")).toBeTruthy();
    expect(screen.queryByText("Reminders")).toBeNull();
    expect(api.getWorkspaceWeek).not.toHaveBeenCalled();
    expect(api.getResponsiveness).not.toHaveBeenCalled();
  });

  it("ended client: dates follow the client's zone, not the trainer's", async () => {
    // Trainer is in Kolkata; the client is in Los Angeles. 19:00 UTC Sat 3 Oct is
    // 00:30 Sun 4 Oct for the trainer but still Sat 3 Oct for the client.
    api.getClientWorkspace.mockResolvedValue(
      workspace({ ended: true, traineeTz: "America/Los_Angeles", endedAt: "2026-10-03T19:00:00.000Z" }),
    );
    renderScreen();
    await screen.findByText(/Coaching ended on Sat 3 Oct/);
    expect(screen.getByText("No plan since Sat 3 Oct")).toBeTruthy();
  });

  it("ended client: Reactivate sheet sends the rejoin invite", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace({ ended: true }));
    api.requestReactivation.mockClear();
    renderScreen();
    await screen.findByText("Reactivate");
    fireEvent.click(screen.getByText("Reactivate"));
    await screen.findByText("Reactivate Kavya?");
    expect(screen.getByText(/gets a WhatsApp invite to rejoin/)).toBeTruthy();
    fireEvent.click(screen.getByText("Send invite to rejoin"));
    await waitFor(() => expect(api.requestReactivation).toHaveBeenCalled());
    expect(api.requestReactivation).toHaveBeenCalledWith(
      RID,
      {},
      expect.any(String),
    );
    await screen.findByText("Rejoin invite sent");
  });

  it("a load started for trainer A that resolves after B signs in writes nothing under B (Z12-33)", async () => {
    clearTrainerCache();
    setTrainerCacheOwner(null);
    setTrainerCacheOwner(TRAINER_A);
    let resolveWorkspace: (value: ReturnType<typeof workspace>) => void = () => undefined;
    api.getClientWorkspace.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveWorkspace = resolve;
      }),
    );
    renderScreen();
    await waitFor(() => expect(api.getClientWorkspace).toHaveBeenCalled());

    // A signs out and B signs in while A's fetch is still in flight, in the
    // order AuthProvider runs them (sign-out clear, then B's `/me`).
    clearTrainerCache();
    setTrainerCacheOwner(null);
    setTrainerCacheOwner(TRAINER_B);

    resolveWorkspace(workspace({ ended: false }));
    // The activity on screen proves the load reached its cache write.
    await screen.findByText("Lower body A");
    expect(readTrainerCache(`trainer:client:${RID}`)).toBeNull();
    for (let index = 0; index < localStorage.length; index += 1) {
      expect(localStorage.key(index)?.startsWith("trainer:")).toBe(false);
    }
    clearTrainerCache();
    setTrainerCacheOwner(null);
  });

  it("Z14-3: paints the kept snapshot, and a server error keeps it with the retry banner", async () => {
    clearTrainerCache();
    setTrainerCacheOwner(null);
    setTrainerCacheOwner(TRAINER_A);
    // First visit: a good load leaves the snapshot behind.
    api.getClientWorkspace.mockResolvedValueOnce(workspace({ ended: false }));
    const first = render(
      <ClientStatusScreen
        relationshipId={RID}
        displayName="Kavya Nair"
        onBack={() => {}}
        onOpenException={() => {}}
        onOpenCheckin={() => {}}
      />,
    );
    await screen.findByText("Lower body A");
    first.unmount();
    expect(readTrainerCache(`trainer:client:${RID}`)).not.toBeNull();

    // Second visit: the snapshot is on screen before the read answers, then the
    // read fails on the server. The page keeps the snapshot and says so.
    let fail: (reason: unknown) => void = () => undefined;
    api.getClientWorkspace.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    renderScreen();
    expect(screen.getByText("Lower body A")).toBeTruthy();
    expect(screen.getByText("410 of 1,950")).toBeTruthy();
    expect(screen.queryByText("Couldn't load. Pull to try again.")).toBeNull();

    fail(new ApiClientError({ status: 500, code: "INTERNAL_ERROR", message: "Something went wrong.", requestId: "req-1" }));
    expect(await screen.findByText("Couldn't load. Pull to try again.")).toBeTruthy();
    expect(screen.getByText("Lower body A")).toBeTruthy();
    expect(screen.queryByText(/Couldn’t load Kavya’s page/)).toBeNull();
    clearTrainerCache();
    setTrainerCacheOwner(null);
  });
});

const note = (n: number, visibility: "private" | "client") => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  coachingRelationshipId: RID,
  trainerUserId: UID,
  checkinId: null,
  body: `Coach note ${n}`,
  visibility,
  subjectType: null,
  subjectId: null,
  sharedAt: null,
  seenAt: null,
  createdAt: `2026-11-${String(14 - n).padStart(2, "0")}T04:00:00.000Z`,
  updatedAt: "2026-11-14T04:00:00.000Z",
});

describe("ClientStatusScreen profile (Z14-24)", () => {
  it("loading: the header and action row paint at once; the cards show their titles with skeletons, no zeros", async () => {
    clearTrainerCache();
    setTrainerCacheOwner(null);
    setTrainerCacheOwner(TRAINER_A);
    api.getClientWorkspace.mockReturnValueOnce(new Promise(() => undefined));
    renderScreen();
    expect(screen.getByText("Kavya Nair")).toBeTruthy();
    expect(screen.getByText("WhatsApp")).toBeTruthy();
    expect(screen.getByText("Remind…")).toBeTruthy();
    expect(screen.getByText("Add note")).toBeTruthy();
    for (const title of ["Needs attention", "This week", "Today's food", "Next check-in"]) {
      expect(screen.getByLabelText(`${title}, loading`)).toBeTruthy();
    }
    expect(screen.queryByText(/0 of 0/)).toBeNull();
    expect(screen.queryByText("No WhatsApp number on file")).toBeNull();
    expect(screen.queryByText("Nothing logged yet.")).toBeNull();
    expect(screen.queryByText("–")).toBeNull();
    clearTrainerCache();
    setTrainerCacheOwner(null);
  });

  it("Remind… and WhatsApp are disabled while pending and enabled once the first answer brings a number", async () => {
    clearTrainerCache();
    setTrainerCacheOwner(null);
    setTrainerCacheOwner(TRAINER_A);
    let release: (w: ReturnType<typeof workspace>) => void = () => undefined;
    api.getClientWorkspace.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve; }),
    );
    renderScreen();
    const disabledOf = (label: string) =>
      screen.getByText(label).closest("[aria-disabled]")?.getAttribute("aria-disabled");
    expect(disabledOf("Remind…")).toBe("true");
    expect(disabledOf("WhatsApp")).toBe("true");
    release(workspace({ ended: false, wa: "+919876543210" }));
    await screen.findByText("410 of 1,950");
    await waitFor(() => expect(disabledOf("Remind…")).not.toBe("true"));
    expect(disabledOf("WhatsApp")).not.toBe("true");
    clearTrainerCache();
    setTrainerCacheOwner(null);
  });

  it("Add note is in the action row only; the menu has three rows and Cancel", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace({ ended: false }));
    renderScreen();
    await screen.findByText("410 of 1,950");
    expect(screen.getAllByText("Add note")).toHaveLength(1);
    expect(screen.queryByText("Edit plan")).toBeNull();
    fireEvent.click(screen.getByLabelText("More"));
    expect(await screen.findByText("Goal, intake and limitations")).toBeTruthy();
    expect(screen.getByText("Log in person for Kavya")).toBeTruthy();
    expect(screen.getByText("Copy FitBud web link")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getAllByText("Add note")).toHaveLength(1);
  });

  it("Copy FitBud web link copies once and shows the existing toast", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    api.getClientWorkspace.mockResolvedValue(workspace({ ended: false }));
    renderScreen();
    await screen.findByText("410 of 1,950");
    fireEvent.click(screen.getByLabelText("More"));
    fireEvent.click(await screen.findByText("Copy FitBud web link"));
    expect(await screen.findByText("Link copied")).toBeTruthy();
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("Coach notes: the latest 3 with marks, and See all notes only when there are more", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace({ ended: false }));
    api.listTrainerNotes.mockResolvedValueOnce({
      items: [note(1, "client"), note(2, "private"), note(3, "private"), note(4, "private")],
      nextCursor: null,
    });
    renderScreen();
    await screen.findByText("Coach note 1");
    expect(api.listTrainerNotes).toHaveBeenCalledWith(RID, { limit: 4 });
    expect(screen.getAllByTestId("note-row")).toHaveLength(3);
    expect(screen.queryByText("Coach note 4")).toBeNull();
    expect(screen.getByText(/Kavya sees it · /)).toBeTruthy();
    expect(screen.getAllByText(/Only you · /)).toHaveLength(2);
    expect(screen.getByText("See all notes")).toBeTruthy();
  });

  it("Coach notes: three or fewer show no See all notes", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace({ ended: false }));
    api.listTrainerNotes.mockResolvedValueOnce({
      items: [note(1, "private")],
      nextCursor: null,
    });
    renderScreen();
    await screen.findByText("Coach note 1");
    expect(screen.queryByText("See all notes")).toBeNull();
  });

  it("Add note opens the one note sheet; Only me saves as private through the contract", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace({ ended: false }));
    renderScreen();
    await screen.findByText("410 of 1,950");
    fireEvent.click(screen.getByText("Add note"));
    await screen.findByRole("heading", { name: "Note for Kavya" });
    expect(screen.getByText("Only you can see this note.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Check the knee" } });
    fireEvent.click(screen.getByLabelText("Save"));
    await waitFor(() =>
      expect(api.createTrainerNote).toHaveBeenCalledWith(
        RID,
        { body: "Check the knee", visibility: "private" },
        expect.any(String),
      ),
    );
    expect(await screen.findByText("Note saved")).toBeTruthy();
  });

  it("ended client: Add note is off and no note sheet opens", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace({ ended: true }));
    renderScreen();
    await screen.findByText("Reactivate");
    expect(screen.getByText("Add note").closest("[aria-disabled]")?.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByText("Add note"));
    expect(screen.queryByRole("heading", { name: "Note for Kavya" })).toBeNull();
  });

  it("See all notes opens the notes list for this client", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace({ ended: false }));
    api.listTrainerNotes.mockResolvedValueOnce({
      items: [note(1, "client"), note(2, "private"), note(3, "private"), note(4, "private")],
      nextCursor: null,
    });
    renderScreen();
    fireEvent.click(await screen.findByText("See all notes"));
    await waitFor(() =>
      expect(api.listTrainerNotes).toHaveBeenCalledWith(RID, { limit: 30 }),
    );
    expect(await screen.findByRole("heading", { name: "Notes" })).toBeTruthy();
  });
});
