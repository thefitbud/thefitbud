/**
 * Z14-16 (D-W14-23 g): tapping a "client changed a meal log" push opens that
 * client's diet day on the meal day, with the sheet on the entry (none for a
 * removed entry). The push carries ids only; the day and entry come from the
 * stored notification row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientWorkspaceSchema } from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";

const RID = "55555555-5555-4555-8555-555555555555";
const NOTIF = "11111111-1111-4111-8111-111111111111";
const ENTRY = "99999999-9999-4999-8999-999999999999";

function workspace() {
  return clientWorkspaceSchema.parse({
    header: {
      relationshipId: RID,
      traineeDisplayName: "Aarav Mehta",
      onboardingStatus: "coaching_ready",
      effectivePlan: null,
      goalShort: null,
      renewalState: null,
      startedAt: "2026-07-06T04:00:00.000Z",
      adherenceState: "on_track",
      traineeProfile: { displayName: "Aarav Mehta", age: null, gender: null },
      traineeTimezone: "Asia/Kolkata",
      hasCustomMealTimes: false,
      trainerWhatsappE164: null,
      clientWhatsappE164: null,
      endedAt: null,
    },
    overview: {
      openException: null,
      nextCheckin: null,
      recentActivity: [],
      progress: { measurements: [], entries: [], media: [] },
    },
    plan: { plan: null, version: null },
    configuration: { configuration: null, subscription: null },
    history: { relationshipId: RID },
  });
}

const logEdit = {
  entryId: ENTRY,
  action: "edited",
  mealName: "Lunch",
  mealDate: "2026-11-14",
  fromKcal: 610,
  toKcal: 690,
  fromOutcome: "modified",
  toOutcome: "modified",
  fields: ["portion"],
};

const api = {
  getClientWorkspace: vi.fn(async () => workspace()),
  listNotifications: vi.fn(),
};
const clearPendingNotificationLink = vi.fn();
let link: unknown = null;
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () =>
    mockAuth({
      api,
      relationships: [],
      me: { timezone: "Asia/Kolkata" },
      pendingNotificationLink: link,
      clearPendingNotificationLink,
      refreshSession: vi.fn(async () => undefined),
    }),
}));
vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("../components/Screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./diet/DietDayReviewScreen", () => ({
  DietDayReviewScreen: (p: {
    relationshipId: string;
    initialDate?: string;
    initialEntryId?: string | null;
  }) => (
    <div
      data-testid="diet-day"
      data-rel={p.relationshipId}
      data-date={p.initialDate ?? ""}
      data-entry={p.initialEntryId ?? ""}
    />
  ),
}));
vi.mock("./AttentionTab", () => ({ AttentionTab: () => <div /> }));
vi.mock("./ClientsTab", () => ({ ClientsTab: () => <div /> }));
vi.mock("./CheckinsTab", () => ({ CheckinsTab: () => <div /> }));
vi.mock("./MoreScreen", () => ({ TrainerMoreScreen: () => <div /> }));
vi.mock("./TrainerNotificationSettingsScreen", () => ({
  TrainerNotificationSettingsScreen: () => <div />,
}));

const { TrainerShell } = await import("./TrainerShell");
const { deepLinkFromNotificationPayload } = await import("../notifications/routing");

function pushLink(entity: "coaching_relationship" | "checkin" = "coaching_relationship") {
  return deepLinkFromNotificationPayload({
    notificationId: NOTIF,
    notificationType: "trainer_client_log_edited",
    domainEntityType: entity,
    domainEntityId: RID,
    createdAt: "2026-11-14T08:36:00.000Z",
  });
}

describe("TrainerShell opens a client's changed meal log (Z14-16)", () => {
  beforeEach(() => {
    api.listNotifications.mockReset();
  });

  it("lands on the diet day for the meal day, with the entry selected", async () => {
    api.listNotifications.mockResolvedValue({ items: [{ id: NOTIF, logEdit }] });
    link = pushLink();
    render(<TrainerShell />);
    const day = await screen.findByTestId("diet-day");
    expect(day.getAttribute("data-rel")).toBe(RID);
    expect(day.getAttribute("data-date")).toBe("2026-11-14");
    expect(day.getAttribute("data-entry")).toBe(ENTRY);
  });

  it("opens the day with nothing selected for a removed entry", async () => {
    api.listNotifications.mockResolvedValue({
      items: [{ id: NOTIF, logEdit: { ...logEdit, action: "removed", toKcal: null, toOutcome: null, fields: [] } }],
    });
    link = pushLink();
    render(<TrainerShell />);
    const day = await screen.findByTestId("diet-day");
    expect(day.getAttribute("data-date")).toBe("2026-11-14");
    expect(day.getAttribute("data-entry")).toBe("");
  });

  it("still opens the client's diet when the row cannot be read", async () => {
    api.listNotifications.mockRejectedValue(new Error("offline"));
    link = pushLink();
    render(<TrainerShell />);
    const day = await screen.findByTestId("diet-day");
    expect(day.getAttribute("data-date")).toBe("");
  });

  it("a wrong entity type goes to the attention list, not a diet day", async () => {
    link = pushLink("checkin");
    render(<TrainerShell />);
    await waitFor(() => expect(clearPendingNotificationLink).toHaveBeenCalled());
    expect(screen.queryByTestId("diet-day")).toBeNull();
  });
});
