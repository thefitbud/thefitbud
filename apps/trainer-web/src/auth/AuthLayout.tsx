import type { ReactNode } from "react";
import { Users } from "lucide-react";
import { BrandMark } from "../components/BrandMark";
import { useConfig } from "../lib/config";

export function AuthLayout({
  title,
  lead = "Sign in to your FitBud workspace.",
  children,
  screenTestId,
  showGlimpse = true,
  footer,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  screenTestId?: string;
  showGlimpse?: boolean;
  /** Links-only footer rendered below the help line (D-W3-15). */
  footer?: ReactNode;
}) {
  const { config } = useConfig();
  const supportEmail = config?.supportEmail ?? "tech@thefitbud.com";

  return (
    <main className="auth-split" data-testid={screenTestId}>
      <section className="auth-brandside" aria-hidden="true">
        <div className="auth-logo">
          <BrandMark size={40} variant="inverse" />
          <b>FitBud</b>
        </div>
        <div className="auth-pitch">
          <span className="auth-eyebrow">
            <Users size={14} strokeWidth={2} aria-hidden="true" />
            For trainers
          </span>
          <p className="auth-brand-headline">See who needs you today.</p>
          <p>Progress, guided.</p>
          {showGlimpse ? (
            <div className="auth-glimpse">
              <div className="auth-glimpse-inner">
                <div className="auth-glimpse-head">
                  <span className="t-h3">Needs attention</span>
                  <span className="auth-count">3</span>
                </div>
                <div className="auth-glimpse-row">
                  <span className="auth-glimpse-who">
                    <span className="av c3">RM</span>Rohan Mehta
                  </span>
                  <span>Missed 2 workouts</span>
                  <span className="chip crit">Critical</span>
                </div>
                <div className="auth-glimpse-row">
                  <span className="auth-glimpse-who">
                    <span className="av c6">NR</span>Neha Reddy
                  </span>
                  <span>Breakfast not logged (Sat)</span>
                  <span className="chip attn">Attention</span>
                </div>
                <div className="auth-glimpse-row">
                  <span className="auth-glimpse-who">
                    <span className="av c7">PS</span>Priya Sharma
                  </span>
                  <span>Check-in submitted · Fri</span>
                  <span className="chip info">To review</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <p className="auth-legal">
          Your clients log in the FitBud app. You coach from here.
        </p>
      </section>

      <section className="auth-formside">
        {/* Column stack: card centred, then help line, then footer, all in normal flow (D-W3-15).
            The negative bottom margin cancels .auth-formside's bottom padding
            down to --auth-legal-bottom (the BT3f remainder that matches
            ds5-web-signin-footer.png). Both values come from that custom
            property, so the offset scales with the root font (CU8). */}
        <div
          className="auth-form-stack"
          style={{
            alignSelf: "stretch",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom:
              "calc(var(--auth-legal-bottom) - var(--auth-formside-pad-bottom))",
          }}
        >
          <div
            style={{
              flex: 1,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div className="auth-fcard">
              <div className="auth-mark-tile" aria-hidden="true">
                <BrandMark size={30} />
              </div>
              <h1 className="auth-form-title">{title}</h1>
              {lead ? <p className="auth-lead">{lead}</p> : null}
              {children}
            </div>
          </div>
          {/* Z5-16: 0.8125rem is 13px at the default root and follows the
              user's browser font size. With the legal footer below, the
              link's 44px target grows upward (text on its bottom edge, tight
              line height), so the help row sits where
              ds5-web-signin-footer.png puts it, just above the legal row,
              without the two targets overlapping. Inline because .auth-help
              is styled in styles.css, outside this task's files. */}
          <p
            className="auth-help"
            style={
              footer
                ? { fontSize: "0.8125rem", lineHeight: 1 }
                : { fontSize: "0.8125rem" }
            }
          >
            Trouble signing in?{" "}
            <a
              className="link"
              style={footer ? { alignItems: "flex-end" } : undefined}
              href={`mailto:${supportEmail}?subject=${encodeURIComponent("FitBud support · Trainer web · TW-01")}`}
            >
              Need help?
            </a>
          </p>
          {footer}
        </div>
      </section>
    </main>
  );
}
