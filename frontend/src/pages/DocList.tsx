import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function DocList() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const { user } = useAuth();
  const currentLocale = locale || "en";

  return (
    <div className="doc-list">
      <h1>{t("docs.title")}</h1>
      <p>
        {currentLocale === "zh"
          ? "请从左侧目录选择一篇文档。"
          : "Select a document from the sidebar."}
      </p>
      {user?.is_admin && (
        <Link to={`/docs/${currentLocale}/new`} className="btn btn-primary" style={{ marginTop: 16, display: "inline-block" }}>
          {t("docs.create")}
        </Link>
      )}
    </div>
  );
}
