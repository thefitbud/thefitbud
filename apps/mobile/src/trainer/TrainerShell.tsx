import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TrainerCheckinInboxItem } from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { AttentionTab } from "./AttentionTab";
import { TrainerMoreScreen } from "./MoreScreen";
import { CheckinReviewScreen } from "./CheckinReviewScreen";
import { CheckinsTab } from "./CheckinsTab";
import {
  onboardingStatusLabel,
  type ClientDirectoryRow,
} from "./clients";
import { ClientsTab } from "./ClientsTab";
import { ClientStatusScreen } from "./ClientStatusScreen";
import { ExceptionReviewScreen } from "./ExceptionReviewScreen";
import {
  isCaptureModeEnabled,
  registerTrainerCaptureNav,
} from "../dev/captureBridge";
import { stage1Api } from "../lib/stage1Api";

type TrainerTab = "attention" | "clients" | "checkins" | "more";

type Overlay =
  | { kind: "exception"; exceptionId: string }
  | {
      kind: "client";
      relationshipId: string;
      displayName: string;
      onboardingStatusLabelText: string;
    }
  | { kind: "checkin"; checkinId: string; relationshipId: string };

const TABS: Array<{ id: TrainerTab; label: string }> = [
  { id: "attention", label: "Attention" },
  { id: "clients", label: "Clients" },
  { id: "checkins", label: "Check-ins" },
  { id: "more", label: "More" },
];

export function TrainerShell() {
  const { relationships, api, signOut } = useAuth();
  const s1 = stage1Api(api);
  const [tab, setTab] = useState<TrainerTab>("attention");
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [clientsSegment, setClientsSegment] = useState<"clients" | "activity">(
    "clients",
  );

  function openClientFromRow(row: ClientDirectoryRow) {
    if (!row.relationshipId) return;
    setOverlay({
      kind: "client",
      relationshipId: row.relationshipId,
      displayName: row.name,
      onboardingStatusLabelText: onboardingStatusLabel(row.onboardingStatus),
    });
  }

  function openClientById(relationshipId: string) {
    const relationship = relationships.find((item) => item.id === relationshipId);
    setOverlay({
      kind: "client",
      relationshipId,
      displayName: relationship
        ? `Trainee ${relationship.traineeUserId.slice(0, 8)}`
        : "Client",
      onboardingStatusLabelText: relationship
        ? onboardingStatusLabel(relationship.onboardingStatus)
        : "Unknown",
    });
  }

  function openCheckin(item: TrainerCheckinInboxItem) {
    setOverlay({
      kind: "checkin",
      checkinId: item.checkin.id,
      relationshipId: item.coachingRelationshipId,
    });
  }

  useEffect(() => {
    if (!isCaptureModeEnabled()) return;
    registerTrainerCaptureNav({
      setTab,
      signOut,
      clearOverlay() {
        setOverlay(null);
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
          openClientById(ready.id);
        }
      },
      async openFirstException() {
        const groups = await s1.getAttentionGroups();
        const first = groups.groups[0]?.items?.[0];
        if (first?.id) {
          setOverlay({ kind: "exception", exceptionId: first.id });
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

  if (overlay?.kind === "exception") {
    return (
      <ExceptionReviewScreen
        exceptionId={overlay.exceptionId}
        onBack={() => setOverlay(null)}
        onOpenClient={(relationshipId) => openClientById(relationshipId)}
      />
    );
  }

  if (overlay?.kind === "client") {
    return (
      <ClientStatusScreen
        relationshipId={overlay.relationshipId}
        displayName={overlay.displayName}
        onboardingStatusLabelText={overlay.onboardingStatusLabelText}
        onBack={() => setOverlay(null)}
        onOpenException={(exceptionId) =>
          setOverlay({ kind: "exception", exceptionId })
        }
        onOpenCheckin={(checkinId) =>
          setOverlay({
            kind: "checkin",
            checkinId,
            relationshipId: overlay.relationshipId,
          })
        }
      />
    );
  }

  if (overlay?.kind === "checkin") {
    return (
      <CheckinReviewScreen
        checkinId={overlay.checkinId}
        relationshipId={overlay.relationshipId}
        onBack={() => setOverlay(null)}
        onOpenClient={(relationshipId) => openClientById(relationshipId)}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {tab === "attention" ? (
          <AttentionTab
            onReviewException={(exceptionId) =>
              setOverlay({ kind: "exception", exceptionId })
            }
            onReviewCheckin={openCheckin}
            onOpenClients={() => setTab("clients")}
          />
        ) : null}

        {tab === "clients" ? (
          <ClientsTab
            onOpenClient={openClientFromRow}
            initialSegment={clientsSegment}
          />
        ) : null}

        {tab === "checkins" ? (
          <CheckinsTab onReviewCheckin={openCheckin} />
        ) : null}

        {tab === "more" ? <TrainerMoreScreen /> : null}
      </View>

      <View accessibilityRole="tablist" style={styles.tabBar}>
        {TABS.map((item) => {
          const selected = item.id === tab;
          return (
            <Pressable
              key={item.id}
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
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  banner: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  bannerTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  bannerBody: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.lightGrey,
    backgroundColor: colors.white,
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
    color: colors.midGrey,
    fontSize: 12,
    fontWeight: "500",
  },
  tabLabelSelected: {
    color: colors.indigo,
    fontWeight: "600",
  },
  tabIndicator: {
    width: 16,
    height: 3,
    borderRadius: 999,
    backgroundColor: colors.indigo,
  },
});
