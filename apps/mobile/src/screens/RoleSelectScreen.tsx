import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Check, Dumbbell, Users } from "lucide-react-native";
import type { Role } from "@fitbud/contracts";
import { formatPersonName } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/Button";
import { Text } from "../components/Text";
import { mobilePermittedRoles } from "../navigation/resolveRoute";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../providers/ThemeProvider";
import { AuthPage } from "./auth/authParts";

type PickableRole = Extract<Role, "trainer" | "trainee">;

function firstName(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/**
 * TM-08a: pick a role, optionally remembered for the next launch. Opened from
 * More (a role already in use) it has Back, which keeps that role; on first
 * run it has none (Z12-49).
 */
export function RoleSelectScreen() {
  const {
    me,
    relationships,
    selectRole,
    selectedRole,
    rememberRole,
    canLeaveRoleSelect,
    leaveRoleSelect,
  } = useAuth();
  const roles = me ? mobilePermittedRoles(me.permittedRoles) : [];
  const coachFirst = firstName(
    relationships.find((row) => row.status !== "ended")?.trainerDisplayName,
  );
  const options: ReadonlyArray<{ role: PickableRole; title: string; hint: string }> = [
    { role: "trainer" as const, title: "Coach", hint: "Manage your clients" },
    {
      role: "trainee" as const,
      title: "Client",
      hint: coachFirst ? `Follow your plan from ${formatPersonName(coachFirst)}` : "Follow your plan",
    },
  ].filter((option) => roles.includes(option.role));
  // Opened from More (Z11-14): start on the role in use.
  const current = options.find((option) => option.role === selectedRole);
  const [choice, setChoice] = useState<PickableRole>(
    current?.role ?? options[0]?.role ?? "trainer",
  );
  const [remember, setRemember] = useState(rememberRole !== false);
  const [busy, setBusy] = useState(false);
  const name = firstName(me?.trainerProfile?.displayName);
  const styles = useStyles();
  const theme = useTheme();

  async function onContinue() {
    setBusy(true);
    try {
      await selectRole(choice, { remember });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage
      onBack={canLeaveRoleSelect ? leaveRoleSelect : undefined}
      title="How do you want to use FitBud?"
      subtitle={`${name ? `${name}, your` : "Your"} account is a coach and a client. You can switch any time in More.`}
      footer={
        <Button
          label={choice === "trainer" ? "Continue as coach" : "Continue as client"}
          loading={busy}
          onPress={() => {
            void onContinue();
          }}
        />
      }
      testID="role-select"
    >
      <View style={styles.options} accessibilityRole="radiogroup">
        {options.map((option) => (
          <RoleCard
            key={option.role}
            role={option.role}
            title={option.title}
            hint={option.hint}
            selected={option.role === choice}
            onPress={() => setChoice(option.role)}
          />
        ))}
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
          {remember ? <Check size={16} color={theme.colors.onBrand} strokeWidth={3} /> : null}
        </View>
        <Text variant="body">Remember my choice</Text>
      </Pressable>
    </AuthPage>
  );
}

/** A role option: icon tile, title and hint, and a radio check (TM-08a, TM-08c). */
function RoleCard({
  role,
  title,
  hint,
  selected,
  onPress,
}: {
  role: PickableRole;
  title: string;
  hint: string;
  selected: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const Icon = role === "trainer" ? Users : Dumbbell;
  const body = (
    <>
      <View style={[styles.tile, role === "trainee" ? styles.tileClient : styles.tileCoach]}>
        <Icon
          size={26}
          color={role === "trainee" ? theme.colors.done : theme.colors.ink}
          strokeWidth={1.9}
        />
      </View>
      <View style={styles.optionText}>
        <Text variant="headline" style={styles.optionTitle}>
          {title}
        </Text>
        <Text tone="ink2" style={styles.optionHint}>
          {hint}
        </Text>
      </View>
      <View style={[styles.radio, selected ? styles.radioOn : null]}>
        {selected ? <Check size={16} color={theme.colors.onBrand} strokeWidth={3} /> : null}
      </View>
    </>
  );
  if (!onPress) {
    return <View style={[styles.option, selected ? styles.optionSelected : null]}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={`${title}. ${hint}`}
      onPress={onPress}
      style={[styles.option, selected ? styles.optionSelected : null]}
    >
      {body}
    </Pressable>
  );
}

type SwitchRoleSheetProps = {
  visible: boolean;
  /** The view the switch opens. */
  targetRole: PickableRole;
  /**
   * Frame 61 / a coach push: what the link opens, e.g. "a client's check-in".
   * Omitted for a plain switch from More.
   */
  subject?: string;
  /** Card hint, e.g. "Karan Malhotra · plan by Priya" (TM-08c). */
  cardHint?: string;
  onCancel: () => void;
  onSwitch: () => void;
  busy?: boolean;
};

/**
 * TM-08c: a bottom sheet that asks before switching the view. Used for a coach
 * link or a coach push opened in trainee mode (frame 61, Z12-49), and for
 * "Switch to coach view" in trainee More (TM-08d).
 */
export function SwitchRoleSheet({
  visible,
  targetRole,
  subject,
  cardHint,
  onCancel,
  onSwitch,
  busy = false,
}: SwitchRoleSheetProps) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onCancel}>
      <ThemeScope scheme="system" drivesSystemBars={false}>
        <SwitchRoleSheetBody
          targetRole={targetRole}
          subject={subject}
          cardHint={cardHint}
          onCancel={onCancel}
          onSwitch={onSwitch}
          busy={busy}
        />
      </ThemeScope>
    </Modal>
  );
}

function SwitchRoleSheetBody({
  targetRole,
  subject,
  cardHint,
  onCancel,
  onSwitch,
  busy,
}: Omit<SwitchRoleSheetProps, "visible">) {
  const styles = useStyles();
  const coach = targetRole === "trainer";
  const title = subject
    ? "Switch to coach view to open this?"
    : coach
      ? "Switch to coach view?"
      : "Switch to client view?";
  const body = subject
    ? `This is for ${subject}, which you review as a coach.`
    : coach
      ? "You'll see your clients. Your own plan stays as it is."
      : "You'll see your own plan. Coach notifications keep coming.";
  return (
    <View style={styles.scrimWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss sheet"
        style={styles.scrim}
        onPress={onCancel}
      />
      <View style={styles.sheet} accessibilityViewIsModal testID="switch-role-sheet">
        <View style={styles.handle} accessibilityElementsHidden />
        <Text variant="title" style={styles.sheetTitle} accessibilityRole="header">
          {title}
        </Text>
        <Text variant="body" tone="ink2" style={styles.sheetBody}>
          {body}
        </Text>
        <RoleCard
          role={targetRole}
          title={coach ? "Coach" : "Client"}
          hint={cardHint ?? (coach ? "Manage your clients" : "Follow your plan")}
          selected
        />
        <View style={styles.sheetActions}>
          <Button
            label={coach ? "Switch to coach" : "Switch to client"}
            loading={busy}
            onPress={onSwitch}
          />
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  options: { gap: 14, marginTop: t.spacing.sm },
  option: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 18,
    minHeight: 104,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  optionSelected: { borderColor: t.colors.brand, borderWidth: 2, paddingHorizontal: 19 },
  tile: {
    alignItems: "center",
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  tileCoach: { backgroundColor: t.colors.brandTint },
  tileClient: { backgroundColor: t.colors.doneTint },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 20 },
  optionHint: { fontSize: 16, lineHeight: 21 },
  radio: {
    alignItems: "center",
    borderColor: t.colors.ink4,
    borderRadius: 14,
    borderWidth: 1.5,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  radioOn: { backgroundColor: t.colors.brand, borderColor: t.colors.brand },
  remember: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    marginTop: t.spacing.xl,
    minHeight: 44,
  },
  box: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.ink4,
    borderRadius: 7,
    borderWidth: 1.5,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  boxOn: { backgroundColor: t.colors.brand, borderColor: t.colors.brand },
  scrimWrap: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...absoluteFill, backgroundColor: t.colors.scrim },
  sheet: {
    backgroundColor: t.colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 34,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: t.colors.line2,
    borderRadius: 3,
    height: 5,
    marginBottom: t.spacing.lg,
    width: 36,
  },
  sheetTitle: { fontSize: 24, marginBottom: 6 },
  sheetBody: { lineHeight: 22, marginBottom: t.spacing.lg },
  sheetActions: { gap: 10, marginTop: t.spacing.lg },
}));

const absoluteFill = {
  position: "absolute" as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};
