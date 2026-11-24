/**
 * One Attention section as its own list (TM-01a6, TM-01a7): the same rows,
 * swipe and actions as on Attention. Back returns to Attention where it was
 * (Attention stays mounted underneath).
 */
import { FlatList, SafeAreaView, View } from "react-native";
import { CircleCheck } from "lucide-react-native";
import { fontFamilySemiBold, spacing } from "@fitbud/ui-mobile";
import { HeaderBack } from "../../components/HeaderBack";
import { PushedScreen } from "../../components/PushedScreen";
import { Text } from "../../components/Text";
import { useHardwareBack } from "../../lib/useHardwareBack";
import {
  ThemeScope,
  createThemedStyles,
  useTheme,
} from "../../providers/ThemeProvider";
import { NeedsYouRow, NeedsYouRowShell } from "./NeedsYouView";
import type {
  NeedsYouCardModel,
  NeedsYouSection,
  NeedsYouSectionId,
} from "./needsYouModel";

const EMPTY_COPY: Record<NeedsYouSectionId, { title: string; body: string }> = {
  missed: {
    title: "Nothing missed right now",
    body: "Every missed workout and meal is resolved or noted.",
  },
  asked: {
    title: "No questions right now",
    body: "Every question from a client has an answer.",
  },
  checkins: {
    title: "No check-ins to review",
    body: "Every submitted check-in has been reviewed.",
  },
  off: {
    title: "Nobody is off plan right now",
    body: "Every off-plan item is resolved or noted.",
  },
  reviewed: {
    title: "Nothing noted and still open",
    body: "Items you note stay here until you resolve them.",
  },
};

const FOOTER_NOUN: Record<NeedsYouSectionId, string> = {
  missed: "Missed",
  asked: "Questions",
  checkins: "Check-ins",
  off: "Off plan",
  reviewed: "Noted, still open",
};

const SHORT_TITLE: Record<NeedsYouSectionId, string> = {
  missed: "Missed",
  asked: "Asked you",
  checkins: "Check-ins",
  off: "Off plan",
  reviewed: "Noted, still open",
};

export function sectionAllTitle(
  id: NeedsYouSectionId,
  section: NeedsYouSection | null,
): string {
  return section && section.count > 0
    ? `${SHORT_TITLE[id]} · ${section.count}`
    : SHORT_TITLE[id];
}

type Props = {
  sectionId: NeedsYouSectionId;
  /** The live section: null once its last item is resolved or noted. */
  section: NeedsYouSection | null;
  offline: boolean;
  onBack: () => void;
  onCardAction: (card: NeedsYouCardModel) => void;
  onMarkReviewed: (card: NeedsYouCardModel) => void;
  onOpenProfile?: (relationshipId: string) => void;
  animateIn?: boolean;
};

export function SectionAllScreen({
  sectionId,
  section,
  offline,
  onBack,
  onCardAction,
  onMarkReviewed,
  onOpenProfile,
  animateIn,
}: Props) {
  useHardwareBack(onBack);
  return (
    <PushedScreen onBack={onBack} animateIn={animateIn} testID="section-all-screen">
      <ThemeScope scheme="system">
        <Body
          sectionId={sectionId}
          section={section}
          offline={offline}
          onBack={onBack}
          onCardAction={onCardAction}
          onMarkReviewed={onMarkReviewed}
          onOpenProfile={onOpenProfile}
        />
      </ThemeScope>
    </PushedScreen>
  );
}

function Body({
  sectionId,
  section,
  offline,
  onBack,
  onCardAction,
  onMarkReviewed,
  onOpenProfile,
}: Omit<Props, "animateIn">) {
  const theme = useTheme();
  const styles = useStyles();
  const empty = EMPTY_COPY[sectionId];
  const swipeable = sectionId === "missed" || sectionId === "off";
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <View style={styles.backSlot}>
          <HeaderBack onPress={onBack} label="Attention" />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {sectionAllTitle(sectionId, section)}
        </Text>
        <View style={styles.backSlot} />
      </View>
      {section && section.cards.length > 0 ? (
        <FlatList
          data={section.cards}
          keyExtractor={(card) => card.key}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <Text style={styles.end}>That’s everything in {FOOTER_NOUN[sectionId]}</Text>
          }
          renderItem={({ item }) => (
            <NeedsYouRowShell
              card={item}
              offline={offline}
              swipeable={swipeable}
              onMarkReviewed={onMarkReviewed}
            >
              <NeedsYouRow
                card={item}
                offline={offline}
                dim={sectionId === "reviewed"}
                onAction={() => onCardAction(item)}
                onOpenProfile={onOpenProfile}
              />
            </NeedsYouRowShell>
          )}
        />
      ) : (
        <View style={styles.empty} testID="section-all-empty">
          <View style={styles.emptyTile}>
            <CircleCheck color={theme.colors.ink} size={28} strokeWidth={1.75} />
          </View>
          <Text style={styles.emptyTitle} accessibilityRole="header">
            {empty.title}
          </Text>
          <Text style={styles.emptyBody}>{empty.body}</Text>
          <Text
            accessibilityRole="button"
            onPress={onBack}
            style={styles.emptyBtn}
          >
            Back to Attention
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.bg },
  head: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  backSlot: { width: 104 },
  title: {
    color: t.colors.ink,
    flex: 1,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
    textAlign: "center",
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  end: {
    color: t.colors.ink3,
    fontSize: 15,
    paddingTop: spacing.md,
    textAlign: "center",
  },
  empty: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyTile: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 24,
    height: 76,
    justifyContent: "center",
    marginBottom: 16,
    width: 76,
  },
  emptyTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 22,
    textAlign: "center",
  },
  emptyBody: {
    color: t.colors.ink2,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
  emptyBtn: {
    backgroundColor: t.colors.brandTint,
    borderRadius: 16,
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
    marginTop: 22,
    overflow: "hidden",
    paddingVertical: 14,
    textAlign: "center",
    width: "100%",
  },
}));
