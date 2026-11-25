import { ThemeScope, createThemedStyles } from "../../providers/ThemeProvider";
import { Linking, Platform, ScrollView, View } from "react-native";
import { Text } from "../../components/Text";
import Constants from "expo-constants";
import { spacing } from "@fitbud/ui-mobile";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Screen } from "../../components/Screen";

const OEM_GUIDES: Record<string, { label: string; steps: string[]; helpUrl: string }> = {
  xiaomi: {
    label: "Xiaomi / Redmi / POCO",
    steps: [
      "Settings › Apps › FitBud › Battery › No restrictions",
      "Enable Autostart for FitBud",
      "Lock FitBud in recent apps if prompts appear",
    ],
    helpUrl: "https://dontkillmyapp.com/xiaomi",
  },
  samsung: {
    label: "Samsung",
    steps: [
      "Settings › Apps › FitBud › Battery › Unrestricted",
      "Disable Put app to sleep for FitBud",
    ],
    helpUrl: "https://dontkillmyapp.com/samsung",
  },
  oneplus: {
    label: "OnePlus / Oppo / Realme",
    steps: [
      "Settings › Battery › Battery optimization › FitBud › Don't optimize",
      "Allow background activity for FitBud",
    ],
    helpUrl: "https://dontkillmyapp.com/oneplus",
  },
  vivo: {
    label: "Vivo",
    steps: [
      "Settings › Battery › Background power consumption › FitBud › Allow",
      "Enable Autostart",
    ],
    helpUrl: "https://dontkillmyapp.com/vivo",
  },
  huawei: {
    label: "Huawei",
    steps: [
      "Settings › Apps › FitBud › Battery › Manage manually › All on",
      "Enable Autostart",
    ],
    helpUrl: "https://dontkillmyapp.com/huawei",
  },
};

function detectOemKey(): string | null {
  if (Platform.OS !== "android") return null;
  const brand = (
    Constants.expoConfig?.extra?.brand ??
    (Platform as { constants?: { Brand?: string } }).constants?.Brand ??
    ""
  )
    .toString()
    .toLowerCase();
  if (brand.includes("xiaomi") || brand.includes("redmi") || brand.includes("poco")) {
    return "xiaomi";
  }
  if (brand.includes("samsung")) return "samsung";
  if (
    brand.includes("oneplus") ||
    brand.includes("oppo") ||
    brand.includes("realme")
  ) {
    return "oneplus";
  }
  if (brand.includes("vivo")) return "vivo";
  if (brand.includes("huawei")) return "huawei";
  return "samsung";
}

type Props = {
  onDone: () => void;
};

function OemBatterySheetBody({ onDone }: Props) {
  const styles = useStyles();
  const key = detectOemKey();
  const guide = key ? OEM_GUIDES[key] : null;

  return (
    <Screen
      title="Keep reminders working"
      subtitle="Some Android makers pause apps in the background. These steps help FitBud reminders reach you."
    >
      <ScrollView style={styles.scroll}>
        {guide ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{guide.label}</Text>
            {guide.steps.map((step) => (
              <Text key={step} style={styles.step}>
                • {step}
              </Text>
            ))}
            <PrimaryButton
              label="Open app settings"
              variant="secondary"
              onPress={() => {
                void Linking.openSettings();
              }}
            />
            <PrimaryButton
              label="Why? (dontkillmyapp.com)"
              variant="ghost"
              onPress={() => {
                void Linking.openURL(guide.helpUrl);
              }}
            />
          </View>
        ) : (
          <Text style={styles.body}>
            On this device, open system Settings › Apps › FitBud and allow
            notifications and unrestricted battery use.
          </Text>
        )}
      </ScrollView>
      <PrimaryButton label="Done" onPress={onDone} />
    </Screen>
  );
}

const useStyles = createThemedStyles((t) => ({
  scroll: {
    maxHeight: 360,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: t.colors.card,
    borderRadius: 12,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  cardTitle: {
    color: t.colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  step: {
    color: t.colors.ink2,
    fontSize: 14,
    lineHeight: 20,
  },
  body: {
    color: t.colors.ink3,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
}));

/** OemBatterySheet in the system theme (Z12-49): its own styles read the scope. */
export function OemBatterySheet(props: Parameters<typeof OemBatterySheetBody>[0]) {
  return (
    <ThemeScope scheme="system">
      <OemBatterySheetBody {...props} />
    </ThemeScope>
  );
}
