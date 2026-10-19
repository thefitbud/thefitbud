import type { ClientWorkspace } from "@fitbud/contracts";

export function isWorkspaceReadOnly(workspace: ClientWorkspace | null): boolean {
  return workspace?.header.onboardingStatus === "ended";
}

/** @deprecated Use isWorkspaceReadOnly */
export function useWorkspaceReadOnly(workspace: ClientWorkspace | null): boolean {
  return isWorkspaceReadOnly(workspace);
}
