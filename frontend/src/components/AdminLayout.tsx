import { Outlet, Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LangSwitch } from "./LangSwitch";
import { useAuth } from "../lib/auth";

export function AdminLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <>
      <header className="nav">
        <div className="nav-left">
          <Link to="/docs/en" className="nav-title">Buckyball Docs</Link>
        </div>
        <div className="nav-right">
          <LangSwitch />
          {user && (
            <div className="nav-user">
              <img src={user.avatar_url} alt="" className="nav-avatar" />
              <span>{user.login}</span>
              <Link to="/docs/en" className="nav-link">{t("nav.docs")}</Link>
              <button onClick={logout} className="nav-link">{t("nav.logout")}</button>
            </div>
          )}
        </div>
      </header>
      <div className="admin-layout-wrap">
        <nav className="admin-side">
          <ul>
            <li>
              <Link to="/admin" className={location.pathname === "/admin" ? "active" : ""}>
                {t("admin.manageAdmins")}
              </Link>
            </li>
          </ul>
        </nav>
        <main className="admin-page">
          <Outlet />
        </main>
      </div>
    </>
  );
}
