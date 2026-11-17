import { useRef, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { ChevronLeft, CircleAlert, Clock, Dumbbell, Eye, EyeOff } from "lucide-react-native";
import { defaultTextStyle } from "@fitbud/ui-mobile";
import { Button } from "../../components/Button";
import { Text } from "../../components/Text";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";

/**
 * Shared v3 pieces for the sign-in, onboarding and system screens (TR-01*,
 * TR-02*, TR-21, TR-24, TM-08*). They read every colour from the theme, so the
 * screens built from them follow the system light or dark setting (D-W12-12).
 * Screen-level only: the frozen primitives (D-W12-29) are reused, not changed.
 */

type PageProps = {
  /** Back chevron (kit `.nav` back); omitted on a first screen. */
  onBack?: () => void;
  backLabel?: string;
  /** FitBud mark and word above the title (TR-01a). */
  brand?: boolean;
  title?: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Pinned to the bottom of the page (a primary action, or legal links). */
  footer?: ReactNode;
  testID?: string;
};

/** A v3 page that follows the system theme: optional back, large title, lead. */
export function AuthPage({
  onBack,
  backLabel = "Back",
  brand = false,
  title,
  subtitle,
  children,
  footer,
  testID,
}: PageProps) {
  return (
    <ThemeScope scheme="system">
      <AuthPageBody
        onBack={onBack}
        backLabel={backLabel}
        brand={brand}
        title={title}
        subtitle={subtitle}
        footer={footer}
        testID={testID}
      >
        {children}
      </AuthPageBody>
    </ThemeScope>
  );
}

function AuthPageBody({
  onBack,
  backLabel,
  brand,
  title,
  subtitle,
  children,
  footer,
  testID,
}: PageProps) {
  const styles = usePageStyles();
  const theme = useTheme();
  return (
    <SafeAreaView style={styles.safe} testID={testID}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View role="main" style={styles.main}>
            {onBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={backLabel}
                onPress={onBack}
                style={styles.back}
                hitSlop={8}
              >
                <ChevronLeft color={theme.colors.ink} size={26} strokeWidth={2.25} />
              </Pressable>
            ) : null}
            {brand ? (
              <View style={styles.brandRow} accessibilityLabel="FitBud">
                <View style={styles.brandMark}>
                  <Dumbbell color={theme.colors.white} size={24} strokeWidth={2} />
                </View>
                <Text style={styles.brandWord}>FitBud</Text>
              </View>
            ) : null}
            {title ? (
              <Text variant="largeTitle" style={styles.title} accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              typeof subtitle === "string" ? (
                <Text variant="body" tone="ink2" style={styles.subtitle}>
                  {subtitle}
                </Text>
              ) : (
                <View style={styles.subtitleWrap}>{subtitle}</View>
              )
            ) : null}
            {children}
          </View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const usePageStyles = createThemedStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.bg },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: t.spacing.lg,
    paddingBottom: t.spacing.xl,
  },
  main: { flexGrow: 1 },
  back: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginBottom: t.spacing.lg,
    marginLeft: -10,
    width: 44,
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 36,
    marginTop: t.spacing.md,
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: t.colors.fixedNavy,
    borderRadius: 12,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  brandWord: {
    ...t.text.title.style,
    color: t.colors.ink,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  title: { marginBottom: t.spacing.sm },
  subtitle: { lineHeight: 22, marginBottom: t.spacing.lg },
  subtitleWrap: { marginBottom: t.spacing.lg },
  footer: { marginTop: t.spacing.xl },
}));

/** Kit `.field-err`: alert icon and crit text under a field. */
export function InlineError({ message, testID }: { message: string; testID?: string }) {
  const theme = useTheme();
  const styles = useInlineStyles();
  return (
    <View
      style={styles.row}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <CircleAlert color={theme.colors.crit} size={16} strokeWidth={2} />
      <Text tone="crit" style={styles.text}>
        {message}
      </Text>
    </View>
  );
}

/** Kit `.banner.crit` with a clock (TR-01f): a wait, not a wrong entry. */
export function WaitBanner({ message }: { message: string }) {
  const theme = useTheme();
  const styles = useInlineStyles();
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Clock color={theme.colors.critInk} size={20} strokeWidth={2} />
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

const useInlineStyles = createThemedStyles((t) => ({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginHorizontal: 2,
    marginTop: -t.spacing.sm,
    marginBottom: t.spacing.md,
  },
  text: { flex: 1, fontSize: 14, lineHeight: 19 },
  banner: {
    alignItems: "center",
    backgroundColor: t.colors.critTint,
    borderRadius: 16,
    flexDirection: "row",
    gap: 12,
    marginBottom: t.spacing.lg,
    padding: t.spacing.lg,
  },
  bannerText: { color: t.colors.critInk, flex: 1, fontSize: 15, lineHeight: 21 },
}));

type PasswordProps = Omit<TextInputProps, "secureTextEntry"> & {
  label: string;
  /** Crit edge (TR-01e); the message itself is an `InlineError` below. */
  invalid?: boolean;
};

/** A password field with the kit's eye toggle inside the input (TR-01a, TR-01d). */
export function PasswordInput({ label, invalid = false, onFocus, onBlur, ...rest }: PasswordProps) {
  const theme = useTheme();
  const styles = useFieldStyles();
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const Icon = shown ? Eye : EyeOff;
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.box,
          focused ? styles.boxFocused : null,
          invalid ? styles.boxInvalid : null,
        ]}
      >
        <TextInput
          placeholderTextColor={theme.colors.ink3}
          selectionColor={theme.colors.brand}
          cursorColor={theme.colors.brand}
          keyboardAppearance={theme.scheme}
          style={styles.input}
          accessibilityLabel={label}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...rest}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shown ? "Hide password" : "Show password"}
          onPress={() => setShown((value) => !value)}
          style={styles.eye}
        >
          <Icon color={theme.colors.ink2} size={22} strokeWidth={1.75} />
        </Pressable>
      </View>
    </View>
  );
}

const useFieldStyles = createThemedStyles((t) => ({
  wrap: { marginBottom: t.spacing.lg },
  label: {
    color: t.colors.ink2,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginHorizontal: 2,
  },
  box: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: t.radii.input,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 50,
    paddingLeft: 14,
  },
  boxFocused: { borderColor: t.colors.brand, borderWidth: 2, paddingLeft: 13 },
  boxInvalid: { borderColor: t.colors.crit, borderWidth: 2, paddingLeft: 13 },
  input: {
    ...defaultTextStyle,
    color: t.colors.ink,
    flex: 1,
    fontSize: 16,
    paddingVertical: t.spacing.md,
  },
  eye: { alignItems: "center", height: 48, justifyContent: "center", width: 48 },
}));

type CodeBoxesProps = {
  value: string;
  onChange: (value: string) => void;
  /** Called once six digits are in. */
  onComplete?: (code: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
};

/** Six code boxes over one hidden input (TR-01c, TR-01g, TR-02a). */
export function CodeBoxes({ value, onChange, onComplete, invalid = false, autoFocus = true }: CodeBoxesProps) {
  const theme = useTheme();
  const styles = useCodeStyles();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.split("");
  return (
    <Pressable
      accessibilityRole="none"
      onPress={() => input.current?.focus()}
      style={styles.row}
    >
      {Array.from({ length: 6 }, (_, index) => {
        const active = focused && !invalid && index === Math.min(value.length, 5);
        return (
          <View
            key={index}
            style={[
              styles.box,
              active ? styles.boxActive : null,
              invalid ? styles.boxInvalid : null,
            ]}
          >
            <Text variant="numberMd" style={styles.digit}>
              {digits[index] ?? ""}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={(text) => {
          const next = text.replace(/\D/g, "").slice(0, 6);
          onChange(next);
          if (next.length === 6) onComplete?.(next);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        keyboardAppearance={theme.scheme}
        accessibilityLabel="6-digit code"
        caretHidden
        style={styles.hidden}
      />
    </Pressable>
  );
}

const useCodeStyles = createThemedStyles((t) => ({
  row: { flexDirection: "row", gap: 8, marginBottom: t.spacing.md },
  box: {
    alignItems: "center",
    aspectRatio: 0.95,
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
  },
  boxActive: { borderColor: t.colors.brand, borderWidth: 2 },
  boxInvalid: { borderColor: t.colors.crit, borderWidth: 2 },
  digit: { color: t.colors.ink, fontSize: 26 },
  hidden: {
    height: "100%",
    left: 0,
    opacity: 0.011,
    position: "absolute",
    top: 0,
    width: "100%",
  },
}));

/** "—— or ——" between two ways to sign in (TR-01a). */
export function OrDivider() {
  const styles = useOrStyles();
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.line} />
      <Text tone="ink3" style={styles.or}>
        or
      </Text>
      <View style={styles.line} />
    </View>
  );
}

const useOrStyles = createThemedStyles((t) => ({
  row: { alignItems: "center", flexDirection: "row", gap: 16, marginVertical: 20 },
  line: { backgroundColor: t.colors.line2, flex: 1, height: 1 },
  or: { fontSize: 15 },
}));

/** A text button in the brand colour (kit `.btn.text`), 44 pt tall. */
export function TextLink({
  label,
  onPress,
  align = "center",
  disabled = false,
  accessibilityLabel,
  muted = false,
}: {
  label: string;
  onPress: () => void;
  align?: "center" | "flex-start" | "flex-end";
  disabled?: boolean;
  accessibilityLabel?: string;
  muted?: boolean;
}) {
  const styles = useLinkStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.wrap, { alignSelf: align }]}
    >
      <Text tone={disabled || muted ? "ink4" : "brand"} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const useLinkStyles = createThemedStyles(() => ({
  wrap: { justifyContent: "center", minHeight: 44 },
  label: { fontSize: 16, fontWeight: "600" },
}));

type StateProps = {
  /** Icon in the tinted tile; receives the icon colour. */
  icon: (color: string) => ReactNode;
  title: string;
  body: string;
  /** Main action (kit `.btn.primary`, or `.btn.tint` with `actionTint`). */
  action?: { label: string; onPress: () => void; icon?: (color: string) => ReactNode; loading?: boolean };
  actionTint?: boolean;
  /** Text action under the main one. */
  link?: { label: string; onPress: () => void };
  onBack?: () => void;
  /** Header title next to Back (TR-23). */
  navTitle?: string;
  /** `plain` is the kit's white page (TR-21, TR-24, TM-08b); `canvas` the grey one (TR-23). */
  surface?: "plain" | "canvas";
  testID?: string;
};

/**
 * Centred system state: a tinted icon tile, title, body and up to two
 * actions (TR-21 error, TR-23 unavailable, TR-24 signed out, TM-08b).
 * Follows the system theme.
 */
export function CenteredState(props: StateProps) {
  return (
    <ThemeScope scheme="system">
      <CenteredStateBody {...props} />
    </ThemeScope>
  );
}

function CenteredStateBody({
  icon,
  title,
  body,
  action,
  actionTint = false,
  link,
  onBack,
  navTitle,
  surface = "plain",
  testID,
}: StateProps) {
  const theme = useTheme();
  const styles = useStateStyles();
  const actionColor = actionTint ? theme.colors.brandInk : theme.colors.onBrand;
  return (
    <SafeAreaView
      style={[styles.safe, surface === "canvas" ? styles.canvas : null]}
      testID={testID}
    >
      {onBack || navTitle ? (
        <View style={styles.nav}>
          {onBack ? (
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
          {navTitle ? (
            <Text variant="headline" style={styles.navTitle} accessibilityRole="header">
              {navTitle}
            </Text>
          ) : (
            <View style={styles.flex} />
          )}
          <View style={styles.back} />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>
        <View role="main" style={styles.center}>
          <View style={styles.tile}>{icon(theme.colors.brandInk)}</View>
          <Text variant="title" style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body" tone="ink2" style={styles.body}>
            {body}
          </Text>
          {action ? (
            <View style={styles.actionWrap}>
              <Button
                label={action.label}
                variant={actionTint ? "tint" : "primary"}
                loading={action.loading}
                icon={action.icon?.(actionColor)}
                onPress={action.onPress}
              />
            </View>
          ) : null}
          {link ? <TextLink label={link.label} onPress={link.onPress} /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStateStyles = createThemedStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.bgPlain },
  canvas: { backgroundColor: t.colors.bg },
  flex: { flex: 1 },
  nav: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingTop: t.spacing.sm,
  },
  back: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  navTitle: { flex: 1, fontSize: 18, textAlign: "center" },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 40, paddingBottom: 80 },
  center: { alignItems: "center" },
  tile: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 24,
    height: 76,
    justifyContent: "center",
    marginBottom: 20,
    width: 76,
  },
  title: { fontSize: 22, marginBottom: t.spacing.sm, textAlign: "center" },
  body: { lineHeight: 23, marginBottom: 24, textAlign: "center" },
  actionWrap: { alignSelf: "stretch", marginBottom: t.spacing.sm },
}));
