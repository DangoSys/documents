import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function DocList() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const { user } = useAuth();
  const currentLocale = locale || "en";

  return (
    <div className="doc-welcome">
      <h1>{t("docs.title")}</h1>
      <p>{t("docs.selectHint")}</p>
      {user?.is_admin && (
        <Link to={`/docs/${currentLocale}/new`} className="btn btn-brand">
          {t("docs.create")}
        </Link>
      )}
    </div>
  );
}
