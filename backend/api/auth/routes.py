"""Authentication routes: GitHub OAuth login flow."""

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from ...config import ADMINS, FRONTEND_URL, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, PROXY
from ...services.github import get_github_user
from .deps import create_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/login")
async def login():
    url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&scope=read:user"
    )
    return RedirectResponse(url)


@router.get("/callback")
async def callback(code: str):
    async with (httpx.AsyncClient(proxy=PROXY) if PROXY else httpx.AsyncClient()) as client:
        resp = await client.post(
            "https://github.com/login/oauth/access_token",
            json={"client_id": GITHUB_CLIENT_ID, "client_secret": GITHUB_CLIENT_SECRET, "code": code},
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()

    access_token = data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="OAuth failed")

    user = await get_github_user(access_token)
    token = create_token(user["login"], user["avatar_url"], user["name"])
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?token={token}")


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {
        "login": user["sub"],
        "avatar_url": user.get("avatar_url", ""),
        "name": user.get("name", ""),
        "is_admin": user["sub"] in ADMINS,
    }
