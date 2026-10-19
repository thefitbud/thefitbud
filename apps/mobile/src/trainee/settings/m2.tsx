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
import { Text } from "../../components/Text";
import {
  colors,
  fontFamilyBold,
  fontFamilyMedium,
  fontFamilySemiBold,
  radii,
  spacing,
} from "@fitbud/ui-mobile";
import { brand, ink, semantic, surface } from "@fitbud/tokens";

export function M2Title({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.titleBlock}>
      <Text style={styles.h1} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function M2Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

/** Card of rows with a hairline between them (m2 `.lrow + .lrow`). */
export function M2Group({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <M2Card>
      {items.map((child, index) => (
        <View key={index} style={index > 0 ? styles.sep : null}>
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
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  value?: string;
  onPress?: () => void;
  tile?: "indigo" | "neutral" | "critical";
  labelColor?: string;
  showChevron?: boolean;
  trailing?: ReactNode;
  accessibilityLabel?: string;
}) {
  const body = (
    <>
      {icon ? (
        <View
          style={[
            styles.tile,
            tile === "neutral" ? styles.tileNeutral : null,
            tile === "critical" ? styles.tileCritical : null,
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
        <ChevronRight color={ink[500]} size={18} strokeWidth={2} />
      ) : null}
    </>
  );
  if (!onPress) {
    return <View style={styles.row}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={styles.row}
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
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={[styles.row, disabled ? styles.dim : null]}>
      {icon ? <View style={styles.tile}>{icon}</View> : null}
      <View style={styles.tx}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: ink[200], true: brand.indigo }}
        thumbColor={colors.white}
      />
    </View>
  );
}

/** Indented row under a parent switch (m2 sub-row). */
export function M2SubRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
}) {
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
        <ChevronRight color={ink[500]} size={18} strokeWidth={2} />
      ) : null}
    </Pressable>
  );
}

/** Preset row from mockup 23 (`.radc`). */
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

/** Circular − / + from m2 `.rstp`. */
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

/** Every day / Weekdays / Weekends (m2 `.segc`). */
export function M2Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
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
  return (
    <View style={styles.hero}>
      <View style={[styles.heroTile, tone === "wait" ? styles.tileNeutral : null]}>
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

export function M2Page({
  title,
  subtitle,
  onBack,
  children,
  footer,
  refreshing,
  onRefresh,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing ?? false}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
      >
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={styles.back}
          >
            <ChevronLeft color={ink[700]} size={20} strokeWidth={1.75} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : null}
        <M2Title title={title} subtitle={subtitle} />
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  titleBlock: {
    paddingBottom: 14,
    paddingHorizontal: 4,
  },
  h1: {
    color: brand.deepNavy,
    fontFamily: fontFamilyBold,
    fontSize: 30,
    letterSpacing: -0.66,
    lineHeight: 36,
  },
  subtitle: {
    color: ink[500],
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.white,
    borderColor: surface.border,
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  sep: {
    borderTopColor: surface.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tile: {
    alignItems: "center",
    backgroundColor: brand.paleLavender,
    borderRadius: 10,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  tileNeutral: {
    backgroundColor: surface.pageMobile,
  },
  tileCritical: {
    backgroundColor: semantic.critical.fill,
  },
  tx: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    color: ink[900],
    fontFamily: fontFamilyMedium,
    fontSize: 16,
    lineHeight: 22,
  },
  hint: {
    color: ink[500],
    fontSize: 13,
    lineHeight: 18,
  },
  val: {
    color: ink[500],
    fontSize: 15,
  },
  subRow: {
    paddingLeft: 58,
  },
  subLabel: {
    color: ink[700],
    fontFamily: fontFamilyMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  radio: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "#D9D6E6",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
  },
  radioOn: {
    backgroundColor: brand.paleLavender,
    borderColor: brand.indigo,
  },
  radioDot: {
    borderColor: "#D9D6E6",
    borderRadius: 11,
    borderWidth: 2,
    height: 22,
    width: 22,
  },
  radioDotOn: {
    borderColor: brand.indigo,
    borderWidth: 6,
  },
  radioLabel: {
    color: ink[700],
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  radioLabelOn: {
    color: brand.deepNavy,
  },
  rstp: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  rstpBtn: {
    alignItems: "center",
    backgroundColor: brand.paleLavender,
    borderRadius: 26,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  rstpGlyph: {
    color: brand.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 24,
    lineHeight: 28,
  },
  rstpValue: {
    color: brand.deepNavy,
    flex: 1,
    fontFamily: fontFamilySemiBold,
    fontSize: 22,
    textAlign: "center",
  },
  seg: {
    backgroundColor: "#ECEAF4",
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
    backgroundColor: colors.white,
  },
  segText: {
    color: ink[500],
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
  },
  segTextOn: {
    color: brand.deepNavy,
  },
  hero: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: surface.border,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  heroTile: {
    alignItems: "center",
    backgroundColor: brand.paleLavender,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  heroTitle: {
    color: brand.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  dim: {
    opacity: 0.45,
  },
  note: {
    backgroundColor: brand.paleLavender,
    borderColor: "#E4DEFF",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noteText: {
    color: ink[700],
    fontSize: 14,
    lineHeight: 20,
  },
  btn: {
    alignItems: "center",
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: brand.indigo,
  },
  btnSecondary: {
    backgroundColor: colors.white,
    borderColor: surface.border,
    borderWidth: 1,
  },
  btnText: {
    color: brand.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  btnTextPrimary: {
    color: colors.white,
  },
  page: {
    backgroundColor: surface.pageMobile,
    flex: 1,
  },
  pageContent: {
    gap: 12,
    paddingBottom: 32,
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
  },
  back: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 2,
    minHeight: 44,
    paddingRight: 8,
  },
  backText: {
    color: ink[700],
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  footer: {
    paddingBottom: 16,
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
  },
});

export const m2Gap = spacing.md;
export const m2Gutter = spacing.lg;
