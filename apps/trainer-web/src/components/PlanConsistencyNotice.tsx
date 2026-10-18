import { Link } from "react-router-dom";
import type { ConsistencyWarning } from "@fitbud/contracts";

/** Amber attention banner: the plan and the coaching configuration disagree. */
export function PlanConsistencyNotice({
  warnings,
  acknowledged,
  acting = false,
  onAcknowledge,
  onAdjustPlan,
  planTo,
  configureTo,
  showPlanLink,
  showConfigureLink,
}: {
  warnings: readonly ConsistencyWarning[];
  acknowledged: boolean;
  acting?: boolean;
  onAcknowledge?: () => void;
  onAdjustPlan?: () => void;
  planTo: string;
  configureTo: string;
  showPlanLink: boolean;
  showConfigureLink: boolean;
}) {
  if (warnings.length === 0 || acknowledged) return null;
  return (
    <section
      className="attention-banner"
      role="status"
      aria-label="Plan and configuration difference"
      data-testid="plan-consistency"
    >
      <div className="attention-banner-copy">
        <h3>Plan and configuration differ</h3>
        <ul>
          {warnings.map((warning) => (
            <li key={warning.code}>{warning.message}</li>
          ))}
        </ul>
      </div>
      <div className="attention-banner-actions">
        {showPlanLink ? (
          onAdjustPlan ? (
            <button type="button" className="button-secondary" disabled={acting} onClick={onAdjustPlan}>
              Adjust plan
            </button>
          ) : (
            <Link className="button-secondary" to={planTo}>
              Adjust plan
            </Link>
          )
        ) : null}
        {showConfigureLink ? (
          <Link className="button-secondary" to={configureTo}>
            Adjust configuration
          </Link>
        ) : null}
        {onAcknowledge ? (
          <button type="button" className="button-ghost" disabled={acting} onClick={onAcknowledge}>
            Acknowledge the difference
          </button>
        ) : null}
      </div>
    </section>
  );
}
