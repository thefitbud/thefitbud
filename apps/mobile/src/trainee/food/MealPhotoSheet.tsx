import { Pressable, View } from "react-native";
import { Camera, CircleCheck, Image as ImageIcon } from "lucide-react-native";
import { BottomSheet } from "../../components/BottomSheet";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";

type Props = {
  visible: boolean;
  /** The meal's name, e.g. "Evening snack". */
  mealName: string;
  /**
   * The coach's first name, set when the plan asks for a photo of this meal
   * (D-W14-19): the sheet opens after the log and says so. Without it the
   * sheet was opened from the card's Add photo, with no prompt text (TR-07m4).
   */
  coachAsks?: string | null;
  onTakePhoto: () => void;
  onChooseFromGallery: () => void;
  onNotNow: () => void;
};

/**
 * TR-07m: the photo choice. Take photo / Choose from gallery / Not now. Each
 * row is a 44 pt+ target; Not now only closes the sheet (the card keeps its
 * Add photo for 24 hours).
 */
export function MealPhotoSheet({
  visible,
  mealName,
  coachAsks,
  onTakePhoto,
  onChooseFromGallery,
  onNotNow,
}: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const asked = Boolean(coachAsks);
  return (
    <BottomSheet visible={visible} headerless onDismiss={onNotNow}>
      <View style={styles.body} testID="meal-photo-sheet">
        <View style={styles.head}>
          {asked ? (
            <CircleCheck size={28} strokeWidth={2} color={theme.colors.done} />
          ) : null}
          <View style={styles.headText}>
            <Text variant="title" accessibilityRole="header">
              {asked ? `${mealName} logged` : "Add a photo"}
            </Text>
            <Text variant="subhead">
              {asked ? `${coachAsks} asks for a photo of this meal.` : mealName}
            </Text>
          </View>
        </View>
        <View style={styles.group}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            onPress={onTakePhoto}
            style={styles.row}
            testID="meal-photo-take"
          >
            <View style={styles.tile}>
              <Camera size={20} strokeWidth={1.9} color={theme.colors.brandInk} />
            </View>
            <Text variant="body">Take photo</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose from gallery"
            onPress={onChooseFromGallery}
            style={styles.row}
            testID="meal-photo-gallery"
          >
            <View style={styles.tile}>
              <ImageIcon size={20} strokeWidth={1.9} color={theme.colors.brandInk} />
            </View>
            <Text variant="body">Choose from gallery</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not now"
          onPress={onNotNow}
          style={styles.notNow}
          testID="meal-photo-not-now"
        >
          <Text variant="bodyStrong">Not now</Text>
        </Pressable>
        {asked ? (
          <Text variant="caption" tone="ink2" style={styles.foot}>
            You can add it from the meal for 24 hours.
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((t) => ({
  body: { gap: 12 },
  head: { alignItems: "center", flexDirection: "row", gap: 12 },
  headText: { flex: 1, minWidth: 0 },
  group: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: t.radii.group,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tile: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  divider: {
    backgroundColor: t.colors.line,
    height: 1,
    marginLeft: 66,
  },
  notNow: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: t.radii.button,
    justifyContent: "center",
    minHeight: 52,
  },
  foot: { textAlign: "center" },
}));
