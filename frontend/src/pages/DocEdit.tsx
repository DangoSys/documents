import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import gfm from "@bytemd/plugin-gfm";
import highlight from "@bytemd/plugin-highlight";
import "bytemd/dist/index.css";
import { api, ImageItem } from "../lib/api";

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

  // Image management state
  const [images, setImages] = useState<ImageItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [imagesPanelOpen, setImagesPanelOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Load images when panel is opened
  const loadImages = useCallback(async () => {
    if (!path) return;
    try {
      const res = await api.listImages(currentLocale, path);
      setImages(res.images);
    } catch {
      // images folder may not exist yet
      setImages([]);
    }
  }, [currentLocale, path]);

  useEffect(() => {
    if (imagesPanelOpen && !isNew) loadImages();
  }, [imagesPanelOpen, isNew, loadImages]);

  const handleUpload = useCallback(async (file: File) => {
    if (!path) return;
    setUploading(true);
    try {
      await api.uploadImage(currentLocale, path, file);
      await loadImages();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }, [currentLocale, path, loadImages]);

  const handleDeleteImage = useCallback(async (img: ImageItem) => {
    if (!window.confirm(t("docs.confirmDeleteImage", { name: img.name }))) return;
    try {
      await api.deleteImage(currentLocale, img.path, img.sha);
      await loadImages();
    } catch (e: any) {
      setError(e.message);
    }
  }, [currentLocale, loadImages, t]);

  const copyMarkdownLink = useCallback((img: ImageItem) => {
    const url = api.imageUrl(currentLocale, img.path);
    navigator.clipboard.writeText(`![${img.name}](${url})`);
  }, [currentLocale]);

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

      {/* Image management panel */}
      {!isNew && (
        <div className="image-panel">
          <button
            className="btn btn-sm"
            onClick={() => setImagesPanelOpen((v) => !v)}
          >
            {imagesPanelOpen ? t("docs.hideImages") : t("docs.manageImages")}
          </button>
          {imagesPanelOpen && (
            <div className="image-panel-body">
              <div className="image-upload-row">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = "";
                  }}
                />
                <button
                  className="btn btn-sm btn-brand"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? t("docs.uploading") : t("docs.uploadImage")}
                </button>
              </div>
              {images.length === 0 ? (
                <div className="image-empty">{t("docs.noImages")}</div>
              ) : (
                <div className="image-grid">
                  {images.map((img) => (
                    <div key={img.path} className="image-card">
                      <img
                        src={api.imageUrl(currentLocale, img.path)}
                        alt={img.name}
                        className="image-thumb"
                      />
                      <div className="image-name" title={img.name}>{img.name}</div>
                      <div className="image-actions">
                        <button
                          className="btn btn-sm"
                          onClick={() => copyMarkdownLink(img)}
                          title={t("docs.copyLink")}
                        >
                          {t("docs.copyLink")}
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDeleteImage(img)}
                        >
                          {t("docs.delete")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
