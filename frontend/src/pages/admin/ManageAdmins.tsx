import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

export function ManageAdmins() {
  const { t } = useTranslation();
  const [admins, setAdmins] = useState<string[]>([]);
  const [newAdmin, setNewAdmin] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.getAdmins().then((data) => setAdmins(data.admins));
  }, []);

  const addAdmin = () => {
    const name = newAdmin.trim();
    if (name && !admins.includes(name)) {
      setAdmins([...admins, name]);
      setNewAdmin("");
    }
  };

  const removeAdmin = (name: string) => {
    setAdmins(admins.filter((a) => a !== name));
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api.updateAdmins(admins);
      setMessage("Saved!");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="manage-admins">
      <h2>{t("admin.admins")}</h2>
      <ul className="admin-list">
        {admins.map((a) => (
          <li key={a}>
            <span>{a}</span>
            <button onClick={() => removeAdmin(a)} className="btn btn-danger btn-sm">
              {t("admin.remove")}
            </button>
          </li>
        ))}
      </ul>
      <div className="add-admin-row">
        <input
          type="text"
          value={newAdmin}
          onChange={(e) => setNewAdmin(e.target.value)}
          placeholder={t("admin.usernamePlaceholder")}
          className="input"
          onKeyDown={(e) => e.key === "Enter" && addAdmin()}
        />
        <button onClick={addAdmin} className="btn">
          {t("admin.addAdmin")}
        </button>
      </div>
      <button onClick={save} className="btn btn-primary" disabled={saving}>
        {t("admin.save")}
      </button>
      {message && <p className="message">{message}</p>}
    </div>
  );
}
