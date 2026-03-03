import os
from pathlib import Path

import yaml

_BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file if present
_env_path = _BASE_DIR / ".env"
if _env_path.exists():
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _key, _, _val = _line.partition("=")
            os.environ.setdefault(_key.strip(), _val.strip())

_config_path = _BASE_DIR / "config.yaml"

with open(_config_path, "r") as f:
    _raw = yaml.safe_load(f)

SITE_TITLE: str = _raw["site"]["title"]
DEFAULT_LOCALE: str = _raw["site"]["default_locale"]
SUPPORTED_LOCALES: list[str] = _raw["site"]["supported_locales"]

GITHUB_REPO: str = _raw["github"]["repo"]
GITHUB_BRANCH: str = _raw["github"]["branch"]
CONTENT_DIR: str = _raw["github"]["content_dir"]

ADMINS: list[str] = _raw.get("admins", [])

# Secrets from environment
GITHUB_APP_ID: str = os.environ.get("GITHUB_APP_ID", "")
GITHUB_CLIENT_ID: str = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET: str = os.environ.get("GITHUB_CLIENT_SECRET", "")
GITHUB_APP_PRIVATE_KEY_PATH: str = os.environ.get("GITHUB_APP_PRIVATE_KEY_PATH", "")
JWT_SECRET: str = os.environ.get("JWT_SECRET", "change-me")
DEEPSEEK_API_KEY: str = os.environ.get("DEEPSEEK_API_KEY", "")

FRONTEND_URL: str = os.environ.get("FRONTEND_URL", "http://localhost:5173")
PROXY: str = os.environ.get("HTTPS_PROXY", "") or os.environ.get("ALL_PROXY", "")
