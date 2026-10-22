import type { ReactNode } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";

export type BuilderMode = "wide" | "narrow" | "small";

/** ≥1280 three panes; 1024–1279 library becomes a drawer; <1024 read-only. */
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
  smallScreen,
  footer,
}: {
  mode: BuilderMode;
  topbar: ReactNode;
  banner?: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
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
            <h2>Open on a larger screen</h2>
            <p>
              Editing plans needs more room. You can read this plan here, and edit it on a
              screen at least 1024 px wide.
            </p>
          </div>
          {smallScreen}
        </div>
      ) : (
        <div className="builder-panes">
          <div className="builder-pane builder-left">{left}</div>
          <div className="builder-pane builder-center">
            {center}
            {footer}
          </div>
          {mode === "wide" ? (
            <div className="builder-pane builder-right">{right}</div>
          ) : (
            right
          )}
        </div>
      )}
    </div>
  );
}
