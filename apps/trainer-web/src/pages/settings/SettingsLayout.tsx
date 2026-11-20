import { NavLink, Outlet } from "react-router-dom";
import {
  Bell,
  Briefcase,
  Globe,
  Shield,
  User,
  UserX,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import "./settings.css";

const NAV: Array<{ to: string; label: string; icon: LucideIcon; testId: string }> = [
  { to: "/settings/profile", label: "Profile", icon: User, testId: "settings-nav-profile" },
  {
    to: "/settings/notifications",
    label: "Notifications",
    icon: Bell,
    testId: "settings-nav-notifications",
  },
  {
    to: "/settings/business",
    label: "Business and packages",
    icon: Briefcase,
    testId: "settings-nav-business",
  },
  {
    to: "/settings/units",
    label: "Units and language",
    icon: Globe,
    testId: "settings-nav-units",
  },
  {
    to: "/settings/ended",
    label: "Ended clients",
    icon: UserX,
    testId: "settings-nav-ended",
  },
  {
    to: "/settings/privacy",
    label: "Privacy and data",
    icon: Shield,
    testId: "settings-nav-privacy",
  },
];

export function SettingsLayout() {
  return (
    <section className="settings-page" data-testid="screen-settings">
      <header className="settings-head">
        <h1>Settings</h1>
        <p>Your account, notifications and business</p>
      </header>
      <div className="settings-wrap">
        <nav className="settings-subnav" aria-label="Settings sections">
          {NAV.map(({ to, label, icon: Icon, testId }) => (
            <NavLink key={to} to={to} className={tabClass} data-testid={testId}>
              <Icon className="ui-i" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="settings-stack">
          <Outlet />
        </div>
      </div>
    </section>
  );
}

function tabClass({ isActive }: { isActive: boolean }) {
  return isActive ? "is-on" : undefined;
}

export function SettingsCard({
  title,
  aside,
  footer,
  children,
  testId,
}: {
  title?: string;
  aside?: string;
  footer?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="settings-card" data-testid={testId}>
      {title ? (
        <header className="settings-card-h">
          <h2>{title}</h2>
          {aside ? <span className="aside">{aside}</span> : null}
        </header>
      ) : null}
      <div className="settings-card-b">{children}</div>
      {footer ? <footer className="settings-card-f">{footer}</footer> : null}
    </section>
  );
}

export function SettingsRow({
  label,
  labelId,
  help,
  helpTestId,
  inline = false,
  children,
}: {
  label: string;
  labelId?: string;
  help?: string;
  helpTestId?: string;
  inline?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={inline ? "srow srow-inline" : "srow"}>
      <div className="srow-label">
        <b id={labelId}>{label}</b>
        {help ? <span data-testid={helpTestId}>{help}</span> : null}
      </div>
      <div className="srow-value">{children}</div>
    </div>
  );
}
