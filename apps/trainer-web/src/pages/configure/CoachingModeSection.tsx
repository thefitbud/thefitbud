import { Link } from "react-router-dom";
import { Link2, MapPin, Video, type LucideIcon } from "lucide-react";
import type { CoachingMode } from "@fitbud/contracts";
import { COACHING_MODE_LABELS } from "../client-settings/clientSettingsFormat";
import { Button } from "../../components/Button";
import { COACHING_MODES, type CoachingModeState } from "./useCoachingMode";
import type { SectionStatus } from "./sectionStatus";

const MODE_ICON: Record<CoachingMode, LucideIcon> = {
  online: Video,
  hybrid: Link2,
  in_person: MapPin,
};

/** Frame IP-07, kept to what is tracked: no sessions, packages or places. */
const MODE_HELP: Record<CoachingMode, string> = {
  online: "Plans, check-ins and logs all happen in the app.",
  hybrid: "App coaching, plus some of your time together in person.",
  in_person: "You mostly coach in person. Meals and check-ins stay in the app.",
};

export function coachingModeLabel(mode: CoachingMode | null): string {
  return mode ? COACHING_MODE_LABELS[mode] : "Not set";
}

export function coachingModeStatus(
  state: Pick<CoachingModeState, "subscription" | "dirty">,
): SectionStatus | undefined {
  if (!state.subscription) return undefined;
  if (state.dirty) return "editing";
  return state.subscription.coachingMode ? "done" : "todo";
}

/** Body of the Coaching mode row (frame IP-07). */
export function CoachingModeSection({
  state,
  disabled,
  firstName,
  settingsTo,
}: {
  state: CoachingModeState;
  /** Ended client or offline: read only. */
  disabled: boolean;
  firstName: string;
  settingsTo: string;
}) {
  if (state.loading) {
    return <p className="muted">Loading coaching mode…</p>;
  }
  if (state.loadFailed) {
    return (
      <p className="muted" role="status">
        Could not load the coaching mode. Reload the page to try again.
      </p>
    );
  }
  if (!state.subscription) {
    return (
      <p className="muted" data-testid="coaching-mode-no-subscription">
        {firstName} has no subscription yet. Add one in{" "}
        <Link to={settingsTo}>Client settings</Link>, then set the coaching
        mode here.
      </p>
    );
  }

  return (
    <div className="configure-mode" data-testid="coaching-mode-section">
      <div
        className="configure-mode-options"
        role="radiogroup"
        aria-label="Coaching mode"
      >
        {COACHING_MODES.map((mode) => {
          const Icon = MODE_ICON[mode];
          const selected = state.draft === mode;
          return (
            <label
              key={mode}
              className={`configure-mode-card${selected ? " is-selected" : ""}`}
            >
              <input
                type="radio"
                name="coachingMode"
                value={mode}
                checked={selected}
                disabled={disabled || state.saving}
                onChange={() => state.setDraft(mode)}
              />
              <span className="configure-mode-title">
                <Icon size={15} strokeWidth={2} aria-hidden="true" />
                {COACHING_MODE_LABELS[mode]}
              </span>
              <span className="configure-mode-help">{MODE_HELP[mode]}</span>
            </label>
          );
        })}
      </div>
      <p className="cs-field-help">
        A note on {firstName}&apos;s subscription, also shown in{" "}
        <Link to={settingsTo}>Client settings</Link>. It changes no plan,
        reminder or check-in.
      </p>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.dirty && !disabled ? (
        <div className="configure-mode-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={state.discard}
            disabled={state.saving}
          >
            Discard
          </Button>
          <Button
            type="button"
            onClick={() => {
              void state.save();
            }}
            disabled={state.saving}
          >
            {state.saving ? "Saving…" : "Save coaching mode"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
