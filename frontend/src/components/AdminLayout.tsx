import { Outlet, Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LangSwitch } from "./LangSwitch";
import { useAuth } from "../lib/auth";

export function AdminLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="admin-layout">
      <header className="topbar">
        <Link to="/docs/en" className="logo">
          Buckyball Docs
        </Link>
        <div className="topbar-actions">
          <LangSwitch />
          {user && (
            <div className="user-menu">
              <img src={user.avatar_url} alt="" className="avatar" />
              <span>{user.login}</span>
              <Link to="/docs/en" className="btn-link">
                {t("nav.docs")}
              </Link>
              <button onClick={logout} className="btn-link">
                {t("nav.logout")}
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="admin-main">
        <nav className="admin-sidebar">
          <ul>
            <li>
              <Link
                to="/admin"
                className={location.pathname === "/admin" ? "active" : ""}
              >
                {t("admin.manageAdmins")}
              </Link>
            </li>
          </ul>
        </nav>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
