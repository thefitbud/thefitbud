import { Platform } from "react-native";
import { StepsSetupView } from "./StepsSetupView";
import {
  useStepsSetup,
  type StepsSetupPlatform,
  type StepsSetupState,
} from "./useStepsSetup";

type Props = {
  coachName: string;
  onBack: () => void;
};

/**
 * Dev-only: on Expo web the native health modules do not exist, so the
 * visual check picks a state with `?stepsSetupPreview=ios_connect` (also
 * `ios_connected`, `android_install`, `android_update`, `android_connect`,
 * `android_denied`, `android_connected`). Never read outside `__DEV__` on web.
 */
export function devPreview(search: string): { platform: StepsSetupPlatform; state: StepsSetupState } | null {
  const key = new URLSearchParams(search).get("stepsSetupPreview");
  switch (key) {
    case "ios_connect":
      return { platform: "ios", state: { kind: "connect", denied: false } };
    case "ios_connected":
      return { platform: "ios", state: { kind: "connected" } };
    case "android_install":
      return { platform: "android", state: { kind: "install", reason: "not_installed" } };
    case "android_update":
      return { platform: "android", state: { kind: "install", reason: "needs_update" } };
    case "android_connect":
      return { platform: "android", state: { kind: "connect", denied: false } };
    case "android_denied":
      return { platform: "android", state: { kind: "connect", denied: true } };
    case "android_connected":
      return { platform: "android", state: { kind: "connected" } };
    default:
      return null;
  }
}

function previewFromLocation() {
  if (typeof __DEV__ === "undefined" || !__DEV__ || Platform.OS !== "web") return null;
  if (typeof window === "undefined") return null;
  return devPreview(window.location.search);
}

/** The steps setup: Apple Health permission on iOS, install or open Health Connect on Android. */
export function StepsSetupScreen({ coachName, onBack }: Props) {
  const model = useStepsSetup();
  const preview = previewFromLocation();
  return (
    <StepsSetupView
      platform={preview?.platform ?? model.platform}
      state={preview?.state ?? model.state}
      coachName={coachName}
      busy={model.busy}
      notice={model.notice}
      onBack={onBack}
      onInstall={model.install}
      onConnect={model.connect}
    />
  );
}
