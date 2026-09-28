import type { ReactNode } from "react";
export { colors, radii, spacing, touchTargetMin } from "./theme.js";

/** Placeholder primitive shell for later trainee/trainer mobile UI. */
export type ScreenProps = {
  title: string;
  children?: ReactNode;
};

export function screenTitle(title: string): string {
  return title.trim();
}
