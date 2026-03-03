from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api.auth.routes import router as auth_router
from .api.docs.routes import router as docs_router
from .api.translate.routes import router as translate_router
from .api.users.routes import router as users_router
from .config import FRONTEND_URL

app = FastAPI(title="Buckyball Documents API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(docs_router)
app.include_router(translate_router)
app.include_router(users_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Serve frontend static files in production
_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=_frontend_dist / "assets"), name="assets")

    @app.get("/{path:path}")
    async def serve_spa(request: Request, path: str):
        file_path = _frontend_dist / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_frontend_dist / "index.html")
