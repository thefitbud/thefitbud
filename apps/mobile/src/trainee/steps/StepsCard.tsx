import { useConfig } from "../../providers/ConfigProvider";
import { isStepsEnabled } from "../../lib/config";

/** Hidden until Health Connect / HealthKit is wired (TR-25). Respects `steps_enabled`. */
export function StepsCard() {
  const { config } = useConfig();
  if (!isStepsEnabled(config)) return null;
  return null;
}
