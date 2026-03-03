"""Auth dependencies: JWT helpers, current user extraction, role checks."""

from datetime import datetime, timedelta, timezone

import jwt as pyjwt
from fastapi import Depends, HTTPException, Request

from ...config import ADMINS


JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24


def _jwt_secret() -> str:
    from ...config import JWT_SECRET
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
    return decode_token(auth[7:])


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["sub"] not in ADMINS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
