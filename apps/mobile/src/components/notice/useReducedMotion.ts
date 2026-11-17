import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * The system "Reduce motion" setting, live. False until the first answer and
 * when the platform cannot tell; a failed read never throws.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => {
        if (alive) setReduced(Boolean(value));
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      (value: boolean) => setReduced(Boolean(value)),
    );
    return () => {
      alive = false;
      subscription?.remove?.();
    };
  }, []);
  return reduced;
}
