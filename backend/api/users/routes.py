"""User group management routes."""

import yaml
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth.deps import require_admin
from ...config import ADMINS
from ...services.github import get_config_file, put_config_file

router = APIRouter(prefix="/api/users", tags=["users"])


class AdminsUpdate(BaseModel):
    admins: list[str]


@router.get("/admins")
async def list_admins(_user: dict = Depends(require_admin)):
    return {"admins": ADMINS}


@router.put("/admins")
async def update_admins(body: AdminsUpdate, _user: dict = Depends(require_admin)):
    cfg = await get_config_file()
    parsed = yaml.safe_load(cfg["content"])
    parsed["admins"] = body.admins
    new_content = yaml.dump(parsed, default_flow_style=False, allow_unicode=True)
    await put_config_file(new_content, cfg["sha"], "Update admin list")

    # Update in-memory admins
    ADMINS.clear()
    ADMINS.extend(body.admins)

    return {"ok": True, "admins": body.admins}
