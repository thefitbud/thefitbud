import { useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { Check, ClipboardList, Copy, X } from "lucide-react-native";
import Constants from "expo-constants";
import { brand, ink, surface } from "@fitbud/tokens";
import { fontFamilyBold, fontFamilySemiBold, spacing } from "@fitbud/ui-mobile";
import { BottomSheet } from "../components/BottomSheet";
import { Text } from "../components/Text";
import { reportError } from "../lib/reportError";

/** Frame 56: "App version 1.4.0 • iPhone • More". */
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
 * Copies text. Web uses the browser clipboard. The app has no clipboard module
 * (adding one is native config, frozen in W10, D-W10-5), so on a phone this
 * hands the text to the system share sheet, which has Copy in it. Returns false
 * when nothing could be done, so the row never claims a copy that did not happen.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = (
      globalThis as {
        navigator?: { clipboard?: { writeText: (v: string) => Promise<void> } };
      }
    ).navigator?.clipboard;
    if (clipboard) {
      await clipboard.writeText(text);
      return true;
    }
    const result = await Share.share({ message: text });
    return result.action !== Share.dismissedAction;
  } catch (err) {
    reportError("trainer-help-copy", err);
    return false;
  }
}

/**
 * Opens the mail app with the support prefill. `canOpenURL` is not used: on iOS
 * it answers false for mailto unless the scheme is declared in native config,
 * which is frozen. A rejected open means no mail app, so the caller shows the
 * Help sheet.
 */
export async function openSupportMailOrFallback(
  mailto: string,
  onNoMailApp: () => void,
  open: (url: string) => Promise<unknown> = (url) => Linking.openURL(url),
): Promise<"opened" | "fallback"> {
  try {
    await open(mailto);
    return "opened";
  } catch {
    // Not an error to report: this is the expected no-mail-app answer.
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

export function HelpSheet({
  visible,
  onDismiss,
  supportEmail,
  screen,
  copy = copyText,
}: Props) {
  const [copied, setCopied] = useState<"address" | "details" | null>(null);
  const details = buildHelpDetails({
    version: Constants.expoConfig?.version ?? "0.0.0",
    device: deviceLabel(
      Platform.OS,
      Platform.OS === "ios" && (Platform as { isPad?: boolean }).isPad === true,
    ),
    screen,
  });

  async function run(kind: "address" | "details", text: string) {
    if (await copy(text)) setCopied(kind);
  }

  return (
    <BottomSheet visible={visible} headerless onDismiss={onDismiss}>
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
          onPress={onDismiss}
          style={styles.close}
        >
          <X color={ink[700]} size={18} strokeWidth={2} />
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
              <Check color={brand.indigo} size={20} strokeWidth={1.75} />
            ) : (
              <Copy color={brand.indigo} size={20} strokeWidth={1.75} />
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
              <Check color={brand.indigo} size={20} strokeWidth={1.75} />
            ) : (
              <ClipboardList
                color={brand.indigo}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  title: {
    color: brand.deepNavy,
    fontFamily: fontFamilyBold,
    fontSize: 26,
    letterSpacing: -0.3,
  },
  sub: { color: ink[500], fontSize: 17, marginTop: 4 },
  close: {
    alignItems: "center",
    backgroundColor: surface.pageMobile,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  body: { color: brand.deepNavy, fontSize: 18, lineHeight: 28 },
  group: {
    backgroundColor: surface.card,
    borderColor: ink[200],
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sep: { backgroundColor: ink[200], height: 1 },
  tile: {
    alignItems: "center",
    backgroundColor: brand.paleLavender,
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  rowLabel: {
    color: brand.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
  },
  rowHint: { color: ink[500], fontSize: 15 },
});
