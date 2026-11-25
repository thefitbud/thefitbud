import { useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, mockAuth, render, screen, within } from "../test/render";
import { useRefreshWhenActive } from "./keptTab";

/**
 * Z14-3: a visited tab stays mounted. Each stub counts its mounts and
 * unmounts and records the `active` flag the shell hands it, so the test shows
 * that switching away and back remounts nothing (no skeleton, no refetch) and
 * that opening a detail screen leaves the tabs mounted underneath.
 */
const counts = vi.hoisted(() => ({
  mount: { attention: 0, clients: 0, checkins: 0, more: 0 },
  unmount: { attention: 0, clients: 0, checkins: 0, more: 0 },
  active: { attention: true, clients: true, checkins: true, more: true },
  reload: { attention: 0, clients: 0, checkins: 0, more: 0 },
}));

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () =>
    mockAuth({
      api: { listClients: vi.fn(), listRelationships: vi.fn() },
      relationships: [],
      pendingNotificationLink: null,
      pendingDeepLink: null,
      clearPendingNotificationLink: vi.fn(),
      clearPendingDeepLink: vi.fn(),
      refreshSession: vi.fn(async () => undefined),
    }),
}));
vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));

function stub(name: "attention" | "clients" | "checkins") {
  return function Stub(p: {
    active?: boolean;
    returnNonce?: number;
    onOpenClient?: (row: unknown) => void;
  }) {
    counts.active[name] = p.active ?? true;
    // The real hook, with data that was just loaded: only a forced refresh
    // (a detail screen closed) can reload it inside the 30 s window.
    const lastLoadedAt = useRef(Date.now());
    useRefreshWhenActive(
      p.active ?? true,
      lastLoadedAt,
      () => {
        counts.reload[name] += 1;
      },
      p.returnNonce,
    );
    useEffect(() => {
      counts.mount[name] += 1;
      return () => {
        counts.unmount[name] += 1;
      };
    }, []);
    return (
      <div data-testid={`${name}-tab`}>
        {p.onOpenClient ? (
          <button
            onClick={() =>
              p.onOpenClient?.({
                relationshipId: "22222222-2222-4222-8222-222222222222",
                name: "Kavya Nair",
                onboardingStatus: "active",
              })
            }
          >
            open-client-row
          </button>
        ) : null}
      </div>
    );
  };
}
vi.mock("./AttentionTab", () => ({ AttentionTab: stub("attention") }));
vi.mock("./ClientsTab", () => ({ ClientsTab: stub("clients") }));
vi.mock("./CheckinsTab", () => ({ CheckinsTab: stub("checkins") }));
vi.mock("./MoreScreen", () => ({
  TrainerMoreScreen: (p: { active?: boolean }) => {
    counts.active.more = p.active ?? true;
    useEffect(() => {
      counts.mount.more += 1;
      return () => {
        counts.unmount.more += 1;
      };
    }, []);
    return <div data-testid="more-tab" />;
  },
}));
vi.mock("./TrainerNotificationSettingsScreen", () => ({
  TrainerNotificationSettingsScreen: () => <div />,
}));
vi.mock("./TrainerProfileScreen", () => ({ TrainerProfileScreen: () => <div /> }));
vi.mock("./CheckinReviewScreen", () => ({ CheckinReviewScreen: () => <div /> }));
vi.mock("./ExceptionReviewScreen", () => ({ ExceptionReviewScreen: () => <div /> }));
vi.mock("./ask/AskDetailScreen", () => ({ AskDetailScreen: () => <div /> }));
vi.mock("./session/SessionDetailScreen", () => ({ SessionDetailScreen: () => <div /> }));
vi.mock("./ClientStatusScreen", () => ({
  ClientStatusScreen: (p: { onBack: () => void }) => (
    <div data-testid="client-screen">
      <button onClick={p.onBack}>back</button>
    </div>
  ),
}));

import { TrainerShell } from "./TrainerShell";

const tab = (label: string) => fireEvent.click(screen.getByLabelText(label));

beforeEach(() => {
  for (const key of ["attention", "clients", "checkins", "more"] as const) {
    counts.mount[key] = 0;
    counts.unmount[key] = 0;
    if (key !== "more") counts.reload[key] = 0;
  }
});

describe("TrainerShell keeps visited tabs mounted", () => {
  it("switching away and back mounts nothing again", () => {
    render(<TrainerShell />);
    expect(counts.mount).toEqual({ attention: 1, clients: 0, checkins: 0, more: 0 });

    tab("Clients");
    expect(counts.mount).toEqual({ attention: 1, clients: 1, checkins: 0, more: 0 });
    expect(counts.active).toMatchObject({ attention: false, clients: true });

    tab("Attention");
    tab("Clients");
    tab("Check-ins");
    tab("Attention");
    expect(counts.mount).toEqual({ attention: 1, clients: 1, checkins: 1, more: 0 });
    expect(counts.unmount).toEqual({ attention: 0, clients: 0, checkins: 0, more: 0 });
    expect(counts.active).toMatchObject({ attention: true, clients: false, checkins: false });
  });

  it("More joins the visited set: leaving and returning does not remount it", () => {
    render(<TrainerShell />);
    expect(screen.queryByTestId("more-tab")).toBeNull();
    tab("More");
    expect(counts.mount.more).toBe(1);
    expect(counts.active.more).toBe(true);
    tab("Clients");
    expect(screen.getByTestId("more-tab")).toBeTruthy();
    expect(counts.active.more).toBe(false);
    tab("More");
    expect(counts.mount.more).toBe(1);
    expect(counts.unmount.more).toBe(0);
    expect(counts.active.more).toBe(true);
  });

  it("a tab that was never opened is not mounted", () => {
    render(<TrainerShell />);
    expect(screen.queryByTestId("checkins-tab")).toBeNull();
    expect(screen.queryByTestId("clients-tab")).toBeNull();
  });

  it("an open detail screen keeps the tabs mounted, inactive, and Back wakes them", () => {
    render(<TrainerShell />);
    tab("Clients");
    fireEvent.click(
      within(screen.getByTestId("clients-tab")).getByText("open-client-row"),
    );
    expect(screen.getByTestId("client-screen")).toBeTruthy();
    expect(counts.unmount).toEqual({ attention: 0, clients: 0, checkins: 0, more: 0 });
    expect(counts.active).toMatchObject({ attention: false, clients: false });

    fireEvent.click(screen.getByText("back"));
    expect(counts.mount).toEqual({ attention: 1, clients: 1, checkins: 0, more: 0 });
    expect(counts.active.clients).toBe(true);
  });

  it("Back from a detail screen refreshes the tab underneath inside the 30 s window", () => {
    render(<TrainerShell />);
    tab("Clients");
    fireEvent.click(
      within(screen.getByTestId("clients-tab")).getByText("open-client-row"),
    );
    expect(counts.reload.clients).toBe(0);

    fireEvent.click(screen.getByText("back"));
    expect(counts.reload.clients).toBe(1);
    // Nothing else was woken, and a plain tab switch inside 30 s reloads nothing.
    expect(counts.reload.checkins).toBe(0);
    tab("Attention");
    tab("Clients");
    expect(counts.reload.clients).toBe(1);
  });

  it("a tab that was hidden when Back happened refreshes when it is next shown", () => {
    render(<TrainerShell />);
    tab("Clients");
    fireEvent.click(
      within(screen.getByTestId("clients-tab")).getByText("open-client-row"),
    );
    fireEvent.click(screen.getByText("back"));
    expect(counts.reload.attention).toBe(0);
    tab("Attention");
    expect(counts.reload.attention).toBe(1);
  });
});
