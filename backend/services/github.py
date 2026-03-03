"""GitHub API client – handles both OAuth user identity and App installation writes."""

import base64
import json
import time
from pathlib import Path

import httpx
import jwt as pyjwt

from ..config import (
    CONTENT_DIR,
    GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY_PATH,
    GITHUB_BRANCH,
    GITHUB_REPO,
    PROXY,
)

API = "https://api.github.com"

def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(proxy=PROXY) if PROXY else httpx.AsyncClient()

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
    async with _client() as client:
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
    async with _client() as client:
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
    """Return the file tree under content/<locale>/ recursively, sorted by .order.json."""
    token = await get_installation_token()
    url = f"{API}/repos/{GITHUB_REPO}/git/trees/{GITHUB_BRANCH}?recursive=1"
    async with _client() as client:
        resp = await client.get(url, headers=_install_headers(token))
        resp.raise_for_status()
    prefix = f"{CONTENT_DIR}/{locale}/"
    items = []
    for item in resp.json().get("tree", []):
        if item["path"].startswith(prefix) and item["path"].endswith(".md"):
            rel = item["path"][len(prefix):]
            items.append({"path": rel, "type": item["type"]})
    # Apply custom ordering
    order = await get_order()
    if order:
        order_map = {name: idx for idx, name in enumerate(order)}
        def sort_key(item: dict) -> tuple:
            parts = item["path"].split("/")
            return tuple(order_map.get(p, 9999) for p in parts)
        items.sort(key=sort_key)
    return items


# ---------------------------------------------------------------------------
# Order file (.order.json) – stores sidebar sort order
# ---------------------------------------------------------------------------

_ORDER_PATH = f"{CONTENT_DIR}/.order.json"


async def get_order() -> list[str]:
    """Get the ordering list from .order.json. Returns [] if not found."""
    token = await get_installation_token()
    url = f"{API}/repos/{GITHUB_REPO}/contents/{_ORDER_PATH}?ref={GITHUB_BRANCH}"
    try:
        async with _client() as client:
            resp = await client.get(url, headers=_install_headers(token))
            resp.raise_for_status()
        data = resp.json()
        content = base64.b64decode(data["content"]).decode("utf-8")
        return json.loads(content)
    except (httpx.HTTPStatusError, json.JSONDecodeError):
        return []


async def get_order_with_sha() -> tuple[list[str], str | None]:
    """Get the ordering list and its sha. Returns ([], None) if not found."""
    token = await get_installation_token()
    url = f"{API}/repos/{GITHUB_REPO}/contents/{_ORDER_PATH}?ref={GITHUB_BRANCH}"
    try:
        async with _client() as client:
            resp = await client.get(url, headers=_install_headers(token))
            resp.raise_for_status()
        data = resp.json()
        content = base64.b64decode(data["content"]).decode("utf-8")
        return json.loads(content), data["sha"]
    except httpx.HTTPStatusError:
        return [], None


async def put_order(order: list[str]) -> None:
    """Save the ordering list to .order.json."""
    token = await get_installation_token()
    url = f"{API}/repos/{GITHUB_REPO}/contents/{_ORDER_PATH}"
    content_str = json.dumps(order, ensure_ascii=False, indent=2)
    body: dict = {
        "message": "Update sidebar order",
        "content": base64.b64encode(content_str.encode()).decode(),
        "branch": GITHUB_BRANCH,
    }
    # Get existing sha if file exists
    _, sha = await get_order_with_sha()
    if sha:
        body["sha"] = sha
    async with _client() as client:
        resp = await client.put(url, json=body, headers=_install_headers(token))
        resp.raise_for_status()


async def get_file(locale: str, path: str) -> dict:
    """Get a file's content and sha."""
    token = await get_installation_token()
    full = _content_path(f"{locale}/{path}")
    url = f"{API}/repos/{GITHUB_REPO}/contents/{full}?ref={GITHUB_BRANCH}"
    async with _client() as client:
        resp = await client.get(url, headers=_install_headers(token))
        resp.raise_for_status()
    data = resp.json()
    content = base64.b64decode(data["content"]).decode("utf-8")
    return {"content": content, "sha": data["sha"], "path": data["path"]}


async def put_file(locale: str, path: str, content: str, message: str, sha: str | None = None) -> dict:
    """Create or update a file."""
    token = await get_installation_token()
    full = _content_path(f"{locale}/{path}")
    url = f"{API}/repos/{GITHUB_REPO}/contents/{full}"
    body: dict = {
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
        "branch": GITHUB_BRANCH,
    }
    if sha:
        body["sha"] = sha
    async with _client() as client:
        resp = await client.put(url, json=body, headers=_install_headers(token))
        resp.raise_for_status()
    return resp.json()


async def delete_file(locale: str, path: str, sha: str, message: str) -> dict:
    """Delete a file."""
    token = await get_installation_token()
    full = _content_path(f"{locale}/{path}")
    url = f"{API}/repos/{GITHUB_REPO}/contents/{full}"
    body = {"message": message, "sha": sha, "branch": GITHUB_BRANCH}
    async with _client() as client:
        resp = await client.request("DELETE", url, json=body, headers=_install_headers(token))
        resp.raise_for_status()
    return resp.json()


async def rename_file(locale: str, old_path: str, new_path: str) -> None:
    """Rename/move a file, syncing across all locales that have the same path."""
    from ..config import SUPPORTED_LOCALES

    for loc in SUPPORTED_LOCALES:
        try:
            old = await get_file(loc, old_path)
        except httpx.HTTPStatusError:
            continue  # file doesn't exist in this locale
        message = f"Rename {loc}/{old_path} -> {loc}/{new_path}"
        await put_file(loc, new_path, old["content"], message)
        await delete_file(loc, old_path, old["sha"], message)


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"}


def _images_dir(locale: str, doc_path: str) -> str:
    """Return the images/ folder path relative to content root for a given doc."""
    parent = "/".join(doc_path.split("/")[:-1])  # drop the filename
    if parent:
        return f"{locale}/{parent}/images"
    return f"{locale}/images"


async def list_images(locale: str, doc_path: str) -> list[dict]:
    """List image files in the images/ folder next to a document."""
    token = await get_installation_token()
    images_prefix = f"{CONTENT_DIR}/{_images_dir(locale, doc_path)}/"
    url = f"{API}/repos/{GITHUB_REPO}/git/trees/{GITHUB_BRANCH}?recursive=1"
    async with _client() as client:
        resp = await client.get(url, headers=_install_headers(token))
        resp.raise_for_status()
    results = []
    for item in resp.json().get("tree", []):
        if item["type"] != "blob":
            continue
        if not item["path"].startswith(images_prefix):
            continue
        name = item["path"].split("/")[-1]
        ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext not in _IMAGE_EXTS:
            continue
        rel = item["path"][len(f"{CONTENT_DIR}/"):]
        results.append({"name": name, "path": rel, "sha": item["sha"]})
    return results


async def put_file_binary(locale: str, path: str, data: bytes, message: str) -> dict:
    """Upload a binary file to the repo."""
    token = await get_installation_token()
    full = _content_path(f"{locale}/{path}")
    url = f"{API}/repos/{GITHUB_REPO}/contents/{full}"
    body: dict = {
        "message": message,
        "content": base64.b64encode(data).decode(),
        "branch": GITHUB_BRANCH,
    }
    # Check if file already exists to get sha
    try:
        async with _client() as client:
            check = await client.get(
                f"{url}?ref={GITHUB_BRANCH}", headers=_install_headers(token)
            )
            if check.status_code == 200:
                body["sha"] = check.json()["sha"]
    except Exception:
        pass
    async with _client() as client:
        resp = await client.put(url, json=body, headers=_install_headers(token))
        resp.raise_for_status()
    return resp.json()


async def get_file_raw(locale: str, path: str) -> tuple[bytes, str]:
    """Get raw file bytes and content type from the repo."""
    token = await get_installation_token()
    full = _content_path(f"{locale}/{path}")
    url = f"{API}/repos/{GITHUB_REPO}/contents/{full}?ref={GITHUB_BRANCH}"
    async with _client() as client:
        resp = await client.get(url, headers=_install_headers(token))
        resp.raise_for_status()
    data = resp.json()
    content = base64.b64decode(data["content"])
    name = path.split("/")[-1].lower()
    ext = name.rsplit(".", 1)[-1] if "." in name else ""
    mime_map = {
        "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "gif": "image/gif", "svg": "image/svg+xml", "webp": "image/webp",
        "bmp": "image/bmp", "ico": "image/x-icon",
    }
    content_type = mime_map.get(ext, "application/octet-stream")
    return content, content_type


async def delete_image(locale: str, path: str, sha: str) -> dict:
    """Delete an image file from the repo."""
    token = await get_installation_token()
    full = _content_path(f"{locale}/{path}")
    url = f"{API}/repos/{GITHUB_REPO}/contents/{full}"
    body = {"message": f"Delete image {path}", "sha": sha, "branch": GITHUB_BRANCH}
    async with _client() as client:
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
    async with _client() as client:
        resp = await client.get(url, headers=_install_headers(token))
        resp.raise_for_status()
    data = resp.json()
    content = base64.b64decode(data["content"]).decode("utf-8")
    return {"content": content, "sha": data["sha"]}


async def put_config_file(content: str, sha: str, message: str) -> dict:
    """Update config.yaml in the repo."""
    token = await get_installation_token()
    url = f"{API}/repos/{GITHUB_REPO}/contents/config.yaml"
    body = {
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
        "sha": sha,
        "branch": GITHUB_BRANCH,
    }
    async with _client() as client:
        resp = await client.put(url, json=body, headers=_install_headers(token))
        resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# User info (via user OAuth token)
# ---------------------------------------------------------------------------


async def get_github_user(access_token: str) -> dict:
    """Get GitHub user info from an OAuth access token."""
    async with _client() as client:
        resp = await client.get(
            f"{API}/user",
            headers={"Authorization": f"token {access_token}", "Accept": "application/vnd.github+json"},
        )
        resp.raise_for_status()
    data = resp.json()
    return {"login": data["login"], "avatar_url": data["avatar_url"], "name": data.get("name", "")}
