/**
 * TM-12b: trainer meal detail sheet from diet day (ate-out / changed / planned).
 * WhatsApp is a wa.me prefill the trainer sends — never auto-send.
 */
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { NotebookPen, Pencil, UtensilsCrossed } from "lucide-react-native";
import type { MealAssignment } from "@fitbud/contracts";
import { formatCivilDate, formatNumber, formatPersonName } from "@fitbud/core";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { WhatsAppGlyph } from "../../components/m2";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";
import { openContextualWhatsApp } from "../whatsapp";
import { clientEditMarker } from "../activity/model";
import {
  dietMealBadge,
  loggedFoodLine,
  mealKcalPair,
  planFoodLine,
} from "./model";

type Props = {
  visible: boolean;
  meal: MealAssignment | null;
  displayName: string;
  whatsappE164?: string | null;
  /** The client's zone, for the time of an edit (Z14-16). */
  clientZone?: string;
  onDismiss: () => void;
  onAddNote: () => void;
};

export function DietMealSheet(props: Props) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <DietMealSheetBody {...props} />
    </ThemeScope>
  );
}

function DietMealSheetBody({
  visible,
  meal,
  displayName,
  whatsappE164,
  clientZone = "Asia/Kolkata",
  onDismiss,
  onAddNote,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  if (!meal) return null;

  const first = formatPersonName(displayName).split(/\s+/)[0] || "Client";
  const badge = dietMealBadge(meal);
  const plan = planFoodLine(meal);
  const { logged, planned } = mealKcalPair(meal);
  const ateOut = badge.kind === "ate_out";
  const note = meal.compliance?.notes?.trim() || null;
  const when = formatCivilDate(meal.localDate);
  const edit = clientEditMarker(meal.compliance, displayName, clientZone);
  const subBits = [when];
  if (ateOut) subBits.push("ate out");
  else if (badge.kind === "changed_portion" || badge.kind === "changed") {
    subBits.push("changed from the plan");
  } else if (badge.kind === "as_planned") {
    subBits.push("as planned");
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={styles.scrim}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      />
      <View style={styles.sheet} accessibilityRole="summary">
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{`${first} · ${meal.mealName}`}</Text>
            <Text style={styles.sub}>{subBits.join(" · ")}</Text>
          </View>
          <View
            style={[
              styles.badge,
              ateOut || badge.kind === "changed_portion"
                ? styles.badgeWarn
                : null,
            ]}
          >
            {ateOut ? (
              <UtensilsCrossed
                color={theme.colors.warn}
                size={13}
                strokeWidth={2.2}
              />
            ) : null}
            <Text
              style={[
                styles.badgeText,
                ateOut || badge.kind === "changed_portion"
                  ? styles.badgeTextWarn
                  : null,
              ]}
            >
              {badge.label}
            </Text>
          </View>
        </View>

        {edit ? (
          <View style={styles.editBox} testID="diet-sheet-client-edit">
            <Pencil color={theme.colors.ink2} size={16} strokeWidth={2.2} />
            <View style={{ flex: 1 }}>
              <Text style={styles.editBy}>{edit.by}</Text>
              {edit.was ? <Text style={styles.editWas}>{edit.was}</Text> : null}
            </View>
          </View>
        ) : null}

        <View style={styles.compare}>
          <View style={styles.planCard}>
            <Text style={styles.cardLabel}>Plan</Text>
            <Text style={styles.cardKcal}>
              {planned > 0 ? `${formatNumber(planned)} kcal` : "—"}
            </Text>
            <Text style={styles.cardFood} numberOfLines={3}>
              {plan}
            </Text>
          </View>
          <View style={[styles.loggedCard, ateOut ? styles.loggedWarn : null]}>
            <Text style={styles.cardLabel}>Logged</Text>
            <Text style={styles.cardKcal}>
              {logged != null
                ? `${formatNumber(logged)} kcal${ateOut ? " only" : ""}`
                : "—"}
            </Text>
            <Text style={styles.cardFood} numberOfLines={3}>
              {loggedFoodLine(meal) ?? "Not logged"}
            </Text>
          </View>
        </View>

        {note ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteLabel}>{`${first}'s note`}</Text>
            <Text style={styles.noteBody}>{note}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add note"
            onPress={onAddNote}
            style={styles.noteBtn}
          >
            <NotebookPen
              color={theme.colors.brand}
              size={16}
              strokeWidth={2.2}
            />
            <Text style={styles.noteText}>Add note</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="WhatsApp"
            onPress={() => {
              void openContextualWhatsApp({
                phoneE164: whatsappE164,
                draftText: `Hi ${first}, about your ${meal.mealName.toLowerCase()}…`,
              });
            }}
            style={styles.waBtn}
          >
            <WhatsAppGlyph size={16} />
            <Text style={styles.waText}>WhatsApp</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((t) => ({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: t.colors.scrim,
  },
  sheet: {
    backgroundColor: t.colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    bottom: 0,
    left: 0,
    paddingBottom: 28,
    paddingHorizontal: 16,
    paddingTop: 16,
    position: "absolute",
    right: 0,
  },
  head: { flexDirection: "row", gap: 12, marginBottom: 14 },
  editBox: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    padding: 14,
  },
  editBy: { color: t.colors.ink, fontFamily: fontFamilySemiBold, fontSize: 15 },
  editWas: { color: t.colors.ink3, fontSize: 14, marginTop: 2 },
  title: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
  },
  sub: { color: t.colors.ink3, fontSize: 14, marginTop: 2 },
  badge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: t.colors.fill,
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeWarn: { backgroundColor: t.colors.warnTint },
  badgeText: {
    color: t.colors.ink2,
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
  },
  badgeTextWarn: { color: t.colors.warn },
  compare: { flexDirection: "row", gap: 10, marginBottom: 12 },
  planCard: {
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flex: 1,
    padding: 12,
  },
  loggedCard: {
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flex: 1,
    padding: 12,
  },
  loggedWarn: { backgroundColor: t.colors.warnTint },
  cardLabel: {
    color: t.colors.ink3,
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  cardKcal: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
    marginBottom: 4,
  },
  cardFood: { color: t.colors.ink2, fontSize: 13, lineHeight: 18 },
  noteBox: {
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    marginBottom: 12,
    padding: 12,
  },
  noteLabel: {
    color: t.colors.ink3,
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
    marginBottom: 4,
  },
  noteBody: { color: t.colors.ink, fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: "row", gap: 10 },
  noteBtn: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 14,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 48,
    justifyContent: "center",
  },
  noteText: {
    color: t.colors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
  waBtn: {
    alignItems: "center",
    backgroundColor: t.colors.brand,
    borderRadius: 14,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 48,
    justifyContent: "center",
  },
  waText: {
    color: t.colors.onBrand,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
  },
}));
