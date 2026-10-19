import { useCallback, useEffect, useState } from "react";
import type {
  CreateCoachAskRequest,
  EffectivePlanResponse,
  MealAssignment,
} from "@fitbud/contracts";

type CoachAskItemType = CreateCoachAskRequest["itemType"];
import type { CoachingRelationship } from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { BottomSheet } from "../components/BottomSheet";
import { addDays, localDateInTimezone } from "../lib/dates";
import type { NotificationDeepLink } from "../notifications/routing";
import { AssignedMealPlanScreen } from "../trainee/AssignedMealPlanScreen";
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
import { ProfileScreen } from "../trainee/settings/ProfileScreen";
import { QuietHoursScreen } from "../trainee/settings/QuietHoursScreen";
import { ReminderSettingsScreen } from "../trainee/settings/ReminderSettingsScreen";
import { StepsSettingsScreen } from "../trainee/settings/StepsSettingsScreen";
import { LanguageScreen } from "../trainee/settings/LanguageScreen";
import { SyncStatusScreen } from "../trainee/settings/SyncStatusScreen";

export type TraineeOverlay =
  | { screen: "notifications" }
  | { screen: "reminder_setup" }
  | { screen: "reminder_settings" }
  | { screen: "quiet_hours" }
  | { screen: "meal_times" }
  | { screen: "sync" }
  | { screen: "food_search" }
  | { screen: "something_different"; assignmentId: string }
  | { screen: "meal_plan" }
  | { screen: "workout_overview"; assignmentId: string }
  | {
      screen: "ask_coach";
      itemType: CoachAskItemType;
      itemId: string;
      itemLabel: string;
      dateLabel: string;
      topic?: string;
    }
  | { screen: "ended" }
  | { screen: "deep_link"; reason?: string }
  | { screen: "steps_settings" }
  | { screen: "profile" }
  | { screen: "past_coaching" }
  | { screen: "widget_tips" }
  | { screen: "privacy" }
  | { screen: "password" }
  | { screen: "language" };

export type TraineeOverlayOpener = (overlay: TraineeOverlay) => void;

type Props = {
  overlay: TraineeOverlay;
  relationship: CoachingRelationship;
  effectivePlan: EffectivePlanResponse | null;
  presentation?: "fullscreen" | "sheet";
  onClose: () => void;
  onOpen: TraineeOverlayOpener;
  onSignOut: () => void;
  onGoToday?: () => void;
  onOpenDiet?: () => void;
  onNotificationNavigate?: (link: NotificationDeepLink) => void;
  onCoachingResumed?: (relationship: CoachingRelationship) => void;
};

export function TraineeOverlayHost({
  overlay,
  relationship,
  effectivePlan,
  presentation = "fullscreen",
  onClose,
  onOpen,
  onSignOut,
  onGoToday,
  onOpenDiet,
  onNotificationNavigate,
  onCoachingResumed,
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

  const loadMealAssignment = useCallback(
    async (assignmentId: string) => {
      const today = localDateInTimezone(me?.timezone ?? "UTC");
      try {
        const listed = await api.listMealAssignments(relationship.id, {
          fromDate: addDays(today, -14),
          toDate: addDays(today, 7),
        });
        const match = listed.items.find((item) => item.id === assignmentId);
        if (match) {
          setMealAssignment(match);
          return;
        }
        const value = await api.getMealAssignment(assignmentId);
        setMealAssignment(value);
      } catch {
        setMealAssignment(null);
      }
    },
    [api, me?.timezone, relationship.id],
  );

  useEffect(() => {
    if (overlay.screen === "something_different") {
      void loadMealAssignment(overlay.assignmentId);
    } else {
      setMealAssignment(null);
    }
  }, [overlay, loadMealAssignment]);

  switch (overlay.screen) {
    case "notifications":
      return (
        <NotificationsScreen
          onBack={onClose}
          coachName={coachName}
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
      return <StepsSettingsScreen onBack={onClose} />;
    case "food_search":
      return <FoodSearchScreen onBack={onClose} />;
    case "something_different":
      if (!mealAssignment) {
        if (presentation === "sheet") {
          return (
            <BottomSheet
              visible
              title="What did you have instead?"
              subtitle="Loading meal…"
              onDismiss={onClose}
            >
              <DeepLinkUnavailableScreen
                reason="Could not load this meal."
                onGoToday={goToday}
              />
            </BottomSheet>
          );
        }
        return (
          <DeepLinkUnavailableScreen
            reason="Could not load this meal."
            onGoToday={goToday}
          />
        );
      }
      if (presentation === "sheet") {
        return (
          <BottomSheet
            visible
            title="What did you have instead?"
            subtitle={`${mealAssignment.mealName} · log what you actually ate`}
            onDismiss={onClose}
          >
            <SomethingDifferentSheet
              variant="sheet"
              assignment={mealAssignment}
              relationshipId={relationship.id}
              onDone={onClose}
              onCancel={onClose}
              onOpenFoodSearch={() => onOpen({ screen: "food_search" })}
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
        <AssignedMealPlanScreen effectivePlan={effectivePlan} onBack={onClose} />
      );
    case "workout_overview":
      return (
        <WorkoutOverviewScreen
          assignmentId={overlay.assignmentId}
          onBack={onClose}
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
          onGoToday={goToday}
        />
      );
    case "profile":
      return (
        <ProfileScreen
          onBack={onClose}
          onChangePassword={() => onOpen({ screen: "password" })}
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
      return <PrivacyScreen onBack={onClose} />;
    case "password":
      return <PasswordScreen onBack={onClose} />;
    default: {
      const _exhaustive: never = overlay;
      return _exhaustive;
    }
  }
}
