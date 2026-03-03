"""Document CRUD routes."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth.deps import require_admin
from ...config import SUPPORTED_LOCALES
from ...services.github import delete_file, get_file, get_tree, put_file

router = APIRouter(prefix="/api/docs", tags=["docs"])


class DocUpdate(BaseModel):
    content: str
    sha: str | None = None
    message: str = ""


class DocCreate(BaseModel):
    content: str
    message: str = ""


# ---------------------------------------------------------------------------
# Public
# ---------------------------------------------------------------------------


@router.get("/tree/{locale}")
async def tree(locale: str):
    if locale not in SUPPORTED_LOCALES:
        locale = "en"
    items = await get_tree(locale)
    return {"locale": locale, "items": items}


@router.get("/file/{locale}/{path:path}")
async def read_doc(locale: str, path: str):
    if locale not in SUPPORTED_LOCALES:
        locale = "en"
    data = await get_file(locale, path)
    return data


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


@router.put("/file/{locale}/{path:path}")
async def update_doc(locale: str, path: str, body: DocUpdate, _user: dict = Depends(require_admin)):
    message = body.message or f"Update {locale}/{path}"
    result = await put_file(locale, path, body.content, message, sha=body.sha)
    return {"ok": True, "commit": result.get("commit", {}).get("sha", "")}


@router.post("/file/{locale}/{path:path}")
async def create_doc(locale: str, path: str, body: DocCreate, _user: dict = Depends(require_admin)):
    message = body.message or f"Create {locale}/{path}"
    result = await put_file(locale, path, body.content, message)
    return {"ok": True, "commit": result.get("commit", {}).get("sha", "")}


@router.delete("/file/{locale}/{path:path}")
async def remove_doc(locale: str, path: str, sha: str, _user: dict = Depends(require_admin)):
    message = f"Delete {locale}/{path}"
    await delete_file(locale, path, sha, message)
    return {"ok": True}
