import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, mockAuth, render, screen, waitFor } from "../test/render";

const REL = "22222222-2222-4222-8222-222222222222";
const CHECKIN = "44444444-4444-4444-8444-444444444444";
const EXC = "11111111-1111-4111-8111-111111111111";

const api = {
  listClients: vi.fn(),
  listRelationships: vi.fn(),
};
const state: {
  pendingNotificationLink: unknown;
  pendingDeepLink: unknown;
} = { pendingNotificationLink: null, pendingDeepLink: null };
const clearPendingNotificationLink = vi.fn(() => {
  state.pendingNotificationLink = null;
});
const clearPendingDeepLink = vi.fn(() => {
  state.pendingDeepLink = null;
});
const refreshSession = vi.fn(async () => undefined);

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () =>
    mockAuth({
      api,
      relationships: [],
      pendingNotificationLink: state.pendingNotificationLink,
      pendingDeepLink: state.pendingDeepLink,
      clearPendingNotificationLink,
      clearPendingDeepLink,
      refreshSession,
    }),
}));
vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));

// Stubs: a testid per screen plus buttons that fire the callbacks the shell wires.
vi.mock("./AttentionTab", () => ({
  AttentionTab: (p: { onReviewException: (id: string) => void }) => (
    <div data-testid="attention-tab">
      <button onClick={() => p.onReviewException("11111111-1111-4111-8111-111111111111")}>
        open-exception
      </button>
    </div>
  ),
}));
vi.mock("./ClientsTab", () => ({
  ClientsTab: (p: { onOpenClient: (row: unknown) => void }) => (
    <div data-testid="clients-tab">
      <button
        onClick={() =>
          p.onOpenClient({
            relationshipId: "22222222-2222-4222-8222-222222222222",
            name: "Kavya Nair",
            onboardingStatus: "active",
          })
        }
      >
        open-client-row
      </button>
    </div>
  ),
}));
vi.mock("./CheckinsTab", () => ({
  CheckinsTab: (p: { onReviewCheckin: (item: unknown) => void }) => (
    <div data-testid="checkins-tab">
      <button
        onClick={() =>
          p.onReviewCheckin({
            checkin: { id: "44444444-4444-4444-8444-444444444444" },
            coachingRelationshipId: "22222222-2222-4222-8222-222222222222",
          })
        }
      >
        open-checkin-row
      </button>
    </div>
  ),
}));
vi.mock("./MoreScreen", () => ({ TrainerMoreScreen: () => <div data-testid="more-tab" /> }));
vi.mock("./TrainerNotificationSettingsScreen", () => ({
  TrainerNotificationSettingsScreen: () => <div />,
}));
vi.mock("./TrainerProfileScreen", () => ({ TrainerProfileScreen: () => <div /> }));
vi.mock("./ClientStatusScreen", () => ({
  ClientStatusScreen: (p: {
    relationshipId: string;
    displayName: string;
    onBack: () => void;
    onOpenCheckin: (id: string) => void;
  }) => (
    <div data-testid="client-screen" data-rel={p.relationshipId} data-name={p.displayName}>
      <button onClick={() => p.onOpenCheckin("44444444-4444-4444-8444-444444444444")}>
        open-checkin
      </button>
      <button onClick={p.onBack}>back</button>
    </div>
  ),
}));
vi.mock("./CheckinReviewScreen", () => ({
  CheckinReviewScreen: (p: { checkinId: string; onBack: (rel?: string) => void }) => (
    <div data-testid="checkin-screen" data-id={p.checkinId}>
      <button onClick={() => p.onBack("22222222-2222-4222-8222-222222222222")}>back</button>
    </div>
  ),
}));
vi.mock("./ExceptionReviewScreen", () => ({
  ExceptionReviewScreen: (p: {
    onBack: () => void;
    onOpenClient: (rel: string) => void;
  }) => (
    <div data-testid="exception-screen">
      <button onClick={() => p.onOpenClient("22222222-2222-4222-8222-222222222222")}>
        open-client
      </button>
      <button onClick={p.onBack}>back</button>
    </div>
  ),
}));

import { TrainerShell } from "./TrainerShell";

const click = (name: string) => fireEvent.click(screen.getByText(name));
const tab = (label: string) => fireEvent.click(screen.getByLabelText(label));

beforeEach(() => {
  state.pendingNotificationLink = null;
  state.pendingDeepLink = null;
  api.listClients.mockReset();
  api.listClients.mockResolvedValue({
    items: [
      { relationshipId: REL, traineeDisplayName: "Kavya Nair", status: "active" },
    ],
  });
  clearPendingNotificationLink.mockClear();
  clearPendingDeepLink.mockClear();
});

describe("TrainerShell back navigation", () => {
  it("client page -> check-in review -> Back shows the client page", () => {
    render(<TrainerShell />);
    tab("Clients");
    click("open-client-row");
    expect(screen.getByTestId("client-screen").getAttribute("data-rel")).toBe(REL);
    click("open-checkin");
    expect(screen.getByTestId("checkin-screen").getAttribute("data-id")).toBe(CHECKIN);
    click("back");
    expect(screen.getByTestId("client-screen").getAttribute("data-rel")).toBe(REL);
    click("back");
    expect(screen.getByTestId("clients-tab")).toBeTruthy();
  });

  it("Check-ins queue -> review -> Back shows the Check-ins tab", () => {
    render(<TrainerShell />);
    tab("Check-ins");
    click("open-checkin-row");
    expect(screen.getByTestId("checkin-screen")).toBeTruthy();
    click("back");
    expect(screen.getByTestId("checkins-tab")).toBeTruthy();
    expect(screen.queryByTestId("client-screen")).toBeNull();
  });

  it("cold push to a check-in -> Back opens that client's page", async () => {
    state.pendingNotificationLink = {
      trainerRoute: { kind: "checkin", checkinId: CHECKIN },
    };
    render(<TrainerShell />);
    expect(screen.getByTestId("checkin-screen").getAttribute("data-id")).toBe(CHECKIN);
    expect(clearPendingNotificationLink).toHaveBeenCalled();
    api.listClients.mockClear();
    click("back");
    await waitFor(() =>
      expect(screen.getByTestId("client-screen").getAttribute("data-rel")).toBe(REL),
    );
    expect(api.listClients).toHaveBeenCalled();
    expect(screen.getByTestId("client-screen").getAttribute("data-name")).toBe("Kavya Nair");
  });

  it("Attention -> exception -> client -> Back shows the exception, Back again Attention", async () => {
    render(<TrainerShell />);
    click("open-exception");
    click("open-client");
    await waitFor(() => expect(screen.getByTestId("client-screen")).toBeTruthy());
    click("back");
    expect(screen.getByTestId("exception-screen")).toBeTruthy();
    click("back");
    expect(screen.getByTestId("attention-tab")).toBeTruthy();
  });

  it("a deep link while [client, check-in] is open replaces the stack; Back leaves to the tab", () => {
    const { rerender } = render(<TrainerShell />);
    tab("Clients");
    click("open-client-row");
    click("open-checkin");
    expect(screen.getByTestId("checkin-screen")).toBeTruthy();
    state.pendingDeepLink = { kind: "exception", id: EXC };
    act(() => {
      rerender(<TrainerShell />);
    });
    expect(screen.getByTestId("exception-screen")).toBeTruthy();
    click("back");
    expect(screen.queryByTestId("client-screen")).toBeNull();
    expect(screen.queryByTestId("checkin-screen")).toBeNull();
    expect(screen.getByTestId("attention-tab")).toBeTruthy();
  });
});
