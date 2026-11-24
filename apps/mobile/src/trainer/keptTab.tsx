import { useEffect, useRef, type MutableRefObject } from "react";
import { View } from "react-native";
import { Text } from "../components/Text";
import { createThemedStyles } from "../providers/ThemeProvider";
import { TRAINER_STALE_MS } from "./cache";

/**
 * Z14-3: tabs stay mounted once visited. When a tab becomes active again and
 * its data is older than `TRAINER_STALE_MS`, refresh it underneath what is on
 * screen; a quick switch back changes nothing.
 */
export function useRefreshWhenActive(
  active: boolean,
  lastLoadedAt: MutableRefObject<number>,
  reload: () => void,
): void {
  const wasActive = useRef(active);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    const returned = active && !wasActive.current;
    wasActive.current = active;
    if (!returned) return;
    if (Date.now() - lastLoadedAt.current > TRAINER_STALE_MS) {
      reloadRef.current();
    }
  }, [active, lastLoadedAt]);
}

/** The quiet line shown while a screen refreshes under a snapshot. */
export function UpdatingLine({ visible }: { visible: boolean }) {
  const styles = useStyles();
  if (!visible) return null;
  return (
    <View
      testID="updating-line"
      accessibilityLiveRegion="polite"
      style={styles.row}
    >
      <Text style={styles.text}>Updating…</Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  row: { paddingVertical: 4 },
  text: { color: t.colors.ink3, fontSize: 12, lineHeight: 16 },
}));
