import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import "highlight.js/styles/github.css";
import { api, DocFile } from "../lib/api";
import { useAuth } from "../lib/auth";

export function DocView() {
  const { locale, "*": docPath } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState("");

  const currentLocale = locale || "en";
  const path = docPath || "";

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .getDoc(currentLocale, path)
      .then(setDoc)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [currentLocale, path]);

  const handleTranslate = async () => {
    if (!doc) return;
    const targetLocale = currentLocale === "en" ? "zh" : "en";
    setTranslating(true);
    try {
      const result = await api.translate(doc.content, targetLocale);
      // Check if target file exists
      let existingSha: string | undefined;
      try {
        const existing = await api.getDoc(targetLocale, path);
        existingSha = existing.sha;
      } catch {
        // File doesn't exist yet, will create
      }
      if (existingSha) {
        await api.updateDoc(targetLocale, path, result.translated, existingSha, `Translate ${path} to ${targetLocale}`);
      } else {
        await api.createDoc(targetLocale, path, result.translated, `Translate ${path} to ${targetLocale}`);
      }
      navigate(`/docs/${targetLocale}/${path}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTranslating(false);
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    if (!window.confirm(t("docs.confirmDelete"))) return;
    try {
      await api.deleteDoc(currentLocale, path, doc.sha);
      navigate(`/docs/${currentLocale}`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!doc) return null;

  const targetLocale = currentLocale === "en" ? "zh" : "en";
  const targetLang = t(`lang.${targetLocale}`);

  return (
    <div className="doc-view">
      {user?.is_admin && (
        <div className="doc-toolbar">
          <button onClick={() => navigate(`/edit/${currentLocale}/${path}`)} className="btn">
            {t("docs.edit")}
          </button>
          <button onClick={handleTranslate} className="btn" disabled={translating}>
            {translating ? t("docs.translating") : t("docs.translateTo", { lang: targetLang })}
          </button>
          <button onClick={handleDelete} className="btn btn-danger">
            {t("docs.delete")}
          </button>
        </div>
      )}
      <article className="vp-doc">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeHighlight]}>{doc.content}</ReactMarkdown>
      </article>
    </div>
  );
}
