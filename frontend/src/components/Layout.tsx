import { useState } from "react";
import { Outlet, Link, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import { LangSwitch } from "./LangSwitch";
import { Sidebar } from "./Sidebar";

export function Layout() {
  const { t } = useTranslation();
  const { user, login, logout } = useAuth();
  const { locale } = useParams();
  const nav = useNavigate();
  const loc = locale || "en";
  const [open, setOpen] = useState(true);

  const switchLocale = (l: string) => {
    nav(window.location.pathname.replace(`/docs/${loc}`, `/docs/${l}`));
  };

  return (
    <>
      <header className="nav">
        <div className="nav-left">
          <button className="nav-hamburger" onClick={() => setOpen(!open)}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z" />
            </svg>
          </button>
          <Link to={`/docs/${loc}`} className="nav-title">Buckyball Docs</Link>
        </div>
        <div className="nav-right">
          <button className={`nav-locale-btn${loc === "en" ? " active" : ""}`} onClick={() => switchLocale("en")}>EN</button>
          <button className={`nav-locale-btn${loc === "zh" ? " active" : ""}`} onClick={() => switchLocale("zh")}>中文</button>
          <span className="nav-sep" />
          <LangSwitch />
          {user ? (
            <div className="nav-user">
              <img src={user.avatar_url} alt="" className="nav-avatar" />
              <span>{user.login}</span>
              {user.is_admin && <Link to="/admin" className="nav-link">{t("nav.admin")}</Link>}
              <button onClick={logout} className="nav-link">{t("nav.logout")}</button>
            </div>
          ) : (
            <button onClick={login} className="nav-link">{t("nav.login")}</button>
          )}
        </div>
      </header>
      <div className="layout">
        {open && <Sidebar locale={loc} />}
        <main className="page">
          <Outlet />
        </main>
      </div>
    </>
  );
}
