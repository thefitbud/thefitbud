import { StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { Text } from "../components/Text";

/**
 * Dev-only `JS <short sha>` label so a developer can see which commit the
 * running bundle came from (D-W3-12). Renders nothing in release builds.
 */
export function bundleCommitLabel(
  extra: Record<string, unknown> | undefined,
): string {
  const sha = extra?.bundleCommit;
  return `JS ${typeof sha === "string" && sha ? sha : "unknown"}`;
}

export function BundleCommitBadge() {
  if (typeof __DEV__ === "undefined" || !__DEV__) return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Text style={styles.text}>
        {bundleCommitLabel(Constants.expoConfig?.extra)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 8, bottom: 4 },
  text: { fontSize: 10, color: "#6b6b6b" },
});
