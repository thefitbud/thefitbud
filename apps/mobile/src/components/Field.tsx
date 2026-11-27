import { useState } from "react";
import { Platform, TextInput, View, type TextInputProps } from "react-native";
import { defaultTextStyle } from "@fitbud/ui-mobile";
import { Text } from "./Text";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

/**
 * Text selection colours (Z14-9). Android paints `selectionColor` as the
 * highlight over the text, so a solid brand fill hid the selected words: it
 * uses the light `brandTint2` there, with the brand cursor and handles. iOS
 * keeps the brand colour, which it draws as a translucent highlight.
 */
export function inputSelectionProps(
  colors: { brand: string; brandTint2: string },
  os: string = Platform.OS,
): Pick<TextInputProps, "selectionColor" | "cursorColor" | "selectionHandleColor"> {
  if (os === "android") {
    return {
      selectionColor: colors.brandTint2,
      cursorColor: colors.brand,
      selectionHandleColor: colors.brand,
    };
  }
  return { selectionColor: colors.brand, cursorColor: colors.brand };
}

type Props = TextInputProps & {
  label?: string;
  hint?: string;
};

/**
 * Kit `.field`: ink2 label, a 50 pt card input with a line2 edge that turns
 * into a 2 pt brand edge while focused, and an ink3 help line.
 */
export function Field({ label, hint, onFocus, onBlur, ...inputProps }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        // ink3, not the kit's ink4: placeholder copy has to stay readable (4.5:1).
        placeholderTextColor={theme.colors.ink3}
        {...inputSelectionProps(theme.colors)}
        keyboardAppearance={theme.scheme}
        style={[
          styles.input,
          focused ? styles.inputFocused : undefined,
          inputProps.multiline ? styles.multiline : undefined,
        ]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        // The label is a sibling `Text`, not wired to this input, so without
        // this the input has no accessible name and VoiceOver/TalkBack
        // announce nothing (CU15). `...inputProps` spreads after it, so a
        // caller's explicit `accessibilityLabel` still wins. The label is the
        // accessible name only while it is unique on the screen; a screen with
        // two same-labelled fields passes its own label or a `testID`.
        accessibilityLabel={label || inputProps.accessibilityLabel || hint}
        {...inputProps}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  wrap: {
    marginBottom: t.spacing.lg,
  },
  label: {
    color: t.colors.ink2,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginHorizontal: 2,
  },
  input: {
    ...defaultTextStyle,
    minHeight: 50,
    borderWidth: 1,
    borderColor: t.colors.line2,
    backgroundColor: t.colors.card,
    borderRadius: t.radii.input,
    paddingHorizontal: 14,
    paddingVertical: t.spacing.md,
    fontSize: 16,
    color: t.colors.ink,
  },
  inputFocused: {
    borderWidth: 2,
    borderColor: t.colors.brand,
    // Keep the text still when the edge thickens.
    paddingHorizontal: 13,
    paddingVertical: t.spacing.md - 1,
  },
  multiline: {
    minHeight: 112,
    textAlignVertical: "top",
  },
  hint: {
    marginTop: 6,
    marginHorizontal: 2,
    color: t.colors.ink3,
    fontSize: 12.5,
    lineHeight: 17,
  },
}));
