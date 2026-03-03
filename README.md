# Buckyball Documents

Online visual document management system for Buckyball's markdown documentation.

## Quick Start

### 1. Enter dev environment

```bash
cd documents
nix develop
```

### 2. Install frontend dependencies

```bash
cd frontend
pnpm install
```

### 3. Run frontend dev server

```bash
pnpm dev
```

### 4. Run backend (in another terminal, also inside `nix develop`)

```bash
cd documents
nix develop
uvicorn backend.main:app --reload
```

> Note: Backend requires `.env` with GitHub App credentials for full functionality. Copy `.env.example` to `.env` and fill in values. Without it, the health endpoint (`/api/health`) still works for verifying the server runs.

## Production Deploy

```bash
cp .env.example .env
# Fill in .env values
nix run
```

This builds the frontend, then starts uvicorn serving both API and static files on port 8000.
