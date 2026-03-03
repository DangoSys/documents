"""Translation via DeepSeek API (OpenAI-compatible)."""

from fastapi import APIRouter, Depends, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel

from .auth import require_admin
from .config import DEEPSEEK_API_KEY

router = APIRouter(prefix="/api/translate", tags=["translate"])

LANG_NAMES = {"en": "English", "zh": "Chinese"}


class TranslateRequest(BaseModel):
    content: str
    target_locale: str


@router.post("")
async def translate(body: TranslateRequest, _user: dict = Depends(require_admin)):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=503, detail="Translation service not configured")

    target = LANG_NAMES.get(body.target_locale, body.target_locale)
    prompt = (
        f"Translate the following Markdown document to {target}. "
        f"Preserve all Markdown formatting, code blocks, and links exactly as they are. "
        f"Only translate the natural language text. "
        f"Return ONLY the translated document, no explanations.\n\n"
        f"{body.content}"
    )

    client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")
    response = await client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
    )
    translated = response.choices[0].message.content
    return {"translated": translated}
