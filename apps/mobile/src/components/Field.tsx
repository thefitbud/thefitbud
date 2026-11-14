import { useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { defaultTextStyle } from "@fitbud/ui-mobile";
import { Text } from "./Text";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";

type Props = TextInputProps & {
  label: string;
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
      <Text style={styles.label}>{label}</Text>
      <TextInput
        // ink3, not the kit's ink4: placeholder copy has to stay readable (4.5:1).
        placeholderTextColor={theme.colors.ink3}
        selectionColor={theme.colors.brand}
        cursorColor={theme.colors.brand}
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
        accessibilityLabel={label}
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
