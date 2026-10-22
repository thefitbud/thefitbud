import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";

export function SettingsLayout() {
  const { signOut } = useAuth();
  return (
    <section className="page settings-page">
      <header className="page-header">
        <h1>Settings</h1>
      </header>
      <div className="settings-layout">
        <nav className="settings-side-nav" aria-label="Settings sections">
          <NavLink to="/settings/profile" className={tabClass}>
            Profile
          </NavLink>
          <NavLink to="/settings/notifications" className={tabClass}>
            Notifications
          </NavLink>
          <NavLink to="/settings/ended" className={tabClass}>
            Ended clients
          </NavLink>
          <NavLink to="/settings/units" className={tabClass}>
            Units &amp; language
          </NavLink>
          <NavLink to="/settings/help" className={tabClass}>
            Help
          </NavLink>
          <NavLink to="/settings/privacy" className={tabClass}>
            Privacy &amp; data
          </NavLink>
          <button
            type="button"
            className="settings-tab settings-signout button-danger"
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
