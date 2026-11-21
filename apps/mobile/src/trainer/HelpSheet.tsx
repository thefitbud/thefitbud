import { useState } from "react";
import { Linking,
  Platform,
  Pressable,
  View,
} from "react-native";
import { Bug,
  Check,
  ClipboardList,
  Copy,
  Mail,
  X,
} from "lucide-react-native";
import { setStringAsync } from "expo-clipboard";
import Constants from "expo-constants";
import { fontFamilyBold, fontFamilySemiBold, spacing } from "@fitbud/ui-mobile";
import { BottomSheet } from "../components/BottomSheet";
import { Text } from "../components/Text";
import { buildSupportMailto } from "../lib/support";
import { reportError } from "../lib/reportError";
import { ThemeScope,
  createThemedStyles,
  useTheme,
} from "../providers/ThemeProvider";

/** Frame 56 / TM-07e: "App version 1.4.0 • iPhone • More". */
export function buildHelpDetails(input: {
  version: string;
  device: string;
  screen: string;
}): string {
  return `App version ${input.version} • ${input.device} • ${input.screen}`;
}

export function deviceLabel(os: string, isPad = false): string {
  if (os === "ios") return isPad ? "iPad" : "iPhone";
  if (os === "android") return "Android";
  return "Web";
}

/**
 * Copies text with `expo-clipboard` (native and web). Returns false when the
 * copy failed, so the row never shows a tick for a copy that did not happen.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    return await setStringAsync(text);
  } catch (err) {
    reportError("trainer-help-copy", err);
    return false;
  }
}

/**
 * Opens the mail app with the support prefill. On iOS `canOpenURL` is reliable
 * because `mailto` is declared in LSApplicationQueriesSchemes (app.config.js);
 * a false answer means no mail app. Android has no `<queries>` entry for
 * mailto (needs a manifest plugin), so there `canOpenURL` can answer false for
 * an installed mail app: it is skipped and a rejected open is the signal.
 * Web goes straight to open.
 */
export async function openSupportMailOrFallback(
  mailto: string,
  onNoMailApp: () => void,
  open: (url: string) => Promise<unknown> = (url) => Linking.openURL(url),
  canOpen: (url: string) => Promise<boolean> = (url) => Linking.canOpenURL(url),
): Promise<"opened" | "fallback"> {
  try {
    if (Platform.OS === "ios" && !(await canOpen(mailto))) {
      onNoMailApp();
      return "fallback";
    }
    await open(mailto);
    return "opened";
  } catch (err) {
    // The expected no-mail-app answer: logged in dev only, never reported.
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      reportError("trainer-help-mailto", err);
    }
    onNoMailApp();
    return "fallback";
  }
}

type Props = {
  visible: boolean;
  onDismiss: () => void;
  supportEmail: string;
  /** Screen the person was on, shown in the copied details. */
  screen: string;
  /** Test seam; defaults to the real copy. */
  copy?: (text: string) => Promise<boolean>;
};

/**
 * TM-07e Help sheet: Email the FitBud team and Report a problem. Falls back to
 * the copy-address sheet when no mail app is available.
 */
export function HelpSheet(props: Props) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <HelpSheetBody {...props} />
    </ThemeScope>
  );
}

function HelpSheetBody({
  visible,
  onDismiss,
  supportEmail,
  screen,
  copy = copyText,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const [copied, setCopied] = useState<"address" | "details" | null>(null);
  const [noMail, setNoMail] = useState(false);
  const version = Constants.expoConfig?.version ?? "0.0.0";
  const details = buildHelpDetails({
    version,
    device: deviceLabel(
      Platform.OS,
      Platform.OS === "ios" && (Platform as { isPad?: boolean }).isPad === true,
    ),
    screen,
  });

  async function run(kind: "address" | "details", text: string) {
    if (await copy(text)) setCopied(kind);
  }

  async function emailTeam(extra?: string) {
    const mailto = buildSupportMailto({
      supportEmail,
      screenId: "TM-07e",
      role: "trainer",
      extra,
    });
    await openSupportMailOrFallback(mailto, () => setNoMail(true));
  }

  function close() {
    setNoMail(false);
    setCopied(null);
    onDismiss();
  }

  if (noMail) {
    return (
      <BottomSheet visible={visible} headerless onDismiss={close}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text style={styles.title} accessibilityRole="header">
              Email FitBud support
            </Text>
            <Text style={styles.sub}>No mail app is set up on this phone</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={close}
            style={styles.close}
          >
            <X color={theme.colors.ink2} size={18} strokeWidth={2} />
          </Pressable>
        </View>
        <Text style={styles.body}>
          Write to {supportEmail} from any email app. We'll get back to you within
          a day.
        </Text>
        <View style={styles.group}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Copy address, ${supportEmail}`}
            onPress={() => {
              void run("address", supportEmail);
            }}
            style={styles.row}
          >
            <View style={styles.tile}>
              {copied === "address" ? (
                <Check color={theme.colors.brand} size={20} strokeWidth={1.75} />
              ) : (
                <Copy color={theme.colors.brand} size={20} strokeWidth={1.75} />
              )}
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowLabel}>Copy address</Text>
              <Text style={styles.rowHint}>{supportEmail}</Text>
            </View>
          </Pressable>
          <View style={styles.sep} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Copy details, ${details}`}
            onPress={() => {
              void run("details", details);
            }}
            style={styles.row}
          >
            <View style={styles.tile}>
              {copied === "details" ? (
                <Check color={theme.colors.brand} size={20} strokeWidth={1.75} />
              ) : (
                <ClipboardList
                  color={theme.colors.brand}
                  size={20}
                  strokeWidth={1.75}
                />
              )}
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowLabel}>Copy details</Text>
              <Text style={styles.rowHint}>{details}</Text>
            </View>
          </Pressable>
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} headerless onDismiss={close}>
      <View style={styles.handle} accessibilityElementsHidden />
      <Text style={styles.title} accessibilityRole="header">
        Help
      </Text>
      <Text style={styles.sub}>We reply within a working day.</Text>
      <View style={[styles.group, styles.menuGroup]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Email the FitBud team, ${supportEmail}`}
          onPress={() => {
            void emailTeam();
          }}
          style={styles.row}
        >
          <View style={styles.tile}>
            <Mail color={theme.colors.brand} size={20} strokeWidth={1.75} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.rowLabel}>Email the FitBud team</Text>
            <Text style={styles.rowHint}>{supportEmail}</Text>
          </View>
        </Pressable>
        <View style={styles.sep} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Report a problem, Adds app version and device"
          onPress={() => {
            void emailTeam(`Details: ${details}`);
          }}
          style={styles.row}
        >
          <View style={styles.tile}>
            <Bug color={theme.colors.brand} size={20} strokeWidth={1.75} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.rowLabel}>Report a problem</Text>
            <Text style={styles.rowHint}>Adds app version and device</Text>
          </View>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={close}
        style={styles.closeBtn}
      >
        <Text style={styles.closeBtnText}>Close</Text>
      </Pressable>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((t) => ({
  flex: { flex: 1 },
  handle: {
    alignSelf: "center",
    backgroundColor: t.colors.line,
    borderRadius: 2,
    height: 4,
    marginBottom: 12,
    width: 36,
  },
  head: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  title: {
    color: t.colors.ink,
    fontFamily: fontFamilyBold,
    fontSize: 26,
    letterSpacing: -0.3,
  },
  sub: { color: t.colors.ink3, fontSize: 17, marginTop: 4 },
  close: {
    alignItems: "center",
    backgroundColor: t.colors.bg,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  body: { color: t.colors.ink, fontSize: 18, lineHeight: 28 },
  group: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  menuGroup: { marginTop: 20 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sep: { backgroundColor: t.colors.line, height: 1 },
  tile: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  rowLabel: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
  },
  rowHint: { color: t.colors.ink3, fontSize: 15 },
  closeBtn: {
    alignItems: "center",
    backgroundColor: t.colors.bg,
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 52,
  },
  closeBtnText: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
}));
