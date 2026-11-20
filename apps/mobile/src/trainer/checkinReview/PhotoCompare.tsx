/**
 * TM-06f: full-screen photo compare. Pose metadata is not on media assets yet,
 * so we pair the oldest and newest ready photos and keep Front/Side/Back as
 * view labels only when at least two photos exist.
 */
import { useMemo, useState } from "react";
import { Image,
  Modal,
  Pressable,
  View,
} from "react-native";
import { X } from "lucide-react-native";
import type { CheckinReviewPhoto } from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { ThemeScope, createThemedStyles, useTheme } from "../../providers/ThemeProvider";

type Angle = "front" | "side" | "back";

const ANGLES: Angle[] = ["front", "side", "back"];

function captionFor(photo: CheckinReviewPhoto, index: number): string {
  const date = photo.createdAt?.slice(0, 10);
  const week = `Week ${index + 1}`;
  if (date) return `${week} · ${formatCivilDate(date)}`;
  return week;
}

type Props = {
  visible: boolean;
  firstName: string;
  photos: readonly CheckinReviewPhoto[];
  uris: Record<string, string>;
  onClose: () => void;
};

export function PhotoCompare(props: Props) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <PhotoCompareBody {...props} />
    </ThemeScope>
  );
}

function PhotoCompareBody({
  visible,
  firstName,
  photos,
  uris,
  onClose,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const [angle, setAngle] = useState<Angle>("front");
  const ordered = useMemo(
    () =>
      photos
        .slice()
        .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "")),
    [photos],
  );
  const left = ordered[0] ?? null;
  const right =
    ordered.length > 1 ? ordered[ordered.length - 1]! : ordered[0] ?? null;
  const same = left && right && left.id === right.id;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={styles.close}
          >
            <X color={theme.colors.white} size={20} strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.title}>{`${firstName} · ${angle}`}</Text>
          <View style={styles.close} />
        </View>

        <View style={styles.pair}>
          <CompareSlot
            uri={left ? uris[left.id] : undefined}
            caption={left ? captionFor(left, 0) : "—"}
          />
          <CompareSlot
            uri={!same && right ? uris[right.id] : undefined}
            caption={
              !same && right
                ? captionFor(right, Math.max(1, ordered.length - 1))
                : "—"
            }
          />
        </View>

        <View style={styles.angles}>
          {ANGLES.map((item) => {
            const on = item === angle;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setAngle(item)}
                style={[styles.angle, on ? styles.angleOn : null]}
              >
                <Text style={[styles.angleText, on ? styles.angleTextOn : null]}>
                  {item[0]!.toUpperCase() + item.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

function CompareSlot({
  uri,
  caption,
}: {
  uri?: string;
  caption: string;
}) {

  const styles = useStyles();
  return (
    <View style={styles.slot}>
      <View style={styles.frame}>
        {uri ? (
          <Image
            accessibilityLabel="Progress photo"
            source={{ uri }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  root: {
    backgroundColor: t.colors.mediaBg,
    flex: 1,
    paddingBottom: 28,
    paddingTop: 54,
  },
  nav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  close: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  title: {
    color: t.colors.white,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
    fontWeight: "600",
  },
  pair: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 20,
  },
  slot: { flex: 1 },
  frame: {
    aspectRatio: 3 / 4,
    backgroundColor: t.colors.navy,
    borderRadius: 16,
    overflow: "hidden",
  },
  image: { height: "100%", width: "100%" },
  placeholder: {
    backgroundColor: t.colors.phA,
    flex: 1,
  },
  caption: {
    color: t.colors.white,
    fontSize: 13,
    marginTop: 10,
    textAlign: "center",
  },
  angles: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingTop: 16,
  },
  angle: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    minWidth: 72,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  angleOn: { backgroundColor: t.colors.white },
  angleText: {
    color: t.colors.white,
    fontFamily: fontFamilySemiBold,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  angleTextOn: { color: "#0B0A12" },
}));
