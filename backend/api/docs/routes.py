"""Document CRUD routes."""

from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel

from ..auth.deps import require_admin
from ...config import SUPPORTED_LOCALES
from ...services.github import (
    delete_file, get_file, get_tree, put_file, rename_file, get_order, put_order,
    list_images, put_file_binary, get_file_raw, delete_image,
)

router = APIRouter(prefix="/api/docs", tags=["docs"])


class DocUpdate(BaseModel):
    content: str
    sha: str | None = None
    message: str = ""


class DocCreate(BaseModel):
    content: str
    message: str = ""


class DocRename(BaseModel):
    new_path: str


class DocOrder(BaseModel):
    order: list[str]


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


@router.post("/rename/{locale}/{path:path}")
async def rename_doc(locale: str, path: str, body: DocRename, _user: dict = Depends(require_admin)):
    new_path = body.new_path
    if not new_path.endswith(".md"):
        new_path = f"{new_path}.md"
    await rename_file(locale, path, new_path)
    return {"ok": True, "new_path": new_path}


@router.get("/order")
async def read_order():
    order = await get_order()
    return {"order": order}


@router.put("/order")
async def update_order(body: DocOrder, _user: dict = Depends(require_admin)):
    await put_order(body.order)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Images (public read, admin write)
# ---------------------------------------------------------------------------


@router.get("/image/{locale}/{path:path}")
async def serve_image(locale: str, path: str):
    """Serve an image file from the repo (public)."""
    if locale not in SUPPORTED_LOCALES:
        locale = "en"
    data, content_type = await get_file_raw(locale, path)
    return Response(content=data, media_type=content_type)


@router.get("/images/{locale}/{path:path}")
async def list_doc_images(locale: str, path: str):
    """List images for a document."""
    if locale not in SUPPORTED_LOCALES:
        locale = "en"
    images = await list_images(locale, path)
    return {"images": images}


@router.post("/images/{locale}/{path:path}")
async def upload_image(
    locale: str, path: str, file: UploadFile = File(...), _user: dict = Depends(require_admin)
):
    """Upload an image to the document's images/ folder."""
    data = await file.read()
    filename = file.filename or "image.png"
    # Build the image path: strip locale from _images_dir result since put_file_binary adds it
    parent = "/".join(path.split("/")[:-1])
    if parent:
        rel_path = f"{parent}/images/{filename}"
    else:
        rel_path = f"images/{filename}"
    message = f"Upload image {filename} for {path}"
    await put_file_binary(locale, rel_path, data, message)
    return {"ok": True, "name": filename}


@router.delete("/images/{locale}/{path:path}")
async def remove_image(locale: str, path: str, sha: str, _user: dict = Depends(require_admin)):
    """Delete an image from the repo."""
    await delete_image(locale, path, sha)
    return {"ok": True}
