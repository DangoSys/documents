import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";

export function DocEdit() {
  const { locale, "*": rawPath } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentLocale = locale || "en";

  const path = rawPath || "";
  const isNew = !path;

  const [content, setContent] = useState("");
  const [sha, setSha] = useState("");
  const [newPath, setNewPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isNew) return;
    api
      .getDoc(currentLocale, path)
      .then((doc) => {
        setContent(doc.content);
        setSha(doc.sha);
      })
      .catch((e) => setError(e.message));
  }, [currentLocale, path, isNew]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      if (isNew) {
        if (!newPath.trim()) {
          setError("Path is required");
          setSaving(false);
          return;
        }
        const finalPath = newPath.endsWith(".md") ? newPath : `${newPath}.md`;
        await api.createDoc(currentLocale, finalPath, content);
        navigate(`/docs/${currentLocale}/${finalPath}`);
      } else {
        await api.updateDoc(currentLocale, path, content, sha);
        navigate(`/docs/${currentLocale}/${path}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="doc-edit">
      {isNew && (
        <input
          type="text"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          placeholder={t("docs.path")}
          className="input path-input"
        />
      )}
      {error && <div className="error">{error}</div>}
      <div className="editor-container">
        <textarea
          className="editor-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        </div>
      <div className="editor-actions">
        <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
          {t("docs.save")}
        </button>
        <button onClick={() => navigate(-1)} className="btn">
          {t("docs.cancel")}
        </button>
      </div>
    </div>
  );
}
