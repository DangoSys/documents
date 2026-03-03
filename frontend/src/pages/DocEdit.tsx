import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import gfm from "@bytemd/plugin-gfm";
import highlight from "@bytemd/plugin-highlight";
import "bytemd/dist/index.css";
import { api } from "../lib/api";

const plugins = [gfm(), highlight()];

export function DocEdit() {
  const { locale, "*": rawPath } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentLocale = locale || "en";

  const path = rawPath || "";
  const isNew = !path;

  const contentRef = useRef("");
  const [sha, setSha] = useState("");
  const [newPath, setNewPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const wrapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const mountedRef = useRef(false);

  // Mount ByteMD once, never re-create
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || mountedRef.current) return;

    import("bytemd").then(({ Editor }) => {
      if (!wrap || mountedRef.current) return;
      mountedRef.current = true;

      const ed = new (Editor as any)({
        target: wrap,
        props: { value: contentRef.current, plugins, mode: "tab" },
      });
      ed.$on("change", (e: any) => {
        contentRef.current = e.detail.value;
        ed.$set({ value: e.detail.value });
      });
      editorRef.current = ed;
    });

    return () => {
      editorRef.current?.$destroy();
      editorRef.current = null;
      mountedRef.current = false;
    };
  }, []);

  // When loading existing doc, push content into the editor
  useEffect(() => {
    if (isNew) return;
    api
      .getDoc(currentLocale, path)
      .then((doc) => {
        contentRef.current = doc.content;
        setSha(doc.sha);
        editorRef.current?.$set?.({ value: doc.content });
      })
      .catch((e) => setError(e.message));
  }, [currentLocale, path, isNew]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError("");
    const content = contentRef.current;
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
  }, [isNew, newPath, currentLocale, path, sha, navigate]);

  return (
    <div className="doc-edit">
      <div className="edit-top">
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
      </div>
      <div className="edit-wrap" ref={wrapRef} />
      <div className="edit-actions">
        <button onClick={handleSave} className="btn btn-brand" disabled={saving}>
          {t("docs.save")}
        </button>
        <button onClick={() => navigate(-1)} className="btn">
          {t("docs.cancel")}
        </button>
      </div>
    </div>
  );
}
