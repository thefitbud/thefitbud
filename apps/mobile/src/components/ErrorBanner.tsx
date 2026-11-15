import { View } from "react-native";
import { Text } from "./Text";
import { createThemedStyles } from "../providers/ThemeProvider";

/** Kit `.banner.crit`: crit tint with crit-ink text (quiet danger, never a red screen). */
export function ErrorBanner({ message }: { message: string }) {
  const styles = useStyles();
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text tone="critInk" style={styles.text}>
        {message}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  banner: {
    backgroundColor: t.colors.critTint,
    borderRadius: t.radii.toast,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: t.spacing.lg,
  },
  text: {
    ...t.text.subhead.style,
  },
}));
