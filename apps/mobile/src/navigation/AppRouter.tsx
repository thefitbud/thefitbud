import { ActivityIndicator, Platform, View } from "react-native";
import { CircleAlert, RefreshCw } from "lucide-react-native";
import { useAuth } from "../auth/AuthProvider";
import { ForegroundPushNotices } from "../components/notice/ForegroundPushNotices";
import { NoticeHost } from "../components/notice/NoticeHost";
import { SpecimensScreen } from "../dev/SpecimensScreen";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../providers/ThemeProvider";
import { AcceptInviteScreen } from "../screens/AcceptInviteScreen";
import { AuthScreen } from "../screens/AuthScreen";
import { CenteredState } from "../screens/auth/authParts";
import { IntakeScreen } from "../screens/IntakeScreen";
import { RoleSelectScreen, SwitchRoleSheet } from "../screens/RoleSelectScreen";
import { UnsupportedRoleScreen } from "../screens/UnsupportedRoleScreen";
import { WaitingReviewScreen } from "../screens/WaitingReviewScreen";
import { TrainerShell } from "../trainer/TrainerShell";
import { TraineeShell } from "../trainee/TraineeShell";
import { coachLinkSubject, coachPushSubject, type AppRoute } from "./resolveRoute";
import { routerView } from "./routerView";

function isSpecimensPath(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return window.location.pathname.includes("__specimens");
}

export function AppRouter() {
  const {
    route,
    errorMessage,
    refreshSession,
    signOut,
    clearError,
    pendingRoleSwitch,
    confirmRoleSwitch,
    cancelRoleSwitch,
  } = useAuth();

  if (isSpecimensPath()) {
    return <SpecimensScreen />;
  }

  const view = routerView(route, errorMessage);

  if (view.view === "loading") {
    return (
      <ThemeScope scheme="system">
        <LoadingView />
      </ThemeScope>
    );
  }

  if (view.view === "error") {
    // TR-21 pattern: the account could not load. The message is curated
    // (an `ApiClientError` body or a short code), never a raw error.
    return (
      <CenteredState
        testID="app-error"
        icon={(color) => <CircleAlert color={color} size={30} strokeWidth={1.9} />}
        title="Something went wrong"
        body={`We could not load your coaching account. ${view.message}`}
        actionTint
        action={{
          label: "Try again",
          icon: (color) => <RefreshCw color={color} size={20} strokeWidth={2.25} />,
          onPress: () => {
            clearError();
            void refreshSession();
          },
        }}
        link={{ label: "Sign out", onPress: signOut }}
      />
    );
  }

  const screen = routeScreen(view.route);
  // Z12-38: one notice host for both roles; in-app banners and toasts queue here.
  return (
    <NoticeHost>
      <ForegroundPushNotices />
      {screen}
      {pendingRoleSwitch ? (
        // Frame 61 (Z11-14) and a coach push (Z12-49): over the trainee
        // screen, a coach link or push asks first (TM-08c sheet).
        <SwitchRoleSheet
          visible
          targetRole={pendingRoleSwitch.targetRole}
          subject={
            pendingRoleSwitch.pushType
              ? coachPushSubject(pendingRoleSwitch.pushType)
              : coachLinkSubject(pendingRoleSwitch.linkKind)
          }
          onCancel={cancelRoleSwitch}
          onSwitch={() => {
            void confirmRoleSwitch();
          }}
        />
      ) : null}
    </NoticeHost>
  );
}

function LoadingView() {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.loading} accessibilityLabel="Loading">
      <ActivityIndicator size="large" color={theme.colors.brand} />
    </View>
  );
}

function routeScreen(current: Exclude<AppRoute, { name: "loading" }>) {
  switch (current.name) {
    case "auth":
      return <AuthScreen />;
    case "unsupported_role":
      return <UnsupportedRoleScreen />;
    case "role_select":
      return <RoleSelectScreen />;
    case "accept_invite":
      return <AcceptInviteScreen />;
    case "intake":
      return <IntakeScreen relationshipId={current.relationshipId} />;
    case "waiting_review":
      return <WaitingReviewScreen relationship={current.relationship} />;
    case "trainee_shell":
      return <TraineeShell relationship={current.relationship} />;
    case "trainer_shell":
      return <TrainerShell />;
    default: {
      const _exhaustive: never = current;
      return _exhaustive;
    }
  }
}

const useStyles = createThemedStyles((t) => ({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.bg,
  },
}));
