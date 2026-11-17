import type { ReactNode } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";

export type BuilderMode = "wide" | "narrow" | "small";

/** ≥1280 three panes; 1024–1279 center + properties, library drawer; <1024 read-only. */
export function useBuilderMode(): BuilderMode {
  const small = useMediaQuery("(max-width: 1023px)");
  const narrow = useMediaQuery("(max-width: 1279px)");
  if (small) return "small";
  return narrow ? "narrow" : "wide";
}

export function BuilderLayout({
  mode,
  topbar,
  banner,
  left,
  center,
  right,
  overlay,
  smallScreen,
  footer,
}: {
  mode: BuilderMode;
  topbar: ReactNode;
  banner?: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  /** Narrow-mode library drawer (fixed overlay), rendered outside the pane grid. */
  overlay?: ReactNode;
  smallScreen: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="builder" data-builder-mode={mode}>
      <header className="builder-topbar">{topbar}</header>
      {banner}
      {mode === "small" ? (
        <div className="builder-small" data-testid="builder-small-screen">
          <div className="builder-small-note" role="status">
            <p>
              <strong>Open on a larger screen to edit.</strong> The builder needs a window at
              least 1024 px wide. You can still read the plan here.
            </p>
          </div>
          {smallScreen}
        </div>
      ) : (
        <>
          <div className="builder-panes">
            {mode === "wide" ? <div className="builder-pane builder-left">{left}</div> : null}
            <div className="builder-pane builder-center">
              {center}
              {footer}
            </div>
            <div className="builder-pane builder-right">{right}</div>
          </div>
          {overlay}
        </>
      )}
    </div>
  );
}
