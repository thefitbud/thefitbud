import { useRef, type ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { ChevronRight, MessageCircle, NotebookPen, User } from "lucide-react-native";
import { BottomSheet } from "../../components/BottomSheet";
import { Text } from "../../components/Text";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";
import { firstNameOf } from "./exceptionSheetContent";

type Props = {
  visible: boolean;
  traineeDisplayName: string;
  onAddNote: () => void;
  /** A wa.me redirect the trainer sends from WhatsApp; never a send from FitBud. */
  onMessageOnWhatsApp: () => void;
  onOpenProfile: () => void;
  onDismiss: () => void;
};

/**
 * TM-04j: the review's ⋯ menu. Add note, Message on WhatsApp (a wa.me chat
 * with no template) and the client's profile, then Cancel. Choosing a row
 * closes the menu (`onDismiss`) and then calls that row's handler, so the
 * parent only opens what comes next.
 *
 * Uses BottomSheet (same as Note/Nudge/Resolve) so Android presents the menu
 * reliably — a bare Modal left Maestro able to tap ··· while nothing opened
 * (device run 44908820584).
 */
export function MoreSheet(props: Props) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <MoreSheetBody {...props} />
    </ThemeScope>
  );
}

function MoreSheetBody({
  visible,
  traineeDisplayName,
  onAddNote,
  onMessageOnWhatsApp,
  onOpenProfile,
  onDismiss,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const first = firstNameOf(traineeDisplayName);
  const icon = (node: (color: string) => ReactNode) => node(theme.colors.ink);
  // iOS cannot present the next sheet while this one is still leaving, so the
  // chosen action runs from BottomSheet's onClosed there; elsewhere at once.
  const pending = useRef<(() => void) | null>(null);
  const choose = (action: () => void) => {
    onDismiss();
    if (Platform.OS !== "ios") {
      action();
      return;
    }
    pending.current = action;
    setTimeout(() => {
      if (pending.current !== action) return;
      pending.current = null;
      action();
    }, 600);
  };
  return (
    <BottomSheet
      visible={visible}
      headerless
      onDismiss={onDismiss}
      onClosed={() => {
        const next = pending.current;
        pending.current = null;
        next?.();
      }}
    >
      <View testID="more-sheet" style={styles.group}>
        <MenuRow
          title="Add note"
          subtitle={
            first
              ? `Private, or shared on ${first}'s Today`
              : "Private, or shared on their Today"
          }
          icon={icon((c) => (
            <NotebookPen size={22} color={c} strokeWidth={1.75} />
          ))}
          onPress={() => choose(onAddNote)}
          testID="more-add-note"
        />
        <MenuRow
          title="Message on WhatsApp"
          subtitle="Opens a chat without a template"
          icon={icon((c) => (
            <MessageCircle size={22} color={c} strokeWidth={1.75} />
          ))}
          onPress={() => choose(onMessageOnWhatsApp)}
          divider
          testID="more-whatsapp"
        />
        <MenuRow
          title={first ? `Open ${first}'s profile` : "Open profile"}
          icon={icon((c) => <User size={22} color={c} strokeWidth={1.75} />)}
          onPress={() => choose(onOpenProfile)}
          divider
          testID="more-profile"
        />
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onDismiss}
        style={styles.cancel}
        testID="more-cancel"
      >
        <Text variant="bodyStrong">Cancel</Text>
      </Pressable>
    </BottomSheet>
  );
}

function MenuRow({
  title,
  subtitle,
  icon,
  onPress,
  divider = false,
  testID,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  onPress: () => void;
  divider?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={styles.row}
      testID={testID}
    >
      <View style={styles.iconTile}>{icon}</View>
      <View style={[styles.rowBody, divider ? styles.rowDivider : null]}>
        <View style={styles.rowText}>
          <Text variant="body">{title}</Text>
          {subtitle ? <Text variant="subhead">{subtitle}</Text> : null}
        </View>
        <ChevronRight size={18} color={theme.colors.ink4} />
      </View>
    </Pressable>
  );
}

const useStyles = createThemedStyles((t) => ({
  group: {
    backgroundColor: t.colors.bg,
    borderRadius: t.radii.group,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: t.spacing.md,
    minHeight: 64,
    paddingLeft: t.spacing.md,
  },
  iconTile: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 10,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  rowBody: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    flexDirection: "row",
    gap: t.spacing.sm,
    paddingRight: t.spacing.md,
    paddingVertical: t.spacing.md,
  },
  rowDivider: { borderTopColor: t.colors.line, borderTopWidth: 1 },
  rowText: { flex: 1, gap: 2 },
  cancel: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.button,
    justifyContent: "center",
    minHeight: 56,
    marginTop: t.spacing.md,
  },
}));
