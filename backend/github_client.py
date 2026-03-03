"""GitHub API client – handles both OAuth user identity and App installation writes."""

import time
from pathlib import Path

import httpx
import jwt as pyjwt

from .config import (
    CONTENT_DIR,
    GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY_PATH,
    GITHUB_BRANCH,
    GITHUB_REPO,
)

API = "https://api.github.com"

# ---------------------------------------------------------------------------
# Installation token (for writing to the repo via GitHub App)
# ---------------------------------------------------------------------------

_installation_token: str = ""
_installation_token_expires: float = 0


def _app_jwt() -> str:
    key_path = Path(GITHUB_APP_PRIVATE_KEY_PATH)
    private_key = key_path.read_text()
    now = int(time.time())
    payload = {"iat": now - 60, "exp": now + 600, "iss": GITHUB_APP_ID}
    return pyjwt.encode(payload, private_key, algorithm="RS256")


async def _get_installation_id() -> int:
    token = _app_jwt()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{API}/repos/{GITHUB_REPO}/installation",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
        resp.raise_for_status()
        return resp.json()["id"]


async def get_installation_token() -> str:
    global _installation_token, _installation_token_expires
    if _installation_token and time.time() < _installation_token_expires:
        return _installation_token
    installation_id = await _get_installation_id()
    token = _app_jwt()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{API}/app/installations/{installation_id}/access_tokens",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
        resp.raise_for_status()
        data = resp.json()
    _installation_token = data["token"]
    _installation_token_expires = time.time() + 3500  # tokens last 1 hour
    return _installation_token


def _install_headers(token: str) -> dict:
    return {"Authorization": f"token {token}", "Accept": "application/vnd.github+json"}


# ---------------------------------------------------------------------------
# Repo content helpers
# ---------------------------------------------------------------------------


def _content_path(path: str) -> str:
    return f"{CONTENT_DIR}/{path}".strip("/")


async def get_tree(locale: str) -> list[dict]:
    """Return the file tree under content/<locale>/ recursively."""
    token = await get_installation_token()
    url = f"{API}/repos/{GITHUB_REPO}/git/trees/{GITHUB_BRANCH}?recursive=1"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=_install_headers(token))
        resp.raise_for_status()
    prefix = f"{CONTENT_DIR}/{locale}/"
    items = []
    for item in resp.json().get("tree", []):
        if item["path"].startswith(prefix) and item["path"].endswith(".md"):
            rel = item["path"][len(prefix):]
            items.append({"path": rel, "type": item["type"]})
    return items


async def get_file(locale: str, path: str) -> dict:
    """Get a file's content and sha."""
    token = await get_installation_token()
    full = _content_path(f"{locale}/{path}")
    url = f"{API}/repos/{GITHUB_REPO}/contents/{full}?ref={GITHUB_BRANCH}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=_install_headers(token))
        resp.raise_for_status()
    data = resp.json()
    import base64
    content = base64.b64decode(data["content"]).decode("utf-8")
    return {"content": content, "sha": data["sha"], "path": data["path"]}


async def put_file(locale: str, path: str, content: str, message: str, sha: str | None = None) -> dict:
    """Create or update a file."""
    token = await get_installation_token()
    full = _content_path(f"{locale}/{path}")
    url = f"{API}/repos/{GITHUB_REPO}/contents/{full}"
    import base64
    body: dict = {
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
        "branch": GITHUB_BRANCH,
    }
    if sha:
        body["sha"] = sha
    async with httpx.AsyncClient() as client:
        resp = await client.put(url, json=body, headers=_install_headers(token))
        resp.raise_for_status()
    return resp.json()


async def delete_file(locale: str, path: str, sha: str, message: str) -> dict:
    """Delete a file."""
    token = await get_installation_token()
    full = _content_path(f"{locale}/{path}")
    url = f"{API}/repos/{GITHUB_REPO}/contents/{full}"
    body = {"message": message, "sha": sha, "branch": GITHUB_BRANCH}
    async with httpx.AsyncClient() as client:
        resp = await client.request("DELETE", url, json=body, headers=_install_headers(token))
        resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# config.yaml helpers (for admin management)
# ---------------------------------------------------------------------------


async def get_config_file() -> dict:
    """Get config.yaml content and sha from the repo."""
    token = await get_installation_token()
    url = f"{API}/repos/{GITHUB_REPO}/contents/config.yaml?ref={GITHUB_BRANCH}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=_install_headers(token))
        resp.raise_for_status()
    data = resp.json()
    import base64
    content = base64.b64decode(data["content"]).decode("utf-8")
    return {"content": content, "sha": data["sha"]}


async def put_config_file(content: str, sha: str, message: str) -> dict:
    """Update config.yaml in the repo."""
    token = await get_installation_token()
    url = f"{API}/repos/{GITHUB_REPO}/contents/config.yaml"
    import base64
    body = {
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
        "sha": sha,
        "branch": GITHUB_BRANCH,
    }
    async with httpx.AsyncClient() as client:
        resp = await client.put(url, json=body, headers=_install_headers(token))
        resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# User info (via user OAuth token)
# ---------------------------------------------------------------------------


async def get_github_user(access_token: str) -> dict:
    """Get GitHub user info from an OAuth access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{API}/user",
            headers={"Authorization": f"token {access_token}", "Accept": "application/vnd.github+json"},
        )
        resp.raise_for_status()
    data = resp.json()
    return {"login": data["login"], "avatar_url": data["avatar_url"], "name": data.get("name", "")}
