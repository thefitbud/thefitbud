import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import type { CheckinReviewPhoto } from "@fitbud/contracts";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { useAuth } from "../../auth/AuthProvider";
import { resolveApiBaseUrl } from "../../lib/api";
import { reportError } from "../../lib/reportError";
import { PhotoCompare } from "./PhotoCompare";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";

/** Frame 19 shows three thumbnails. */
const MAX_THUMBNAILS = 3;

/** This check-in's own uploaded photos; the payload also carries other recent photos. */
export function checkinPhotos(
  photos: readonly CheckinReviewPhoto[],
  checkinId: string,
): CheckinReviewPhoto[] {
  return photos.filter(
    (photo) =>
      photo.status === "ready" &&
      photo.domainEntityType === "checkin" &&
      photo.domainEntityId === checkinId,
  );
}

/** Photos section (frames 19 and 75): real thumbnails from the signed download target. */
export function Photos({
  photos,
  checkinId,
  firstName,
}: {
  photos: readonly CheckinReviewPhoto[];
  checkinId: string;
  firstName: string;
}) {

  const styles = useStyles();
  const { api } = useAuth();
  const own = checkinPhotos(photos, checkinId);
  const shown = own.slice(0, MAX_THUMBNAILS);
  const key = shown.map((photo) => photo.id).join(",");
  const [uris, setUris] = useState<Record<string, string>>({});
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    let live = true;
    for (const photo of shown) {
      api
        .getDownloadTarget(photo.id)
        .then((target) => {
          if (!live) return;
          const url = /^https?:/i.test(target.downloadUrl)
            ? target.downloadUrl
            : `${resolveApiBaseUrl()}${target.downloadUrl}`;
          setUris((current) => ({ ...current, [photo.id]: url }));
        })
        .catch((err: unknown) => reportError("checkinReview.photo", err));
    }
    return () => {
      live = false;
    };
  }, [api, key]);

  if (own.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.head} accessibilityRole="header">
          Photos <Text style={styles.count}>{own.length}</Text>
        </Text>
        {own.length >= 2 ? (
          <Text style={styles.compareHint}>Tap to compare</Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Compare photos"
        onPress={() => setCompareOpen(true)}
        style={styles.row}
      >
        {shown.map((photo) => (
          <View key={photo.id} style={styles.tile}>
            {uris[photo.id] ? (
              <Image
                accessibilityLabel="Check-in photo"
                source={{ uri: uris[photo.id] }}
                style={styles.image}
                resizeMode="cover"
              />
            ) : null}
          </View>
        ))}
      </Pressable>
      <PhotoCompare
        visible={compareOpen}
        firstName={firstName}
        photos={own}
        uris={uris}
        onClose={() => setCompareOpen(false)}
      />
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  wrap: { marginTop: 16 },
  headRow: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  head: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  count: {
    color: t.colors.ink3,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  compareHint: { color: t.colors.ink3, fontSize: 13 },
  row: { flexDirection: "row", gap: 8, marginTop: 8 },
  tile: {
    aspectRatio: 3 / 4,
    backgroundColor: t.colors.fill2,
    borderRadius: 14,
    flex: 1,
    overflow: "hidden",
  },
  image: { height: "100%", width: "100%" },
}));
