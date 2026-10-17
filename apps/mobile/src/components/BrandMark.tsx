import { Image, StyleSheet } from "react-native";

import markSource from "../../assets/brand-mark.png";

type Props = {
  size?: number;
};

/** Honest Week four-dot mark (temporary FitBud logo). */
export function BrandMark({ size = 32 }: Props) {
  return (
    <Image
      source={markSource}
      style={[styles.mark, { width: size, height: size }]}
      accessibilityLabel="FitBud"
    />
  );
}

const styles = StyleSheet.create({
  mark: {
    marginBottom: 12,
  },
});
