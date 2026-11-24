import type { ComponentProps, ReactNode } from "react";
import { Pressable, View, type StyleProp, type TextStyle } from "react-native";
import { Text } from "../components/Text";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { initialsFromName } from "../components/m2";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

/** The smallest touch target the app allows (AGENTS.md: 44 pt). */
export const CLIENT_LINK_MIN_TARGET = 44;

export type ClientAvatarTone = { backgroundColor: string; color: string };

type AvatarProps = {
  name: string;
  /** Circle diameter: 40 (feed), 48 (lists, details), 56/64 (headers). */
  size?: number;
  fontSize?: number;
  fontWeight?: TextStyle["fontWeight"];
  /** Colours; the screen's own tone (hashed or severity) so nothing shifts. */
  tone?: ClientAvatarTone;
  /** Opens the client's profile. Without it the avatar is plain, not a button. */
  onPress?: (() => void) | undefined;
  testID?: string;
};

/** Padding that lifts a smaller circle to a 44 pt target without moving layout. */
export function clientLinkHitSlop(size: number) {
  const pad = Math.max(0, Math.ceil((CLIENT_LINK_MIN_TARGET - size) / 2));
  return { top: pad, bottom: pad, left: pad, right: pad };
}

/**
 * A client's initials in a circle. Where a profile is reachable (trainer lists
 * and detail headers, D-W14-27) it takes `onPress` and becomes a button that
 * opens the profile; inside the client's own pages and pickers it is plain.
 */
export function ClientAvatar({
  name,
  size = 48,
  fontSize,
  fontWeight,
  tone,
  onPress,
  testID,
}: AvatarProps) {
  const theme = useTheme();
  const styles = useStyles();
  const c = theme.colors;
  const resolved = tone ?? { backgroundColor: c.av1Bg, color: c.av1Fg };
  const circle = (
    <View
      style={[
        styles.circle,
        {
          backgroundColor: resolved.backgroundColor,
          borderRadius: size / 2,
          height: size,
          width: size,
        },
      ]}
    >
      <Text
        style={[
          styles.initials,
          {
            color: resolved.color,
            fontSize: fontSize ?? Math.round(size * 0.3),
            ...(fontWeight ? { fontWeight } : null),
          },
        ]}
      >
        {initialsFromName(name)}
      </Text>
    </View>
  );
  if (!onPress) return circle;
  return (
    <Pressable
      testID={testID ?? "client-avatar-link"}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}'s profile`}
      hitSlop={clientLinkHitSlop(size)}
      onPress={onPress}
      style={({ pressed }) => [
        { borderRadius: size / 2 },
        pressed ? styles.pressed : null,
      ]}
    >
      {circle}
    </Pressable>
  );
}

/**
 * The client's name beside the avatar; tapping it does the same as the avatar.
 * Plain text when no `onPress` is given.
 */
export function ClientNameLink({
  name,
  onPress,
  children,
  style,
  variant,
}: {
  name: string;
  variant?: ComponentProps<typeof Text>["variant"];
  onPress?: (() => void) | undefined;
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const styles = useStyles();
  if (!onPress) {
    return (
      <Text variant={variant} style={style}>
        {children}
      </Text>
    );
  }
  return (
    <Pressable
      testID="client-name-link"
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}'s profile`}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Text variant={variant} style={style}>
        {children}
      </Text>
    </Pressable>
  );
}

const useStyles = createThemedStyles(() => ({
  circle: { alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: fontFamilySemiBold },
  pressed: { opacity: 0.6 },
}));
