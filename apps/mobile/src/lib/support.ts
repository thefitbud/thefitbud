import * as Linking from "expo-linking";
import { Platform } from "react-native";
import Constants from "expo-constants";

export const DEFAULT_SUPPORT_EMAIL = "tech@thefitbud.com";

export function buildSupportMailto(input: {
  supportEmail: string;
  screenId: string;
  role: "trainee" | "trainer";
  extra?: string;
}): string {
  const version = Constants.expoConfig?.version ?? "0.0.0";
  const subject = `FitBud support · ${input.role === "trainee" ? "Trainee" : "Trainer"} app · ${input.screenId}`;
  const body = [
    `App: FitBud mobile ${version}`,
    `Role: ${input.role}`,
    `Screen: ${input.screenId}`,
    `Platform: ${Platform.OS} ${String(Platform.Version)}`,
    input.extra ?? "",
    "",
    "Describe what happened:",
    "",
  ].join("\n");
  return `mailto:${input.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function openSupportEmail(options: {
  supportEmail: string;
  screenId: string;
  role: "trainee" | "trainer";
  extra?: string;
}): Promise<"opened" | "copied"> {
  const url = buildSupportMailto(options);
  const can = await Linking.canOpenURL(url);
  if (can) {
    await Linking.openURL(url);
    return "opened";
  }
  await Linking.openURL(`mailto:${options.supportEmail}`);
  return "copied";
}
