import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import type { CheckinReviewPhoto } from "@fitbud/contracts";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { useAuth } from "../../auth/AuthProvider";
import { resolveApiBaseUrl } from "../../lib/api";
import { reportError } from "../../lib/reportError";

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
}: {
  photos: readonly CheckinReviewPhoto[];
  checkinId: string;
}) {
  const { api } = useAuth();
  const own = checkinPhotos(photos, checkinId);
  const shown = own.slice(0, MAX_THUMBNAILS);
  const key = shown.map((photo) => photo.id).join(",");
  const [uris, setUris] = useState<Record<string, string>>({});

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
      <Text style={styles.head} accessibilityRole="header">
        Photos <Text style={styles.count}>{own.length}</Text>
      </Text>
      <View style={styles.row}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  head: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 17 },
  count: { color: colors.midGrey, fontFamily: fontFamilySemiBold, fontSize: 17 },
  row: { flexDirection: "row", gap: 8, marginTop: 8 },
  tile: {
    aspectRatio: 3 / 4,
    backgroundColor: "#E7E9F2",
    borderRadius: 14,
    flex: 1,
    overflow: "hidden",
  },
  image: { height: "100%", width: "100%" },
});
