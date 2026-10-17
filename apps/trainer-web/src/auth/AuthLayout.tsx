import type { ReactNode } from "react";
import { useConfig } from "../lib/config";

export function AuthLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { config } = useConfig();
  const supportEmail = config?.supportEmail ?? "tech@thefitbud.com";

  return (
    <main className="auth-split">
      <section className="auth-brand-panel" aria-hidden="true">
        <div className="auth-brand-inner">
          <img
            className="auth-brand-mark"
            src="/favicon-32.png"
            width={48}
            height={48}
            alt=""
          />
          <p className="auth-brand-tagline">Progress, guided.</p>
          <p className="auth-brand-lede">See who needs you today.</p>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-card">
          <header className="auth-card-head">
            <img src="/favicon-32.png" width={32} height={32} alt="FitBud" />
            <h1>{title}</h1>
          </header>
          {children}
          <p className="auth-footnote">
            Trainer accounts only. Clients use the FitBud app.
          </p>
          <p className="auth-support">
            <a href={`mailto:${supportEmail}`}>Need help?</a>
          </p>
        </div>
      </section>
    </main>
  );
}
