/**
 * Soft rest-end chime (Z12-57 / W-05b). Best effort: missing native module,
 * web, or a failed load must never fail the workout screen.
 */
import { Audio } from "expo-av";
import { Platform } from "react-native";

let loading: Promise<Audio.Sound | null> | null = null;

async function loadSound(): Promise<Audio.Sound | null> {
  if (Platform.OS === "web") return null;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    const { sound } = await Audio.Sound.createAsync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- metro asset
      require("../../../assets/sounds/rest-end.wav"),
      { shouldPlay: false, volume: 0.7 },
    );
    return sound;
  } catch {
    return null;
  }
}

function soundOnce(): Promise<Audio.Sound | null> {
  if (!loading) loading = loadSound();
  return loading;
}

/** Play the rest-end chime once. Failures stay silent. */
export function restEndSound(): void {
  void (async () => {
    try {
      const sound = await soundOnce();
      if (!sound) return;
      await sound.setPositionAsync(0);
      await sound.playAsync();
    } catch {
      // No audio path: haptic alone is enough.
    }
  })();
}
