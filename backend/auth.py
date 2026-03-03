"""Authentication: GitHub OAuth flow + JWT token."""

from datetime import datetime, timedelta, timezone

import httpx
import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from .config import ADMINS, FRONTEND_URL, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
from .github_client import get_github_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24


def _jwt_secret() -> str:
    from .config import JWT_SECRET
    return JWT_SECRET


def create_token(login: str, avatar_url: str, name: str) -> str:
    payload = {
        "sub": login,
        "avatar_url": avatar_url,
        "name": name,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return pyjwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return pyjwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(auth[7:])
    return payload


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["sub"] not in ADMINS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


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
    async with httpx.AsyncClient() as client:
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
