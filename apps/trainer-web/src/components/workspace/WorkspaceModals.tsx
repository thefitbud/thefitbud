import type { TrainerNote } from "@fitbud/contracts";
import { NoteComposer } from "../NoteComposer";
import { CoachingLifecycleModals } from "../coaching/CoachingLifecycleModals";
import { ResponsivenessPanel } from "./ResponsivenessPanel";

export type WorkspaceModal =
  | { type: "note"; note?: TrainerNote }
  | { type: "end" }
  | { type: "reactivate" }
  | { type: "responsiveness" }
  | null;

export function WorkspaceModals({
  relationshipId,
  traineeName,
  traineeGender,
  lastPlanTitle,
  clientWhatsappE164,
  ended = false,
  modal,
  onClose,
  onChanged,
}: {
  relationshipId: string;
  traineeName: string;
  traineeGender?: string | null;
  lastPlanTitle?: string | null;
  clientWhatsappE164?: string | null;
  ended?: boolean;
  modal: WorkspaceModal;
  onClose: () => void;
  onChanged: () => void;
}) {
  if (!modal) return null;

  if (modal.type === "note") {
    if (ended) {
      return null;
    }
    return (
      <div className="drawer-backdrop" onClick={onClose}>
        <aside className="drawer-panel" data-testid="screen-TW-34" onClick={(e) => e.stopPropagation()}>
          <header className="drawer-head">
            <h2>
              {modal.note ? "Edit note" : "Add note"} for {traineeName}
            </h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>
          <NoteComposer
            relationshipId={relationshipId}
            traineeName={traineeName}
            traineeGender={traineeGender}
            note={modal.note}
            onSaved={onChanged}
            onClose={onClose}
          />
        </aside>
      </div>
    );
  }

  if (modal.type === "responsiveness") {
    return (
      <div className="drawer-backdrop" onClick={onClose}>
        <aside className="drawer-panel" data-testid="screen-TW-31" onClick={(e) => e.stopPropagation()}>
          <header className="drawer-head">
            <h2>Reminders</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>
          <ResponsivenessPanel
            relationshipId={relationshipId}
            gender={traineeGender}
            traineeFirstName={traineeName.trim().split(/\s+/)[0] ?? traineeName}
            clientWhatsappE164={clientWhatsappE164}
          />
        </aside>
      </div>
    );
  }

  if (modal.type === "end") {
    return (
      <CoachingLifecycleModals
        mode="end"
        relationshipId={relationshipId}
        traineeName={traineeName}
        traineeGender={traineeGender}
        onClose={onClose}
        onChanged={onChanged}
      />
    );
  }

  return (
    <CoachingLifecycleModals
      mode="reactivate"
      relationshipId={relationshipId}
      traineeName={traineeName}
      traineeGender={traineeGender}
      lastPlanTitle={lastPlanTitle}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}
