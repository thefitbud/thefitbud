import { NavLink, Outlet } from "react-router-dom";

export function SettingsLayout() {
  return (
    <section className="page settings-page">
      <header className="page-header">
        <h1>Settings</h1>
      </header>
      <nav className="settings-tabs" aria-label="Settings sections">
        <NavLink to="/settings/profile" className={tabClass}>
          Profile
        </NavLink>
        <NavLink to="/settings/notifications" className={tabClass}>
          Notifications
        </NavLink>
      </nav>
      <Outlet />
    </section>
  );
}

function tabClass({ isActive }: { isActive: boolean }) {
  return isActive ? "settings-tab is-active" : "settings-tab";
}
