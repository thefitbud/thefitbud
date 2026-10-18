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
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  screenTestId?: string;
  showGlimpse?: boolean;
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
        <div className="auth-fcard">
          <div className="auth-mark-tile" aria-hidden="true">
            <BrandMark size={30} />
          </div>
          <h1 className="auth-form-title">{title}</h1>
          {lead ? <p className="auth-lead">{lead}</p> : null}
          {children}
        </div>
        <p className="auth-help">
          Trouble signing in?{" "}
          <a
            className="link"
            href={`mailto:${supportEmail}?subject=${encodeURIComponent("FitBud support · Trainer web · TW-01")}`}
          >
            Need help?
          </a>
        </p>
      </section>
    </main>
  );
}
