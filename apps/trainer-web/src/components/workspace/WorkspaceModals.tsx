import { NoteComposer } from "../NoteComposer";
import { CoachingLifecycleModals } from "../coaching/CoachingLifecycleModals";
import { ResponsivenessPanel } from "./ResponsivenessPanel";

export type WorkspaceModal =
  | { type: "note" }
  | { type: "end" }
  | { type: "reactivate" }
  | { type: "responsiveness" }
  | null;

export function WorkspaceModals({
  relationshipId,
  traineeName,
  modal,
  onClose,
  onChanged,
}: {
  relationshipId: string;
  traineeName: string;
  modal: WorkspaceModal;
  onClose: () => void;
  onChanged: () => void;
}) {
  if (!modal) return null;

  if (modal.type === "note") {
    return (
      <div className="drawer-backdrop" onClick={onClose}>
        <aside className="drawer-panel" onClick={(e) => e.stopPropagation()}>
          <header className="drawer-head">
            <h2>Add note for {traineeName}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>
          <NoteComposer
            relationshipId={relationshipId}
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
        <aside className="drawer-panel" onClick={(e) => e.stopPropagation()}>
          <header className="drawer-head">
            <h2>Reminders</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>
          <ResponsivenessPanel relationshipId={relationshipId} />
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
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}
