import { Children, type ReactNode } from "react";
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { spacing } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { androidTopInset } from "../../screens/auth/authParts";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";

/**
 * Settings building blocks (originally the m2 kit), on v3 tokens since Z12-49.
 * Every colour comes from the theme, so a screen inside `M2Page` (which opts
 * its subtree in to the system theme) renders light or dark (D-W12-12). Used
 * outside an opted-in scope (trainer More), they render v3 light.
 */

export function M2Title({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.titleBlock}>
      <Text variant="largeTitle" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" tone="ink2" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Small caps section label above a group (kit `.sec`), e.g. "SETTINGS". */
export function M2Section({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <Text style={styles.section} accessibilityRole="header">
      {label.toUpperCase()}
    </Text>
  );
}

export function M2Card({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.card}>{children}</View>;
}

/** Card of rows with a hairline between them, inset past the icon (kit `.li + .li`). */
export function M2Group({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <M2Card>
      {items.map((child, index) => (
        <View key={index}>
          {index > 0 ? <View style={styles.sep} /> : null}
          {child}
        </View>
      ))}
    </M2Card>
  );
}

export function M2Row({
  icon,
  label,
  hint,
  value,
  onPress,
  tile = "indigo",
  labelColor,
  showChevron = true,
  trailing,
  accessibilityLabel,
  testID,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  value?: string;
  onPress?: () => void;
  /** `indigo` and `neutral` are the kit's neutral fill tile; `done` a green one (Steps); `critical` crit tint. */
  tile?: "indigo" | "neutral" | "critical" | "done" | "info";
  labelColor?: string;
  showChevron?: boolean;
  trailing?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const body = (
    <>
      {icon ? (
        <View
          style={[
            styles.tile,
            tile === "critical" ? styles.tileCritical : null,
            tile === "done" ? styles.tileDone : null,
            tile === "info" ? styles.tileInfo : null,
          ]}
        >
          {icon}
        </View>
      ) : null}
      <View style={styles.tx}>
        <Text style={[styles.label, labelColor ? { color: labelColor } : null]}>
          {label}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {value ? <Text style={styles.val}>{value}</Text> : null}
      {trailing}
      {showChevron && onPress ? (
        <ChevronRight color={theme.colors.ink4} size={20} strokeWidth={2} />
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={styles.row}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

export function M2SwitchRow({
  icon,
  label,
  hint,
  value,
  disabled,
  onValueChange,
  onPressText,
  textAccessibilityLabel,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
  /** The label and hint open a detail (a time, meal times); the switch stays a switch. */
  onPressText?: () => void;
  textAccessibilityLabel?: string;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const text = (
    <>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </>
  );
  return (
    <View style={[styles.row, disabled ? styles.dim : null]}>
      {icon ? <View style={styles.tile}>{icon}</View> : null}
      {onPressText ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textAccessibilityLabel ?? (hint ? `${label}. ${hint}` : label)}
          onPress={onPressText}
          style={styles.tx}
        >
          {text}
        </Pressable>
      ) : (
        <View style={styles.tx}>{text}</View>
      )}
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.fill2, true: theme.colors.done }}
        thumbColor={theme.colors.white}
        ios_backgroundColor={theme.colors.fill2}
      />
    </View>
  );
}

/** Indented row under a parent switch. */
export function M2SubRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.row, styles.subRow]}
    >
      <View style={styles.tx}>
        <Text style={styles.subLabel}>{label}</Text>
      </View>
      {value ? <Text style={styles.val}>{value}</Text> : null}
      {onPress ? (
        <ChevronRight color={theme.colors.ink4} size={20} strokeWidth={2} />
      ) : null}
    </Pressable>
  );
}

/** Preset row (`.radc`). */
export function M2Radio({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      onPress={onPress}
      style={[styles.radio, selected ? styles.radioOn : null]}
    >
      <View style={[styles.radioDot, selected ? styles.radioDotOn : null]} />
      <View style={styles.tx}>
        <Text style={[styles.radioLabel, selected ? styles.radioLabelOn : null]}>
          {label}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Circular − / +. */
export function M2Stepper({
  value,
  lessLabel,
  moreLabel,
  onDecrement,
  onIncrement,
}: {
  value: string;
  lessLabel: string;
  moreLabel: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.rstp}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={lessLabel}
        onPress={onDecrement}
        style={styles.rstpBtn}
      >
        <Text style={styles.rstpGlyph}>−</Text>
      </Pressable>
      <Text style={styles.rstpValue}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={moreLabel}
        onPress={onIncrement}
        style={styles.rstpBtn}
      >
        <Text style={styles.rstpGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

/** Every day / Weekdays / Weekends (`.segc`). */
export function M2Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.seg}>
      {options.map((option) => {
        const on = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.id)}
            style={[styles.segItem, on ? styles.segOn : null]}
          >
            <Text style={[styles.segText, on ? styles.segTextOn : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function M2Hero({
  icon,
  title,
  subtitle,
  tone = "ok",
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  tone?: "ok" | "wait";
}) {
  const styles = useStyles();
  return (
    <View style={styles.hero}>
      <View style={[styles.heroTile, tone === "wait" ? styles.heroTileWait : null]}>
        {icon}
      </View>
      <View style={styles.tx}>
        <Text style={styles.heroTitle}>{title}</Text>
        {subtitle ? <Text style={styles.hint}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function M2Note({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.note}>
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

export function M2Button({
  label,
  onPress,
  disabled,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const styles = useStyles();
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.btn,
        primary ? styles.btnPrimary : styles.btnSecondary,
        disabled ? styles.dim : null,
      ]}
    >
      <Text style={[styles.btnText, primary ? styles.btnTextPrimary : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A settings page: v3 nav bar (back chevron and a centred title, kit `.nav`),
 * an optional lead line, then the content. Opts its subtree in to the system
 * theme (Z12-49).
 */
export function M2Page(props: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
  /** Edit sheets (TR-20b, TR-20g): "Cancel" left and a "Save" action right, instead of Back. */
  onCancel?: () => void;
  onSave?: () => void;
  saveDisabled?: boolean;
  saving?: boolean;
  /** The kit's white page (edit sheets) instead of the grey canvas. */
  plain?: boolean;
}) {
  return (
    <ThemeScope scheme="system">
      <M2PageBody {...props} />
    </ThemeScope>
  );
}

function M2PageBody({
  title,
  subtitle,
  onBack,
  children,
  footer,
  refreshing,
  onRefresh,
  testID,
  onCancel,
  onSave,
  saveDisabled = false,
  saving = false,
  plain = false,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
  /** Edit sheets (TR-20b, TR-20g): "Cancel" left and a "Save" action right, instead of Back. */
  onCancel?: () => void;
  onSave?: () => void;
  saveDisabled?: boolean;
  saving?: boolean;
  /** The kit's white page (edit sheets) instead of the grey canvas. */
  plain?: boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <SafeAreaView style={[styles.page, plain ? styles.pagePlain : null]} testID={testID}>
      <View style={styles.nav}>
        {onCancel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onCancel}
            style={styles.navAction}
          >
            <Text style={styles.navActionText}>Cancel</Text>
          </Pressable>
        ) : onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={styles.back}
          >
            <ChevronLeft color={theme.colors.ink} size={26} strokeWidth={2.25} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <Text style={styles.navTitle} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {onSave ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save"
            accessibilityState={{ disabled: saveDisabled || saving, busy: saving }}
            disabled={saveDisabled || saving}
            onPress={onSave}
            style={[styles.navAction, styles.navActionRight]}
          >
            <Text
              style={[
                styles.navActionText,
                styles.navSave,
                saveDisabled || saving ? styles.navSaveOff : null,
              ]}
            >
              {saving ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        ) : onCancel ? (
          <View style={styles.navAction} />
        ) : (
          <View style={styles.back} />
        )}
      </View>
      <ScrollView
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing ?? false}
              onRefresh={onRefresh}
              tintColor={theme.colors.ink3}
            />
          ) : undefined
        }
      >
        {subtitle ? (
          <Text variant="body" tone="ink2" style={styles.lead}>
            {subtitle}
          </Text>
        ) : null}
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((t) => ({
  titleBlock: {
    paddingBottom: 14,
    paddingHorizontal: 4,
  },
  subtitle: {
    lineHeight: 21,
    marginTop: 4,
  },
  section: {
    color: t.colors.ink3,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: -4,
    marginLeft: 8,
    marginTop: 12,
  },
  card: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.edge,
    borderRadius: 20,
    borderWidth: t.scheme === "dark" ? 1 : StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  sep: {
    backgroundColor: t.colors.line,
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tile: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  tileCritical: { backgroundColor: t.colors.critTint },
  tileDone: { backgroundColor: t.colors.doneTint },
  tileInfo: { backgroundColor: t.colors.infoTint },
  tx: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    color: t.colors.ink,
    fontSize: 17,
    lineHeight: 22,
  },
  hint: {
    color: t.colors.ink2,
    fontSize: 15,
    lineHeight: 20,
    marginTop: 1,
  },
  val: {
    color: t.colors.ink3,
    fontSize: 15,
  },
  subRow: {
    paddingLeft: 66,
  },
  subLabel: {
    color: t.colors.ink2,
    fontSize: 15,
    lineHeight: 20,
  },
  radio: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
  },
  radioOn: {
    backgroundColor: t.colors.brandTint,
    borderColor: t.colors.brand,
  },
  radioDot: {
    borderColor: t.colors.ink4,
    borderRadius: 11,
    borderWidth: 2,
    height: 22,
    width: 22,
  },
  radioDotOn: {
    borderColor: t.colors.brand,
    borderWidth: 6,
  },
  radioLabel: {
    color: t.colors.ink2,
    fontSize: 16,
    fontWeight: "600",
  },
  radioLabelOn: {
    color: t.colors.ink,
  },
  rstp: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  rstpBtn: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 26,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  rstpGlyph: {
    color: t.colors.brandInk,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 28,
  },
  rstpValue: {
    color: t.colors.ink,
    flex: 1,
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
  },
  seg: {
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flexDirection: "row",
    padding: 2,
  },
  segItem: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    height: 44,
    justifyContent: "center",
  },
  segOn: {
    backgroundColor: t.colors.card,
  },
  segText: {
    color: t.colors.ink3,
    fontSize: 14,
    fontWeight: "600",
  },
  segTextOn: {
    color: t.colors.ink,
  },
  hero: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.edge,
    borderRadius: 20,
    borderWidth: t.scheme === "dark" ? 1 : StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  heroTile: {
    alignItems: "center",
    backgroundColor: t.colors.doneTint,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  heroTileWait: {
    backgroundColor: t.colors.fill,
  },
  heroTitle: {
    color: t.colors.ink,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
  },
  dim: {
    opacity: 0.45,
  },
  note: {
    backgroundColor: t.colors.infoTint,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noteText: {
    color: t.colors.infoInk,
    fontSize: 14,
    lineHeight: 20,
  },
  btn: {
    alignItems: "center",
    borderRadius: 16,
    minHeight: 52,
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: t.colors.brand,
  },
  btnSecondary: {
    backgroundColor: t.colors.fill,
  },
  btnText: {
    color: t.colors.ink,
    fontSize: 17,
    fontWeight: "600",
  },
  btnTextPrimary: {
    color: t.colors.onBrand,
  },
  page: {
    backgroundColor: t.colors.bg,
    flex: 1,
    paddingTop: androidTopInset,
  },
  pagePlain: { backgroundColor: t.colors.bgPlain },
  navAction: { justifyContent: "center", minHeight: 44, minWidth: 72, paddingHorizontal: 8 },
  navActionRight: { alignItems: "flex-end" },
  navActionText: { color: t.colors.ink, fontSize: 18 },
  navSave: { fontWeight: "600" },
  navSaveOff: { color: t.colors.ink4 },
  nav: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 52,
    paddingHorizontal: 8,
  },
  navTitle: {
    color: t.colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  back: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  lead: {
    lineHeight: 22,
    paddingHorizontal: 4,
  },
  pageContent: {
    gap: 12,
    paddingBottom: 32,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  footer: {
    paddingBottom: 16,
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
  },
}));

export const m2Gap = spacing.md;
export const m2Gutter = spacing.lg;
