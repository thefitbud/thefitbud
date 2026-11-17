import { NavLink, Outlet } from "react-router-dom";
import {
  Bell,
  CircleHelp,
  Globe,
  Shield,
  User,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../auth/AuthProvider";
import "./settings.css";

const NAV: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/settings/profile", label: "Profile", icon: User },
  { to: "/settings/notifications", label: "Notifications", icon: Bell },
  { to: "/settings/ended", label: "Ended clients", icon: UserX },
  { to: "/settings/units", label: "Units & language", icon: Globe },
  { to: "/settings/help", label: "Help", icon: CircleHelp },
  { to: "/settings/privacy", label: "Privacy & data", icon: Shield },
];

export function SettingsLayout() {
  const { signOut } = useAuth();
  return (
    <section className="page settings-page">
      <header className="page-header">
        <h1>Settings</h1>
      </header>
      <div className="settings-layout">
        <nav className="settings-side-nav" aria-label="Settings sections">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={tabClass}>
              <Icon className="settings-tab-icon" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
          <button
            type="button"
            className="settings-tab settings-signout"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </nav>
        <div className="settings-content">
          <Outlet />
        </div>
      </div>
    </section>
  );
}

function tabClass({ isActive }: { isActive: boolean }) {
  return isActive ? "settings-tab is-active" : "settings-tab";
}
