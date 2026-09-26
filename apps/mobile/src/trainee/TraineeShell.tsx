import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type {
  Checkin,
  CoachingRelationship,
  EffectivePlanResponse,
} from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { useRealtimeHints } from "../realtime/useRealtimeHints";
import { useSyncEngine } from "../sync/SyncProvider";
import { CheckinScreen, TodayCheckinCard } from "./CheckinScreen";
import { DietTab } from "./DietTab";
import { ProgressTab } from "./ProgressTab";
import { WorkoutTab } from "./WorkoutTab";

type TraineeTab = "today" | "workout" | "diet" | "progress" | "more";

const TABS: Array<{ id: TraineeTab; label: string }> = [
  { id: "today", label: "Today" },
  { id: "workout", label: "Workout" },
  { id: "diet", label: "Diet" },
  { id: "progress", label: "Progress" },
  { id: "more", label: "More" },
];

export function TraineeShell({
  relationship,
}: {
  relationship: CoachingRelationship;
}) {
  const {
    me,
    signOut,
    refreshSession,
    selectRole,
    api,
    pendingNotificationLink,
    clearPendingNotificationLink,
  } = useAuth();
  const sync = useSyncEngine();
  const [tab, setTab] = useState<TraineeTab>("today");
  const [activeCheckin, setActiveCheckin] = useState<Checkin | null>(null);
  const [effectivePlan, setEffectivePlan] =
    useState<EffectivePlanResponse | null>(null);

  const loadEffectivePlan = useCallback(async () => {
    try {
      await sync.pullAndApply().catch(() => undefined);
      const result = await api.getEffectivePlan(relationship.id);
      setEffectivePlan(result);
      if (result.version) {
        await sync.store.upsertLocal({
          entityType: "effective_plan",
          recordId: result.version.id,
          serverVersion: result.version.recordVersion,
          payloadJson: JSON.stringify(result),
          tombstone: false,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      const cached = await sync.store.listLocal("effective_plan");
      const newest = cached
        .filter((row) => !row.tombstone && row.payloadJson)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (newest?.payloadJson) {
        setEffectivePlan(JSON.parse(newest.payloadJson) as EffectivePlanResponse);
      } else {
        setEffectivePlan(null);
      }
    }
  }, [api, relationship.id, sync]);

  useEffect(() => {
    void loadEffectivePlan();
  }, [loadEffectivePlan]);

  // Selected realtime: events are hints — pull sync + refetch authoritative plan.
  useRealtimeHints(api, relationship.id, () => {
    void loadEffectivePlan();
  });

  // Notification open → route to tab. Refetch authoritative state; do not trust payload as state.
  useEffect(() => {
    if (!pendingNotificationLink) return;
    setTab(pendingNotificationLink.tab);
    void refreshSession();
    void loadEffectivePlan();
    if (pendingNotificationLink.tab === "today") {
      void (async () => {
        try {
          const list = await api.listCheckins(relationship.id);
          const match = list.items.find(
            (item) => item.id === pendingNotificationLink.domainEntityId,
          );
          if (match) setActiveCheckin(match);
        } catch {
          // Refetch failure leaves the Today tab; payload is not used as state.
        }
      })();
    }
    clearPendingNotificationLink();
  }, [
    pendingNotificationLink,
    clearPendingNotificationLink,
    refreshSession,
    loadEffectivePlan,
    api,
    relationship.id,
  ]);

  if (activeCheckin) {
    return (
      <CheckinScreen
        relationship={relationship}
        checkin={activeCheckin}
        onDone={() => setActiveCheckin(null)}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {tab === "today" ? (
          <Screen
            title="Today"
            subtitle="Your next useful actions from the effective plan."
          >
            <TodayCheckinCard
              relationship={relationship}
              onOpen={setActiveCheckin}
            />
            {effectivePlan?.version ? (
              <View style={styles.banner}>
                <Text style={styles.bannerTitle}>Effective plan</Text>
                <Text style={styles.bannerBody}>
                  {effectivePlan.plan?.title ?? "Plan"} · v
                  {effectivePlan.version.versionNumber}
                  {effectivePlan.version.effectiveFrom
                    ? ` · from ${effectivePlan.version.effectiveFrom.slice(0, 10)}`
                    : ""}
                </Text>
              </View>
            ) : (
              <View style={styles.banner}>
                <Text style={styles.bannerTitle}>No effective plan yet</Text>
                <Text style={styles.bannerBody}>
                  When your trainer publishes an adjustment, it appears here
                  once effective.
                </Text>
              </View>
            )}
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>Today’s actions</Text>
              <Text style={styles.bannerBody}>
                Open Workout or Diet for assigned work from your effective plan.
              </Text>
            </View>
            <PrimaryButton
              label="Go to Workout"
              onPress={() => setTab("workout")}
            />
            <PrimaryButton
              label="Go to Diet"
              variant="secondary"
              onPress={() => setTab("diet")}
            />
            <PrimaryButton
              label="Refresh"
              variant="secondary"
              onPress={() => {
                void refreshSession();
                void loadEffectivePlan();
              }}
            />
          </Screen>
        ) : null}

        {tab === "workout" ? <WorkoutTab relationship={relationship} /> : null}

        {tab === "diet" ? <DietTab relationship={relationship} /> : null}

        {tab === "progress" ? <ProgressTab relationship={relationship} /> : null}

        {tab === "more" ? (
          <Screen title="More" subtitle="Account and secondary actions.">
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>Selected role</Text>
              <Text style={styles.bannerBody}>
                Trainee · mobile · {me?.userId ?? "unknown"}
              </Text>
            </View>
            {me?.permittedRoles.includes("trainer") ? (
              <PrimaryButton
                label="Switch to trainer mode"
                variant="secondary"
                onPress={() => {
                  void selectRole("trainer");
                }}
              />
            ) : null}
            <PrimaryButton label="Sign out" variant="ghost" onPress={signOut} />
          </Screen>
        ) : null}
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
    backgroundColor: colors.coral,
  },
});
