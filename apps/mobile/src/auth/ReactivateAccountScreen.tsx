import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { CircleAlert, Info, UserRound } from "lucide-react-native";
import {
  accountDeletionCopy,
  accountReactivationCopy as copy,
  formatPurgeDate,
} from "@fitbud/core";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { Text } from "../components/Text";
import { ThemeScope, createThemedStyles, useTheme } from "../providers/ThemeProvider";

/** The phone's time zone: an archived account cannot read its own `/me`. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

type Props = {
  purgeAfter: string;
  /** Which note: the trainee one unless this phone was last used as a coach. */
  role: "trainee" | "trainer";
  busy: boolean;
  error: string | null;
  onReactivate: () => void;
  onSignOut: () => void;
  /** Tests pass a fixed zone; the app uses the phone's. */
  timeZone?: string;
};

/**
 * Z12-29: an archived account after sign-in (BP1-reactivate-account-ios.png on
 * v3 tokens, D-W12-6 copy). The frame's name and phone card is not shown: the
 * archived account reaches only `GET /account/status`, which has neither.
 * Coaching that ended with the deletion stays ended (D-W6-8).
 */
export function ReactivateAccountScreen(props: Props) {
  return (
    <ThemeScope scheme="system">
      <ReactivateBody {...props} />
    </ThemeScope>
  );
}

function ReactivateBody({
  purgeAfter,
  role,
  busy,
  error,
  onReactivate,
  onSignOut,
  timeZone = deviceTimeZone(),
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const date = formatPurgeDate(purgeAfter, timeZone);
  return (
    <SafeAreaView style={styles.page} testID="reactivate-account">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatar}>
          <UserRound color={theme.colors.brand} size={34} strokeWidth={2} />
        </View>
        <Text variant="largeTitle" style={styles.title} accessibilityRole="header">
          {copy.title}
        </Text>
        <Text style={styles.body}>{copy.body(date)}</Text>
        {error ? <ErrorBanner message={error} /> : null}
        <View style={styles.note}>
          <Info color={theme.colors.ink2} size={20} strokeWidth={2} />
          <Text style={styles.noteText}>
            {role === "trainer" ? copy.trainerNote : copy.traineeNote}
          </Text>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={copy.reactivate}
          loading={busy}
          disabled={busy}
          onPress={onReactivate}
          testID="reactivate-account-confirm"
        />
        <Button
          label={copy.signOut}
          variant="outline"
          disabled={busy}
          onPress={onSignOut}
          testID="reactivate-account-sign-out"
        />
        <Text tone="ink3" style={styles.footnote}>
          {copy.signOutNote}
        </Text>
      </View>
    </SafeAreaView>
  );
}

/**
 * After a deletion (Z12-29): the session has ended; this says the account is
 * archived and until when it can come back. OK goes to sign-in.
 */
export function AccountArchivedNotice({
  purgeAfter,
  onDone,
  timeZone,
}: {
  purgeAfter: string;
  onDone: () => void;
  timeZone?: string;
}) {
  return (
    <ThemeScope scheme="system">
      <ArchivedNoticeBody purgeAfter={purgeAfter} onDone={onDone} timeZone={timeZone} />
    </ThemeScope>
  );
}

function ArchivedNoticeBody({
  purgeAfter,
  onDone,
  timeZone = deviceTimeZone(),
}: {
  purgeAfter: string;
  onDone: () => void;
  timeZone?: string;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const date = formatPurgeDate(purgeAfter, timeZone);
  return (
    <SafeAreaView style={styles.page} testID="account-archived">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.avatar, styles.avatarCrit]}>
          <CircleAlert color={theme.colors.crit} size={34} strokeWidth={2} />
        </View>
        <Text style={styles.body} accessibilityRole="alert">
          {accountDeletionCopy.archived(date)}
        </Text>
      </ScrollView>
      <View style={styles.footer}>
        <Button label={accountDeletionCopy.archivedOk} onPress={onDone} testID="account-archived-ok" />
      </View>
    </SafeAreaView>
  );
}

export type ArchivedView =
  | ({ kind: "reactivate" } & Omit<Props, "timeZone">)
  | { kind: "notice"; purgeAfter: string; onDone: () => void };

/**
 * What AuthProvider shows over the app (Z12-29): the reactivate screen for a
 * signed-in archived account, or the notice after this phone deleted it.
 */
export function ArchivedAccountOverlay({ view }: { view: ArchivedView }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {view.kind === "reactivate" ? (
        <ReactivateAccountScreen
          purgeAfter={view.purgeAfter}
          role={view.role}
          busy={view.busy}
          error={view.error}
          onReactivate={view.onReactivate}
          onSignOut={view.onSignOut}
        />
      ) : (
        <AccountArchivedNotice purgeAfter={view.purgeAfter} onDone={view.onDone} />
      )}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  page: { backgroundColor: t.colors.bg, flex: 1 },
  content: {
    alignItems: "stretch",
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 96,
  },
  avatar: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 44,
    height: 88,
    justifyContent: "center",
    marginBottom: 22,
    width: 88,
  },
  avatarCrit: { backgroundColor: t.colors.critTint },
  title: { marginBottom: 12, textAlign: "center" },
  body: {
    color: t.colors.ink,
    fontSize: 17,
    lineHeight: 26,
    marginBottom: 20,
    textAlign: "center",
  },
  note: {
    alignItems: "flex-start",
    backgroundColor: t.colors.fill,
    borderColor: t.colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  noteText: { color: t.colors.ink2, flex: 1, fontSize: 15, lineHeight: 21 },
  footer: { gap: 10, paddingBottom: 18, paddingHorizontal: 18, paddingTop: 12 },
  footnote: { fontSize: 14, textAlign: "center" },
}));
