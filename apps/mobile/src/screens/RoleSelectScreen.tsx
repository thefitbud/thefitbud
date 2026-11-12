import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Check, Dumbbell, Users } from "lucide-react-native";
import type { Role } from "@fitbud/contracts";
import {
  colors,
  fontFamilySemiBold,
  radii,
  spacing,
} from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { Text } from "../components/Text";
import { mobilePermittedRoles } from "../navigation/resolveRoute";

type PickableRole = Extract<Role, "trainer" | "trainee">;

const OPTIONS: ReadonlyArray<{
  role: PickableRole;
  title: string;
  hint: string;
}> = [
  { role: "trainer", title: "Coach", hint: "Manage your clients" },
  { role: "trainee", title: "Client", hint: "Follow your plan" },
];

function firstName(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/** Frame 59: pick a role, optionally remembered for the next launch. */
export function RoleSelectScreen() {
  const { me, selectRole, selectedRole, rememberRole } = useAuth();
  const roles = me ? mobilePermittedRoles(me.permittedRoles) : [];
  const options = OPTIONS.filter((option) => roles.includes(option.role));
  // Opened from More (Z11-14): start on the role in use.
  const current = options.find((option) => option.role === selectedRole);
  const [choice, setChoice] = useState<PickableRole>(
    current?.role ?? options[0]?.role ?? "trainer",
  );
  const [remember, setRemember] = useState(rememberRole !== false);
  const [busy, setBusy] = useState(false);
  const name = firstName(me?.trainerProfile?.displayName);

  async function onContinue() {
    setBusy(true);
    try {
      await selectRole(choice, { remember });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="How do you want to use FitBud?"
      subtitle={`${name ? `${name}, your` : "Your"} account has both. You can switch later in More.`}
      brandDisplay="mark"
      footer={
        <PrimaryButton
          label="Continue"
          loading={busy}
          onPress={() => {
            void onContinue();
          }}
        />
      }
    >
      <View style={styles.options} accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = option.role === choice;
          const Icon = option.role === "trainer" ? Users : Dumbbell;
          return (
            <Pressable
              key={option.role}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
              accessibilityLabel={`${option.title}. ${option.hint}`}
              onPress={() => setChoice(option.role)}
              style={[styles.option, selected ? styles.optionSelected : null]}
            >
              <View style={styles.iconWrap}>
                <Icon size={24} color={colors.darkGrey} />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionHint}>{option.hint}</Text>
              </View>
              <View style={[styles.radio, selected ? styles.radioOn : null]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: remember }}
        // react-native-web reads aria-checked, not accessibilityState.checked.
        aria-checked={remember}
        accessibilityLabel="Remember my choice"
        onPress={() => setRemember((value) => !value)}
        style={styles.remember}
      >
        {/* Off: this session keeps the role; the next launch asks again. */}
        <View style={[styles.box, remember ? styles.boxOn : null]}>
          {remember ? <Check size={16} color={colors.white} /> : null}
        </View>
        <Text style={styles.rememberLabel}>Remember my choice</Text>
      </Pressable>
    </Screen>
  );
}

type SwitchRoleSheetProps = {
  visible: boolean;
  /** Frame 61 shows the coach case only. */
  targetRole: "trainer";
  /** What the link opens, e.g. "Rohan Mehta's check-in". */
  subject: string;
  onCancel: () => void;
  onSwitch: () => void;
};

/**
 * Frame 61: asks before a link that needs the other role switches the view.
 * AppRouter shows it for a coach link opened in trainee mode (Z11-14).
 */
export function SwitchRoleSheet({
  visible,
  targetRole,
  subject,
  onCancel,
  onSwitch,
}: SwitchRoleSheetProps) {
  void targetRole;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View
          style={styles.dialog}
          accessibilityRole="alert"
          accessibilityViewIsModal
        >
          <Text style={styles.dialogTitle}>
            Switch to coach view to open this?
          </Text>
          <Text style={styles.dialogBody}>
            {`This link is for ${subject}, which you review as a coach.`}
          </Text>
          <View style={styles.dialogActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onCancel}
              style={[styles.dialogButton, styles.dialogDivider]}
            >
              <Text style={styles.dialogButtonLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Switch"
              onPress={onSwitch}
              style={styles.dialogButton}
            >
              <Text style={styles.dialogButtonLabel}>Switch</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  options: { gap: spacing.md, marginTop: spacing.lg },
  option: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 88,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.lightGrey,
    backgroundColor: colors.white,
    gap: spacing.lg,
  },
  optionSelected: {
    borderColor: colors.indigo,
    borderWidth: 2,
    backgroundColor: colors.background,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: { flex: 1, gap: 2 },
  optionTitle: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
  },
  optionHint: { color: colors.midGrey, fontSize: 15 },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.lightGrey,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.indigo, backgroundColor: colors.indigo },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.white,
  },
  remember: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.lightGrey,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { borderColor: colors.indigo, backgroundColor: colors.indigo },
  rememberLabel: { color: colors.deepNavy, fontSize: 16 },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(20, 16, 50, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  dialog: {
    width: "100%",
    maxWidth: 300,
    borderRadius: 14,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  dialogTitle: {
    color: colors.nearBlack,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  dialogBody: {
    color: colors.darkGrey,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    padding: spacing.lg,
    paddingTop: spacing.xs,
  },
  dialogActions: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lightGrey,
  },
  dialogButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogDivider: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.lightGrey,
  },
  dialogButtonLabel: { color: colors.indigo, fontSize: 17 },
});
