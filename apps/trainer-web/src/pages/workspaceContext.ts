import type { ClientWorkspace } from "@fitbud/contracts";

/** Loaded once by the client workspace layout and read by its child routes. */
export type WorkspaceOutletContext = {
  workspace: ClientWorkspace | null;
  workspaceLoading: boolean;
  workspaceError: string | null;
  refreshEpoch: number;
  reloadWorkspace: () => void;
};
