/** Frame 160i: grey bars where the rail rows and the chart panel will be. */
const RAIL_GROUPS = [1, 4, 4, 2];

function Bar({ className }: { className: string }) {
  return <span className={`pg-skel ${className}`} aria-hidden="true" />;
}

export function ProgressSkeleton() {
  return (
    <div className="pg-layout" data-testid="progress-skeleton">
      <p className="sr-only" role="status">
        Loading progress…
      </p>
      <div className="pg-rail workspace-card pg-skel-rail" aria-hidden="true">
        {RAIL_GROUPS.map((rows, group) => (
          <div className="pg-skel-group" key={group}>
            {Array.from({ length: rows }, (_, row) => (
              <div className="pg-skel-row" key={row}>
                <Bar className="pg-skel-label" />
                <Bar className="pg-skel-value" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="pg-panel workspace-card" aria-hidden="true">
        <PanelSkeleton />
      </div>
    </div>
  );
}

/** The panel part alone, while a new range loads. */
export function PanelSkeleton() {
  return (
    <div className="pg-skel-panel" data-testid="panel-skeleton">
      <p className="sr-only" role="status">
        Loading chart…
      </p>
      <Bar className="pg-skel-title" />
      <Bar className="pg-skel-subtitle" />
      <div className="pg-skel-stats" aria-hidden="true">
        {[0, 1, 2, 3].map((stat) => (
          <div key={stat}>
            <Bar className="pg-skel-stat-label" />
            <Bar className="pg-skel-stat-num" />
          </div>
        ))}
      </div>
      <Bar className="pg-skel-chart" />
      <Bar className="pg-skel-line" />
      <Bar className="pg-skel-line" />
      <Bar className="pg-skel-line is-short" />
    </div>
  );
}
