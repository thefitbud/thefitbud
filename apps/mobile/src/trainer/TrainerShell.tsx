import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "../components/Text";
import type { CoachAsk, TrainerCheckinInboxItem } from "@fitbud/contracts";
import { formatPersonName } from "@fitbud/core";
import { spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { AttentionTab } from "./AttentionTab";
import { TrainerMoreScreen } from "./MoreScreen";
import { TrainerNotificationSettingsScreen } from "./TrainerNotificationSettingsScreen";
import { TrainerProfileScreen } from "./TrainerProfileScreen";
import { CheckinReviewScreen } from "./CheckinReviewScreen";
import { CheckinsTab } from "./CheckinsTab";
import { onboardingStatusLabel,
  type ClientDirectoryRow,
} from "./clients";
import { ClientsTab } from "./ClientsTab";
import { ClientStatusScreen } from "./ClientStatusScreen";
import { ExceptionReviewScreen } from "./ExceptionReviewScreen";
import { AskDetailScreen } from "./ask/AskDetailScreen";
import { SessionDetailScreen } from "./session/SessionDetailScreen";
import { isCaptureModeEnabled,
  registerTrainerCaptureNav,
} from "../dev/captureBridge";
import { stage1Api } from "../lib/stage1Api";
import { roleForLinkKind } from "../navigation/resolveRoute";
import { backOverlays, pushOverlay, startOverlays } from "./overlayStack";
import { ThemeScope, createThemedStyles } from "../providers/ThemeProvider";

type TrainerTab = "attention" | "clients" | "checkins" | "more";

type Overlay =
  | { kind: "exception"; exceptionId: string }
  | {
      kind: "client";
      relationshipId: string;
      displayName: string;
      onboardingStatusLabelText: string;
    }
  | {
      kind: "checkin";
      checkinId: string;
      relationshipId: string;
      // Opened from a push with no screen below it: Back goes to the client page.
      cold?: boolean;
    }
  | {
      kind: "ask";
      askId: string;
      relationshipId: string;
      displayName: string;
      initialAsk?: CoachAsk | null;
    }
  | {
      kind: "session";
      executionId: string;
      relationshipId: string;
      displayName: string;
    }
  | { kind: "notifications" }
  | { kind: "profile" };

const TABS: Array<{ id: TrainerTab; label: string }> = [
  { id: "attention", label: "Attention" },
  { id: "clients", label: "Clients" },
  { id: "checkins", label: "Check-ins" },
  { id: "more", label: "More" },
];

export function TrainerShell() {
  return (
    <ThemeScope scheme="system">
      <TrainerShellBody />
    </ThemeScope>
  );
}

function TrainerShellBody() {
  const styles = useStyles();
  const {
    relationships,
    api,
    signOut,
    pendingNotificationLink,
    clearPendingNotificationLink,
    pendingDeepLink,
    clearPendingDeepLink,
    refreshSession,
  } = useAuth();
  const s1 = stage1Api(api);
  const [tab, setTab] = useState<TrainerTab>("attention");
  // Z14-3: a tab stays mounted once visited, so switching back shows its last
  // data at once instead of a skeleton and a refetch.
  const [visited, setVisited] = useState<ReadonlySet<TrainerTab>>(
    () => new Set<TrainerTab>(["attention"]),
  );
  if (!visited.has(tab)) setVisited(new Set([...visited, tab]));
  // Back stack of detail screens over the current tab (see overlayStack.ts).
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const overlay: Overlay | null = overlays[overlays.length - 1] ?? null;
  const open = (next: Overlay) => setOverlays((stack) => pushOverlay(stack, next));
  const startAt = (next: Overlay) => setOverlays(startOverlays(next));
  const closeAll = () => setOverlays([]);
  const goBack = (resolvedRelationshipId?: string) => {
    const result = backOverlays(overlays, resolvedRelationshipId);
    if (result.kind === "client") {
      void openClientById(result.relationshipId, latestPushRef.current, "start");
      return;
    }
    setOverlays(result.stack);
  };
  const [clientsSegment, setClientsSegment] = useState<"clients" | "activity">(
    "clients",
  );

  // Bumped per opened push so screens remount and refetch; the payload is
  // routing only and never rendered.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const latestPushRef = useRef(0);

  function openClientFromRow(row: ClientDirectoryRow) {
    if (!row.relationshipId) return;
    startAt({
      kind: "client",
      relationshipId: row.relationshipId,
      displayName: row.name,
      onboardingStatusLabelText: onboardingStatusLabel(row.onboardingStatus),
    });
  }

  async function openClientById(
    relationshipId: string,
    push?: number,
    mode: "push" | "start" = "push",
  ) {
    let displayName = "Client";
    let statusLabelText = "Unknown";
    try {
      const page = await api.listClients({ limit: 50 });
      const match = page.items.find(
        (item) => item.relationshipId === relationshipId,
      );
      if (match) {
        displayName = formatPersonName(match.traineeDisplayName);
        statusLabelText = onboardingStatusLabel(match.status);
      }
    } catch {
      const relationship = relationships.find((item) => item.id === relationshipId);
      if (relationship) {
        statusLabelText = onboardingStatusLabel(relationship.onboardingStatus);
      }
    }
    // A newer push opened something else while the client list loaded.
    if (push !== undefined && push !== latestPushRef.current) return;
    const next: Overlay = {
      kind: "client",
      relationshipId,
      displayName,
      onboardingStatusLabelText: statusLabelText,
    };
    if (mode === "start") startAt(next);
    else open(next);
  }

  function openCheckin(item: TrainerCheckinInboxItem) {
    startAt({
      kind: "checkin",
      checkinId: item.checkin.id,
      relationshipId: item.coachingRelationshipId,
    });
  }

  useEffect(() => {
    if (!pendingNotificationLink) return;
    const route = pendingNotificationLink.trainerRoute;
    if (!route) return; // Not a trainer push; the trainee shell owns those.
    clearPendingNotificationLink(); // Navigate once per link.
    const push = ++latestPushRef.current;
    void refreshSession();
    setRefreshNonce((n) => n + 1);
    setClientsSegment("clients");
    switch (route.kind) {
      case "checkin":
        // The review screen reads the relationship from the fetched check-in.
        startAt({
          kind: "checkin",
          checkinId: route.checkinId,
          relationshipId: "",
          cold: true,
        });
        return;
      case "client":
        void openClientById(route.relationshipId, push, "start");
        return;
      case "attention":
        closeAll();
        setTab("attention");
        return;
    }
  }, [pendingNotificationLink]);

  // Z11-14: a coach link (exception, ask, client), opened here directly or
  // after frame 61's Switch. A trainee link is left for the trainee shell, as
  // before. The link carries an id only; each screen fetches its own data.
  useEffect(() => {
    if (!pendingDeepLink) return;
    if (roleForLinkKind(pendingDeepLink.kind) !== "trainer") return;
    const link = pendingDeepLink;
    clearPendingDeepLink(); // Navigate once per link.
    const push = ++latestPushRef.current;
    setRefreshNonce((n) => n + 1);
    setClientsSegment("clients");
    switch (link.kind) {
      case "exception":
        // Back from a warm exception link shows Attention ("Back to Attention").
        setTab("attention");
        startAt({ kind: "exception", exceptionId: link.id });
        return;
      case "client":
        void openClientById(link.id, push, "start");
        return;
      default:
        // Asks are answered under the Attention tab's Asked filter.
        closeAll();
        setTab("attention");
        return;
    }
  }, [pendingDeepLink]);

  useEffect(() => {
    if (!isCaptureModeEnabled()) return;
    registerTrainerCaptureNav({
      setTab,
      signOut,
      clearOverlay() {
        closeAll();
        setClientsSegment("clients");
      },
      openActivity() {
        setTab("clients");
        setClientsSegment("activity");
      },
      async openFirstClient() {
        const page = await api.listRelationships({ limit: 20 });
        const ready = page.items.find(
          (item) =>
            item.onboardingStatus === "coaching_ready" ||
            item.onboardingStatus === "active",
        );
        if (ready) {
          openClientById(ready.id, undefined, "start");
        }
      },
      async openFirstException() {
        const groups = await s1.getAttentionGroups();
        const first = groups.groups[0]?.items?.[0];
        if (first?.id) {
          startAt({ kind: "exception", exceptionId: first.id });
        }
      },
      async openFirstCheckin() {
        const inbox = await api.listTrainerCheckinInbox();
        const item = inbox.items.find(
          (row) => row.checkin.status === "submitted",
        );
        if (item) openCheckin(item);
      },
    });
    return () => registerTrainerCaptureNav(null);
  }, [api, s1, signOut]);

  // Z14-3: an open detail screen sits over the tabs, which stay mounted
  // (hidden) underneath so Back returns to the same data.
  let overlayNode: ReactNode = null;
  if (overlay?.kind === "exception") {
    overlayNode = (
      <ExceptionReviewScreen
        key={refreshNonce}
        exceptionId={overlay.exceptionId}
        onBack={() => goBack()}
        onOpenClient={(relationshipId) => openClientById(relationshipId)}
      />
    );
  } else if (overlay?.kind === "client") {
    overlayNode = (
      <ClientStatusScreen
        key={refreshNonce}
        relationshipId={overlay.relationshipId}
        displayName={overlay.displayName}
        onboardingStatusLabelText={overlay.onboardingStatusLabelText}
        onBack={() => goBack()}
        onOpenException={(exceptionId) =>
          open({ kind: "exception", exceptionId })
        }
        onOpenCheckin={(checkinId) =>
          open({
            kind: "checkin",
            checkinId,
            relationshipId: overlay.relationshipId,
          })
        }
      />
    );
  } else if (overlay?.kind === "checkin") {
    overlayNode = (
      <CheckinReviewScreen
        key={refreshNonce}
        checkinId={overlay.checkinId}
        relationshipId={overlay.relationshipId}
        onBack={goBack}
        onOpenClient={(relationshipId) => openClientById(relationshipId)}
      />
    );
  } else if (overlay?.kind === "ask") {
    overlayNode = (
      <AskDetailScreen
        key={refreshNonce}
        askId={overlay.askId}
        initialAsk={overlay.initialAsk}
        relationshipId={overlay.relationshipId}
        displayName={overlay.displayName}
        onBack={() => goBack()}
        onAnswered={() => goBack()}
      />
    );
  } else if (overlay?.kind === "session") {
    overlayNode = (
      <SessionDetailScreen
        key={refreshNonce}
        executionId={overlay.executionId}
        relationshipId={overlay.relationshipId}
        displayName={overlay.displayName}
        onBack={() => goBack()}
      />
    );
  } else if (overlay?.kind === "notifications") {
    overlayNode = (
      <TrainerNotificationSettingsScreen onBack={() => goBack()} />
    );
  } else if (overlay?.kind === "profile") {
    overlayNode = <TrainerProfileScreen onBack={() => goBack()} />;
  }

  const atTabs = overlayNode === null;
  return (
    <View style={styles.root}>
      {overlayNode}
      <View style={[styles.root, atTabs ? null : styles.hidden]}>
      <View style={styles.content}>
        {visited.has("attention") ? (
          <View style={tab === "attention" ? styles.content : styles.hidden}>
          <AttentionTab
            key={refreshNonce}
            active={atTabs && tab === "attention"}
            onReviewException={(exceptionId) =>
              startAt({ kind: "exception", exceptionId })
            }
            onReviewCheckin={openCheckin}
            onOpenClients={() => setTab("clients")}
            onOpenClient={(relationshipId) => {
              void openClientById(relationshipId, undefined, "start");
            }}
            onOpenAsk={(ask, displayName) =>
              startAt({
                kind: "ask",
                askId: ask.id,
                relationshipId: ask.relationshipId,
                displayName,
                initialAsk: ask,
              })
            }
          />
          </View>
        ) : null}

        {visited.has("clients") ? (
          <View style={tab === "clients" ? styles.content : styles.hidden}>
          <ClientsTab
            key={`${refreshNonce}:${clientsSegment}`}
            active={atTabs && tab === "clients"}
            onOpenClient={openClientFromRow}
            initialSegment={clientsSegment}
            onOpenAsk={(askId, relationshipId, displayName) =>
              startAt({
                kind: "ask",
                askId,
                relationshipId,
                displayName,
              })
            }
            onOpenSession={(executionId, relationshipId, displayName) =>
              startAt({
                kind: "session",
                executionId,
                relationshipId,
                displayName,
              })
            }
          />
          </View>
        ) : null}

        {visited.has("checkins") ? (
          <View style={tab === "checkins" ? styles.content : styles.hidden}>
            <CheckinsTab
              key={refreshNonce}
              active={atTabs && tab === "checkins"}
              onReviewCheckin={openCheckin}
            />
          </View>
        ) : null}

        {tab === "more" ? (
          <TrainerMoreScreen
            onOpenNotifications={() => startAt({ kind: "notifications" })}
            onOpenProfile={() => startAt({ kind: "profile" })}
          />
        ) : null}
      </View>

      <View accessibilityRole="tablist" style={styles.tabBar}>
        {TABS.map((item) => {
          const selected = item.id === tab;
          return (
            <Pressable
              key={item.id}
              testID={`tab-${item.id}`}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              onPress={() => setTab(item.id)}
              style={styles.tab}
            >
              <Text
                style={[
                  styles.tabLabel,
                  selected ? styles.tabLabelSelected : null,
                ]}
              >
                {item.label}
              </Text>
              {selected ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
          );
        })}
      </View>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  root: {
    flex: 1,
    backgroundColor: t.colors.bg,
  },
  content: {
    flex: 1,
  },
  hidden: {
    display: "none",
  },
  banner: {
    backgroundColor: t.colors.brandTint,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  bannerTitle: {
    color: t.colors.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  bannerBody: {
    color: t.colors.ink3,
    fontSize: 14,
    lineHeight: 20,
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: t.colors.line,
    backgroundColor: t.colors.card,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    gap: spacing.xs,
  },
  tabLabel: {
    color: t.colors.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  tabLabelSelected: {
    color: t.colors.brand,
    fontWeight: "600",
  },
  tabIndicator: {
    width: 16,
    height: 3,
    borderRadius: 999,
    backgroundColor: t.colors.brand,
  },
}));
