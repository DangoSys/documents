# Buckyball Documents

Online visual document management system for Buckyball's markdown documentation.

## Production Deploy

```bash
cp .env.example .env
# Fill in .env values
nix run
```

> Note: Backend requires `.env` with GitHub App credentials for full functionality. Copy `.env.example` to `.env` and fill in values. Without it, the health endpoint (`/api/health`) still works for verifying the server runs.

This builds the frontend, then starts uvicorn serving both API and static files on port 8000.
