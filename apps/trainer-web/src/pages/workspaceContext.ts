import type { ClientWorkspace } from "@fitbud/contracts";
import type { WorkspaceModal } from "../components/workspace/WorkspaceModals";

/** Loaded once by the client workspace layout and read by its child routes. */
export type WorkspaceOutletContext = {
  workspace: ClientWorkspace | null;
  workspaceLoading: boolean;
  workspaceError: string | null;
  notFound: boolean;
  refreshEpoch: number;
  reloadWorkspace: () => void;
  openWorkspaceModal: (modal: WorkspaceModal) => void;
  relationshipId: string;
  /** False when the browser is offline: mutating CTAs must be disabled. */
  online: boolean;
  /** Coaching ended: workspace is read-only except reactivation. */
  ended: boolean;
};
