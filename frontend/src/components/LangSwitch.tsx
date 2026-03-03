import { useTranslation } from "react-i18next";

export function LangSwitch() {
  const { i18n } = useTranslation();

  const toggle = () => {
    i18n.changeLanguage(i18n.language === "en" ? "zh" : "en");
  };

  return (
    <button className="lang-switch" onClick={toggle}>
      {i18n.language === "en" ? "中文" : "EN"}
    </button>
  );
}
