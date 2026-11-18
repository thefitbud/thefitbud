import { ThemeScope, createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import { ActivityIndicator, Pressable, SafeAreaView, View } from "react-native";
import { ChevronLeft, CircleCheck, CircleDashed, Footprints } from "lucide-react-native";
import { fontFamilyBold, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Button } from "../../components/Button";
import { Text } from "../../components/Text";
import type { StepsSetupPlatform, StepsSetupState } from "./useStepsSetup";

type Props = {
  platform: StepsSetupPlatform;
  state: StepsSetupState;
  coachName: string;
  busy?: boolean;
  notice?: string | null;
  /** Name of the screen Back returns to; the frames say "More". */
  backLabel?: string;
  onBack: () => void;
  onInstall: () => void;
  onConnect: () => void;
};

/** Frames 93 (Apple Health) and 95 (install Health Connect). */
function StepsSetupViewBody({
  platform,
  state,
  coachName,
  busy = false,
  notice = null,
  backLabel = "More",
  onBack,
  onInstall,
  onConnect,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const store = platform === "ios" ? "Apple Health" : "Health Connect";
  // The frames name the coach by first name.
  const coachFirst = coachName.trim().split(/\s+/)[0] || "your coach";
  const share = `shares the daily total with ${coachFirst}`;

  let title = "See your steps on Today";
  let body = `FitBud reads your daily step count from ${store} and ${share}.`;
  let footer: { label: string; onPress: () => void; loading?: boolean } | null = null;
  let footnote: string | null = null;

  if (state.kind === "install") {
    title = state.reason === "needs_update" ? "Update Health Connect" : "Install Health Connect";
    body =
      state.reason === "needs_update"
        ? `FitBud reads steps from Health Connect on Android. Update it from Play Store, then come back to connect. FitBud ${share}.`
        : `FitBud reads steps from Health Connect on Android. Install it from Play Store, then come back to connect. FitBud ${share}.`;
    footer = {
      label: state.reason === "needs_update" ? "Update Health Connect from Play Store" : "Install Health Connect from Play Store",
      onPress: onInstall,
    };
  } else if (state.kind === "unavailable") {
    title = "Steps aren't available here";
    body = "This phone has no health app FitBud can read steps from.";
  } else if (state.kind === "connect") {
    footer = {
      label: platform === "ios" ? "Connect" : "Open Health Connect",
      onPress: onConnect,
      loading: busy,
    };
    footnote = "We only ask to read steps.";
  }

  const checking = state.kind === "checking";
  const showStatusCard = state.kind === "connect" || state.kind === "connected";
  const connected = state.kind === "connected";
  const statusText = connected ? "Connected" : "Not connected";

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to ${backLabel}`}
          onPress={onBack}
          style={styles.back}
        >
          <ChevronLeft color={theme.colors.brand} size={22} strokeWidth={2} />
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Steps
        </Text>
        <View style={styles.back} />
      </View>

      <View style={styles.content}>
        <View style={styles.tile}>
          <Footprints color={theme.colors.brand} size={36} strokeWidth={1.75} />
        </View>
        {checking ? (
          <View style={styles.checking} accessibilityLabel="Checking steps setup" accessibilityRole="progressbar">
            <ActivityIndicator color={theme.colors.brand} />
          </View>
        ) : (
          <>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>
          </>
        )}

        {showStatusCard ? (
          <View style={styles.card}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{store}</Text>
              <Text style={styles.cardSub}>{statusText}</Text>
            </View>
            <View
              style={[styles.pill, connected ? styles.pillOn : null]}
              accessibilityLabel={statusText}
            >
              {connected ? (
                <CircleCheck color={theme.colors.done} size={16} strokeWidth={2} />
              ) : (
                <CircleDashed color={theme.colors.ink2} size={16} strokeWidth={2} />
              )}
              <Text style={[styles.pillText, connected ? styles.pillTextOn : null]}>{statusText}</Text>
            </View>
          </View>
        ) : null}

        {state.kind === "connect" && state.denied ? (
          <Text style={styles.notice} accessibilityRole="alert">
            Steps access is off. Allow it in Health Connect to see steps on Today.
          </Text>
        ) : null}
        {notice ? (
          <Text style={styles.notice} accessibilityRole="alert">
            {notice}
          </Text>
        ) : null}
      </View>

      {footer ? (
        <View style={styles.footer}>
          <Button label={footer.label} onPress={footer.onPress} loading={footer.loading} />
          {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((t) => ({
  page: { backgroundColor: t.colors.bg, flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  back: { alignItems: "center", flexDirection: "row", minHeight: 44, minWidth: 80 },
  backText: { color: t.colors.brand, fontFamily: fontFamilySemiBold, fontSize: 17 },
  headerTitle: { color: t.colors.ink, fontFamily: fontFamilySemiBold, fontSize: 17 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 48 },
  tile: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 28,
    height: 88,
    justifyContent: "center",
    width: 88,
  },
  title: {
    color: t.colors.ink,
    fontFamily: fontFamilyBold,
    fontSize: 28,
    letterSpacing: -0.5,
    lineHeight: 34,
    marginTop: 28,
    textAlign: "center",
  },
  body: {
    color: t.colors.ink3,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    paddingHorizontal: 8,
    textAlign: "center",
  },
  card: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 32,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cardText: { flex: 1 },
  cardTitle: { color: t.colors.ink, fontFamily: fontFamilySemiBold, fontSize: 18 },
  cardSub: { color: t.colors.ink3, fontSize: 16, marginTop: 2 },
  pill: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderColor: t.colors.line2,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 12,
  },
  pillOn: { backgroundColor: t.colors.doneTint, borderColor: t.colors.doneTint },
  pillText: { color: t.colors.ink, fontSize: 14 },
  pillTextOn: { color: t.colors.done },
  checking: { alignItems: "center", marginTop: 40 },
  notice: { color: t.colors.ink2, fontSize: 14, lineHeight: 20, marginTop: 16, textAlign: "center" },
  footer: {
    backgroundColor: t.colors.card,
    borderTopColor: t.colors.line,
    borderTopWidth: 1,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  footnote: { color: t.colors.ink3, fontSize: 14, lineHeight: 20, marginTop: 12, textAlign: "center" },
}));

/** StepsSetupView in the system theme (Z12-49): its own styles read the scope. */
export function StepsSetupView(props: Parameters<typeof StepsSetupViewBody>[0]) {
  return (
    <ThemeScope scheme="system">
      <StepsSetupViewBody {...props} />
    </ThemeScope>
  );
}
