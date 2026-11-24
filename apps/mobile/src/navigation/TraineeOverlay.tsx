import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type {
  CreateCoachAskRequest,
  EffectivePlanResponse,
  MealAssignment,
} from "@fitbud/contracts";

type CoachAskItemType = CreateCoachAskRequest["itemType"];
import type { CoachingRelationship } from "@fitbud/contracts";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import { formatCivilDate } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { BottomSheet } from "../components/BottomSheet";
import { Screen } from "../components/Screen";
import { createThemedStyles } from "../providers/ThemeProvider";
import { addDays, localDateInTimezone } from "../lib/dates";
import { reportError } from "../lib/reportError";
import type { NotificationDeepLink } from "../notifications/routing";
import { AssignedMealPlanScreen } from "../trainee/AssignedMealPlanScreen";
import type { EffectivePlanState } from "../trainee/TodayTab";
import { AskCoachSheet } from "../trainee/ask/AskCoachSheet";
import { DeepLinkUnavailableScreen } from "../trainee/DeepLinkUnavailableScreen";
import { EndedCoachingScreen } from "../trainee/EndedCoachingScreen";
import { FoodSearchScreen } from "../trainee/FoodSearchScreen";
import { NotificationsScreen } from "../trainee/NotificationsScreen";
import { SomethingDifferentSheet } from "../trainee/SomethingDifferentSheet";
import { WidgetTipsScreen } from "../trainee/WidgetTipsScreen";
import { WorkoutOverviewScreen } from "../trainee/WorkoutOverviewScreen";
import { ReminderSetupScreen } from "../trainee/setup/ReminderSetupScreen";
import { MealTimesScreen } from "../trainee/settings/MealTimesScreen";
import { PasswordScreen } from "../trainee/settings/PasswordScreen";
import { PastCoachingScreen } from "../trainee/settings/PastCoachingScreen";
import { PrivacyScreen } from "../trainee/settings/PrivacyScreen";
import { DeleteAccountScreen } from "../trainee/settings/DeleteAccountScreen";
import { ProfileScreen } from "../trainee/settings/ProfileScreen";
import { QuietHoursScreen } from "../trainee/settings/QuietHoursScreen";
import { ReminderSettingsScreen } from "../trainee/settings/ReminderSettingsScreen";
import { StepsSetupScreen } from "../trainee/steps/StepsSetupScreen";
import { LanguageScreen } from "../trainee/settings/LanguageScreen";
import { SyncStatusScreen } from "../trainee/settings/SyncStatusScreen";
import { AccountScreen } from "../trainee/settings/AccountScreen";
import { HelpScreen } from "../trainee/settings/HelpScreen";

export type TraineeOverlay =
  | { screen: "notifications" }
  | { screen: "reminder_setup" }
  | { screen: "reminder_settings" }
  | { screen: "quiet_hours" }
  | { screen: "meal_times" }
  | { screen: "sync" }
  | { screen: "food_search"; assignmentId: string }
  | { screen: "something_different"; assignmentId: string }
  | { screen: "meal_plan" }
  | {
      screen: "workout_overview";
      assignmentId: string;
      /**
       * D-W12-7 (Z12-39): a workout on a future day is a preview. The
       * overview shows the exercises with no Start; the API refuses a start
       * with 422 FUTURE_DAY in any case.
       */
      viewOnly?: boolean;
    }
  | {
      screen: "ask_coach";
      itemType: CoachAskItemType;
      itemId: string;
      itemLabel: string;
      dateLabel: string;
      topic?: string;
    }
  | { screen: "ended" }
  | {
      screen: "deep_link";
      reason?: string;
      updatedOnLabel?: string;
      replacement?: {
        title: string;
        subtitle: string;
      };
    }
  | { screen: "steps_settings" }
  | { screen: "profile" }
  | { screen: "past_coaching" }
  | { screen: "widget_tips" }
  | { screen: "privacy" }
  /** Z12-29: Privacy → Delete account. */
  | { screen: "delete_account" }
  | { screen: "password" }
  | { screen: "language" }
  | { screen: "account" }
  | { screen: "help" };

/** Why a meal screen has no meal: said in words, never as a code (D-W14-3). */
export function mealUnavailableReason(err: unknown): string {
  if (err instanceof ApiClientError && err.status === 404) {
    return "This meal isn't on your plan any more.";
  }
  return userFacingMessage(err, {
    fallback: "Something went wrong on our side. Try again.",
  });
}

const MEAL_GONE_REASON = "This meal isn't on your plan any more.";

type MealLoadState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "unavailable"; reason: string };

/** A load answer tagged with the meal it is for, so a stale one is never shown. */
type MealLoadResult = { id: string; state: MealLoadState };

/**
 * TR-08a2: three quiet rows while the meal loads, so "isn't available" never
 * flashes before the answer is in.
 */
function MealLoadingRows() {
  const styles = useLoadingStyles();
  return (
    <View
      style={styles.rows}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading meal"
      testID="meal-loading"
    >
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.row}>
          <View style={styles.tile} />
          <View style={styles.lines}>
            <View style={[styles.line, styles.lineShort]} />
            <View style={[styles.line, styles.lineLong]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const useLoadingStyles = createThemedStyles((t) => ({
  rows: { gap: 12, paddingBottom: 24, paddingTop: 8 },
  row: {
    alignItems: "center",
    borderColor: t.colors.line2,
    borderRadius: t.radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 72,
    padding: 14,
  },
  tile: { backgroundColor: t.colors.fill, borderRadius: 12, height: 44, width: 44 },
  lines: { flex: 1, gap: 8 },
  line: { backgroundColor: t.colors.fill, borderRadius: 8, height: 12 },
  lineShort: { width: "52%" },
  lineLong: { width: "86%" },
}));

export type TraineeOverlayOpener = (overlay: TraineeOverlay) => void;

type Props = {
  overlay: TraineeOverlay;
  relationship: CoachingRelationship;
  effectivePlan: EffectivePlanResponse | null;
  /** The un-narrowed plan. The meal plan screen must not read `unavailable` as loading. */
  planState: EffectivePlanState;
  onRetryPlan?: () => void;
  presentation?: "fullscreen" | "sheet";
  onClose: () => void;
  onOpen: TraineeOverlayOpener;
  onSignOut: () => void;
  onGoToday?: () => void;
  onOpenDiet?: () => void;
  onNotificationNavigate?: (link: NotificationDeepLink) => void;
  onCoachingResumed?: (relationship: CoachingRelationship) => void;
  onStartWorkout?: (assignmentId: string) => void;
};

export function TraineeOverlayHost({
  overlay,
  relationship,
  effectivePlan,
  planState,
  onRetryPlan,
  presentation = "fullscreen",
  onClose,
  onOpen,
  onSignOut,
  onGoToday,
  onOpenDiet,
  onNotificationNavigate,
  onCoachingResumed,
  onStartWorkout,
}: Props) {
  const goToday = onGoToday ?? onClose;
  const { api, me } = useAuth();
  const coachName =
    relationship.trainerDisplayName?.trim() ||
    me?.trainerProfile?.displayName?.trim() ||
    "Your coach";
  const [mealAssignment, setMealAssignment] = useState<MealAssignment | null>(
    null,
  );

  const [loadResult, setLoadResult] = useState<MealLoadResult | null>(null);
  const loadToken = useRef(0);

  const loadMealAssignment = useCallback(
    async (assignmentId: string) => {
      const today = localDateInTimezone(me?.timezone ?? "UTC");
      const token = ++loadToken.current;
      const settle = (next: MealLoadState, meal: MealAssignment | null) => {
        if (token !== loadToken.current) return;
        setMealAssignment(meal);
        setLoadResult({ id: assignmentId, state: next });
      };
      try {
        const listed = await api.listMealAssignments(relationship.id, {
          fromDate: addDays(today, -14),
          toDate: addDays(today, 7),
        });
        const match = listed.items.find((item) => item.id === assignmentId);
        if (match) {
          settle({ kind: "ready" }, match);
          return;
        }
        const value = await api.getMealAssignment(assignmentId);
        if (value) settle({ kind: "ready" }, value);
        else settle({ kind: "unavailable", reason: MEAL_GONE_REASON }, null);
      } catch (err) {
        reportError("TraineeOverlay.loadMeal", err);
        settle({ kind: "unavailable", reason: mealUnavailableReason(err) }, null);
      }
    },
    [api, me?.timezone, relationship.id],
  );

  // The answer counts only for the meal this overlay asks about: until it
  // arrives the screen shows the loading state, never "isn't available".
  const wantedMealId =
    overlay.screen === "something_different" || overlay.screen === "food_search"
      ? overlay.assignmentId
      : null;
  const mealLoad: MealLoadState =
    loadResult && loadResult.id === wantedMealId
      ? loadResult.state
      : { kind: "loading" };

  useEffect(() => {
    if (
      overlay.screen === "something_different" ||
      overlay.screen === "food_search"
    ) {
      setMealAssignment(null);
      setLoadResult(null);
      void loadMealAssignment(overlay.assignmentId);
    } else {
      loadToken.current += 1;
      setMealAssignment(null);
    }
  }, [overlay, loadMealAssignment]);

  switch (overlay.screen) {
    case "notifications":
      return (
        <NotificationsScreen
          coachName={coachName}
          onBack={onClose}
          onOpenSettings={() => onOpen({ screen: "reminder_settings" })}
          onNavigate={(link) => {
            onClose();
            onNotificationNavigate?.(link);
          }}
        />
      );
    case "reminder_setup":
      return (
        <ReminderSetupScreen
          onDone={onClose}
          onOpenQuietHours={() => onOpen({ screen: "quiet_hours" })}
        />
      );
    case "reminder_settings":
      return (
        <ReminderSettingsScreen
          onBack={onClose}
          onOpenQuietHours={() => onOpen({ screen: "quiet_hours" })}
          onOpenMealTimes={() => onOpen({ screen: "meal_times" })}
          onOpenBatteryHelp={() => onOpen({ screen: "reminder_setup" })}
          coachName={coachName}
        />
      );
    case "quiet_hours":
      return <QuietHoursScreen onBack={onClose} />;
    case "meal_times":
      return <MealTimesScreen onBack={onClose} coachName={coachName} />;
    case "sync":
      return <SyncStatusScreen onBack={onClose} coachName={coachName} />;
    case "language":
      return <LanguageScreen onBack={onClose} />;
    case "steps_settings":
      return <StepsSetupScreen coachName={coachName} onBack={onClose} />;
    case "food_search":
      if (!mealAssignment) {
        if (mealLoad.kind === "loading") {
          return (
            <Screen v3 chrome="app" title="Loading meal" showHeader={false}>
              <MealLoadingRows />
            </Screen>
          );
        }
        return (
          <DeepLinkUnavailableScreen
            reason={
              mealLoad.kind === "unavailable" ? mealLoad.reason : MEAL_GONE_REASON
            }
            onGoToday={goToday}
          />
        );
      }
      return (
        <FoodSearchScreen
          assignment={mealAssignment}
          relationshipId={relationship.id}
          coachName={coachName}
          onBack={onClose}
          onSaved={onClose}
        />
      );
    case "something_different":
      if (!mealAssignment) {
        const loading = mealLoad.kind === "loading";
        const reason =
          mealLoad.kind === "unavailable" ? mealLoad.reason : MEAL_GONE_REASON;
        if (presentation === "sheet") {
          return (
            <BottomSheet
              visible
              title="What did you have instead?"
              subtitle={loading ? undefined : "This meal can't be opened"}
              onDismiss={onClose}
            >
              {loading ? (
                <MealLoadingRows />
              ) : (
                <DeepLinkUnavailableScreen reason={reason} onGoToday={goToday} />
              )}
            </BottomSheet>
          );
        }
        if (loading) {
          return (
            <Screen
              v3
              title="What did you have instead?"
              subtitle="Loading meal"
            >
              <MealLoadingRows />
            </Screen>
          );
        }
        return <DeepLinkUnavailableScreen reason={reason} onGoToday={goToday} />;
      }
      if (presentation === "sheet") {
        return (
          <BottomSheet visible headerless onDismiss={onClose}>
            <SomethingDifferentSheet
              variant="sheet"
              assignment={mealAssignment}
              relationshipId={relationship.id}
              coachName={coachName}
              onDone={onClose}
              onCancel={onClose}
              onOpenFoodSearch={() =>
                onOpen({
                  screen: "food_search",
                  assignmentId: mealAssignment.id,
                })
              }
              onAskCoach={() =>
                onOpen({
                  screen: "ask_coach",
                  itemType: "meal_assignment",
                  itemId: mealAssignment.id,
                  itemLabel: mealAssignment.mealName,
                  dateLabel: formatCivilDate(mealAssignment.localDate),
                  topic: mealAssignment.mealName,
                })
              }
            />
          </BottomSheet>
        );
      }
      return (
        <SomethingDifferentSheet
          assignment={mealAssignment}
          relationshipId={relationship.id}
          onDone={onClose}
          onCancel={onClose}
        />
      );
    case "meal_plan":
      return (
        <AssignedMealPlanScreen
          planState={planState}
          onRetryPlan={onRetryPlan}
          coachName={coachName}
          insetTabBar
          onBack={onClose}
          onAskCoach={() =>
            onOpen({
              screen: "ask_coach",
              itemType: "plan_version",
              itemId: effectivePlan?.version?.id ?? "plan",
              itemLabel: "Meal plan",
              dateLabel: "Today",
            })
          }
        />
      );
    case "workout_overview":
      return (
        <WorkoutOverviewScreen
          assignmentId={overlay.assignmentId}
          coachName={coachName}
          onBack={onClose}
          onStart={
            onStartWorkout && !overlay.viewOnly
              ? (assignment) => {
                  onClose();
                  onStartWorkout(assignment.id);
                }
              : undefined
          }
          onAskCoach={(assignment) =>
            onOpen({
              screen: "ask_coach",
              itemType: "workout_assignment",
              itemId: assignment.id,
              itemLabel: assignment.workoutDayName,
              dateLabel: formatCivilDate(assignment.localDate),
              topic: assignment.workoutDayName,
            })
          }
        />
      );
    case "ask_coach":
      return (
        <AskCoachSheet
          relationship={relationship}
          itemType={overlay.itemType}
          itemId={overlay.itemId}
          itemLabel={overlay.itemLabel}
          dateLabel={overlay.dateLabel}
          topic={overlay.topic}
          onDone={onClose}
          onCancel={onClose}
        />
      );
    case "ended":
      return (
        <EndedCoachingScreen
          relationship={relationship}
          coachName={coachName}
          onOpenHistory={() => onOpen({ screen: "past_coaching" })}
          onSignOut={onSignOut}
          onCoachingResumed={(updated) => {
            onCoachingResumed?.(updated);
          }}
        />
      );
    case "deep_link":
      return (
        <DeepLinkUnavailableScreen
          reason={overlay.reason}
          updatedOnLabel={overlay.updatedOnLabel}
          replacement={
            overlay.replacement
              ? {
                  ...overlay.replacement,
                  onPress: goToday,
                }
              : null
          }
          insetTabBar
          onGoToday={goToday}
          onBack={onClose}
        />
      );
    case "profile":
      return (
        <ProfileScreen
          onBack={onClose}
          coachName={coachName}
        />
      );
    case "past_coaching":
      return (
        <PastCoachingScreen
          onBack={onClose}
          relationshipId={relationship.id}
          coachName={coachName}
          endedAt={relationship.endedAt}
        />
      );
    case "widget_tips":
      return (
        <WidgetTipsScreen
          onBack={onClose}
          coachName={coachName}
          onOpenMeal={(assignmentId) =>
            onOpen({ screen: "something_different", assignmentId })
          }
          onOpenDiet={onOpenDiet}
          onGoToday={goToday}
        />
      );
    case "privacy":
      return (
        <PrivacyScreen
          onBack={onClose}
          onDeleteAccount={() => onOpen({ screen: "delete_account" })}
        />
      );
    case "delete_account":
      return <DeleteAccountScreen onBack={() => onOpen({ screen: "privacy" })} />;
    case "password":
      return <PasswordScreen onBack={onClose} />;
    case "account":
      return (
        <AccountScreen
          onBack={onClose}
          onOpenPassword={() => onOpen({ screen: "password" })}
          onOpenPrivacy={() => onOpen({ screen: "privacy" })}
          onOpenLanguage={() => onOpen({ screen: "language" })}
          onOpenPastCoaching={() => onOpen({ screen: "past_coaching" })}
        />
      );
    case "help":
      return (
        <HelpScreen
          onBack={onClose}
          coachName={coachName}
          coachWhatsappE164={relationship.trainerWhatsappE164}
          coachingActive={relationship.status !== "ended"}
        />
      );
    default: {
      const _exhaustive: never = overlay;
      return _exhaustive;
    }
  }
}
