import { useStepsSync } from "./useStepsSync";

/**
 * Today's steps slot. It keeps the native steps sync running while the trainee
 * app is open (Z9-9) and draws nothing: the Steps chip on Today reads the
 * server (`GET /me/steps/today`, D-W9-3), and the setup screens are Z9-10.
 */
export function StepsCard() {
  useStepsSync();
  return null;
}
