import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import type {
  Checkin,
  CoachingRelationship,
  EffectivePlanResponse,
} from "@fitbud/contracts";
import { useAuth } from "../auth/AuthProvider";
import { AppTopBar } from "../components/AppTopBar";
import { formatHeadingDate, localDateInTimezone } from "../lib/dates";
import {
  TraineeOverlayHost,
  type TraineeOverlay,
  type TraineeOverlayOpener,
} from "../navigation/TraineeOverlay";
import { useRealtimeHints } from "../realtime/useRealtimeHints";
import { useSyncEngine } from "../sync/SyncProvider";
import { CheckinScreen } from "./CheckinScreen";
import { DietTab } from "./DietTab";
import { MoreScreen } from "./MoreScreen";
import { ProgressTab } from "./ProgressTab";
import { TodayTab } from "./TodayTab";
import { WorkoutTab } from "./WorkoutTab";

type TraineeTab = "today" | "workout" | "diet" | "progress" | "more";

const TABS: Array<{ id: TraineeTab; label: string }> = [
  { id: "today", label: "Today" },
  { id: "workout", label: "Workout" },
  { id: "diet", label: "Diet" },
  { id: "progress", label: "Progress" },
  { id: "more", label: "More" },
];

const TAB_TITLES: Record<TraineeTab, string> = {
  today: "Today",
  workout: "Workout",
  diet: "Diet",
  progress: "Progress",
  more: "More",
};

export function TraineeShell({
  relationship,
}: {
  relationship: CoachingRelationship;
}) {
  const {
    me,
    signOut,
    refreshSession,
    api,
    pendingNotificationLink,
    clearPendingNotificationLink,
  } = useAuth();
  const sync = useSyncEngine();
  const timeZone = me?.timezone ?? "UTC";
  const today = useMemo(() => localDateInTimezone(timeZone), [timeZone]);

  const [tab, setTab] = useState<TraineeTab>("today");
  const [selectedDate, setSelectedDate] = useState(today);
  const [overlay, setOverlay] = useState<TraineeOverlay | null>(null);
  const [activeCheckin, setActiveCheckin] = useState<Checkin | null>(null);
  const [effectivePlan, setEffectivePlan] =
    useState<EffectivePlanResponse | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const openOverlay: TraineeOverlayOpener = useCallback((next) => {
    setOverlay(next);
  }, []);

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

  const refreshUnread = useCallback(async () => {
    try {
      const page = await api.listNotifications();
      setUnreadNotifications(
        page.items.filter((item) => item.readAt == null).length,
      );
    } catch {
      setUnreadNotifications(0);
    }
  }, [api]);

  useEffect(() => {
    void loadEffectivePlan();
    void refreshUnread();
  }, [loadEffectivePlan, refreshUnread]);

  useEffect(() => {
    setSelectedDate(today);
  }, [today]);

  useRealtimeHints(api, relationship.id, () => {
    void loadEffectivePlan();
    void refreshUnread();
  });

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
          // ignore
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

  if (relationship.status === "ended" && overlay?.screen !== "past_coaching") {
    return (
      <TraineeOverlayHost
        overlay={{ screen: "ended" }}
        relationship={relationship}
        effectivePlan={effectivePlan}
        onClose={() => setOverlay({ screen: "past_coaching" })}
        onOpen={openOverlay}
        onSignOut={signOut}
      />
    );
  }

  if (activeCheckin) {
    return (
      <CheckinScreen
        relationship={relationship}
        checkin={activeCheckin}
        onDone={() => setActiveCheckin(null)}
      />
    );
  }

  if (overlay) {
    return (
      <TraineeOverlayHost
        overlay={overlay}
        relationship={relationship}
        effectivePlan={effectivePlan}
        onClose={() => setOverlay(null)}
        onOpen={openOverlay}
        onSignOut={signOut}
      />
    );
  }

  const subtitle =
    tab === "today"
      ? formatHeadingDate(timeZone, selectedDate)
      : tab === "diet"
        ? selectedDate
        : undefined;

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <View style={styles.topPad}>
          <AppTopBar
            title={TAB_TITLES[tab]}
            subtitle={subtitle}
            unreadNotifications={unreadNotifications}
            onOpenNotifications={() => openOverlay({ screen: "notifications" })}
            onOpenSync={() => openOverlay({ screen: "sync" })}
          />
        </View>

        {tab === "today" ? (
          <TodayTab
            relationship={relationship}
            effectivePlan={effectivePlan}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onOpenWorkout={() => setTab("workout")}
            onOpenDiet={() => setTab("diet")}
            onOpenCheckin={setActiveCheckin}
            onRefreshPlan={() => {
              void refreshSession();
              void loadEffectivePlan();
            }}
            onOpenOverlay={openOverlay}
          />
        ) : null}

        {tab === "workout" ? (
          <WorkoutTab
            relationship={relationship}
            selectedDate={selectedDate}
            onOpenOverlay={openOverlay}
          />
        ) : null}

        {tab === "diet" ? (
          <DietTab
            relationship={relationship}
            selectedDate={selectedDate}
            onOpenOverlay={openOverlay}
          />
        ) : null}

        {tab === "progress" ? <ProgressTab relationship={relationship} /> : null}

        {tab === "more" ? (
          <MoreScreen relationship={relationship} onOpenOverlay={openOverlay} />
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
  topPad: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
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
    width: 18,
    height: 3,
    borderRadius: 999,
    backgroundColor: colors.indigo,
  },
});
