import { useState } from "react";
import { ActivityIndicator, Image, Pressable, View } from "react-native";
import { Camera } from "lucide-react-native";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Text } from "../../components/Text";
import { reportError } from "../../lib/reportError";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import {
  MealPhotoError,
  pickMealPhoto,
  prepareMealPhoto,
  type MealPhotoSource,
} from "../mealActions";
import { MealPhotoSheet } from "./MealPhotoSheet";
import { useMealPhotoJobs } from "./useMealPhotoJobs";

/** A photo picked on the ate-out screen, resized and ready to send with the log. */
export type AteOutPhoto = { uri: string; bytes: Uint8Array };

/**
 * TR-08c2: "Add a photo · Optional · the menu or your plate". The photo is
 * picked and resized here; on Save it becomes a meal photo job (the same
 * durable path as Diet's, `mealPhotoJobs.ts`) that attaches once the log has
 * reached the server.
 */
export function AteOutPhotoRow({
  mealName,
  value,
  onChange,
}: {
  mealName: string;
  value: AteOutPhoto | null;
  onChange: (photo: AteOutPhoto | null) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  // Starts the photo runner for this session, so the job sends after Save.
  useMealPhotoJobs();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(source: MealPhotoSource) {
    setSheetOpen(false);
    setError(null);
    try {
      const picked = await pickMealPhoto(source);
      if (!picked) return;
      setBusy(true);
      const prepared = await prepareMealPhoto(picked);
      onChange({ uri: prepared.uri, bytes: prepared.bytes });
    } catch (err) {
      reportError("AteOutPhotoRow.choose", err);
      setError(
        err instanceof MealPhotoError
          ? err.message
          : "Couldn't open the photo. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {value ? (
        <View style={styles.row} testID="ate-out-photo-added">
          <Image
            source={{ uri: value.uri }}
            style={styles.thumb}
            accessibilityLabel={`Photo of ${mealName}`}
          />
          <View style={styles.text}>
            <Text variant="body">Photo added</Text>
            <Text variant="subhead" tone="ink2">
              Sends with your meal
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            onPress={() => onChange(null)}
            style={styles.remove}
          >
            <Text variant="bodyStrong">Remove</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a photo"
          accessibilityHint="Optional, the menu or your plate"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => setSheetOpen(true)}
          style={styles.row}
          testID="ate-out-add-photo"
        >
          <View style={styles.tile}>
            {busy ? (
              <ActivityIndicator color={theme.colors.brandInk} />
            ) : (
              <Camera size={20} strokeWidth={1.9} color={theme.colors.ink} />
            )}
          </View>
          <View style={styles.text}>
            <Text variant="body">Add a photo</Text>
            <Text variant="subhead" tone="ink2">
              Optional · the menu or your plate
            </Text>
          </View>
        </Pressable>
      )}
      {error ? <ErrorBanner message={error} /> : null}
      {sheetOpen ? (
        <MealPhotoSheet
          visible
          mealName={mealName}
          coachAsks={null}
          onTakePhoto={() => void choose("camera")}
          onChooseFromGallery={() => void choose("gallery")}
          onNotNow={() => setSheetOpen(false)}
        />
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  wrap: { gap: 8, marginTop: 4 },
  row: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: t.radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tile: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  thumb: { borderRadius: 10, height: 44, width: 44 },
  text: { flex: 1, minWidth: 0 },
  remove: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: t.touchTarget,
    paddingHorizontal: 8,
  },
}));
