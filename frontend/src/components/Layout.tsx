import { Outlet, Link, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import { LangSwitch } from "./LangSwitch";
import { Sidebar } from "./Sidebar";

export function Layout() {
  const { t } = useTranslation();
  const { user, login, logout } = useAuth();
  const { locale } = useParams();
  const currentLocale = locale || "en";
  const navigate = useNavigate();

  const switchDocLocale = (newLocale: string) => {
    const path = window.location.pathname;
    const newPath = path.replace(`/docs/${currentLocale}`, `/docs/${newLocale}`);
    navigate(newPath);
  };

  return (
    <div className="app-layout">
      <header className="topbar">
        <Link to={`/docs/${currentLocale}`} className="logo">
          Buckyball Docs
        </Link>
        <div className="topbar-actions">
          <div className="doc-locale-switch">
            <button
              className={currentLocale === "en" ? "active" : ""}
              onClick={() => switchDocLocale("en")}
            >
              EN
            </button>
            <button
              className={currentLocale === "zh" ? "active" : ""}
              onClick={() => switchDocLocale("zh")}
            >
              中文
            </button>
          </div>
          <LangSwitch />
          {user ? (
            <div className="user-menu">
              <img src={user.avatar_url} alt="" className="avatar" />
              <span>{user.login}</span>
              {user.is_admin && (
                <Link to="/admin" className="btn-link">
                  {t("nav.admin")}
                </Link>
              )}
              <button onClick={logout} className="btn-link">
                {t("nav.logout")}
              </button>
            </div>
          ) : (
            <button onClick={login} className="btn-link">
              {t("nav.login")}
            </button>
          )}
        </div>
      </header>
      <div className="main-area">
        <Sidebar locale={currentLocale} />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
