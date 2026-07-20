# ScadaViewer — multi-stage Docker build
#
# Stage 1: Node.js — build React frontend (výsledek: 01_frontend/dist/)
# Stage 2: Python  — runtime; obsahuje jen dist/ (ne node_modules)
#
# Spuštění:
#   docker build -t scadaviewer .
#   docker run -p 8080:8080 -v ./Config.toml:/app/Config.toml:ro -v ./data:/data scadaviewer

# ── Stage 1: Frontend build ──────────────────────────────────────────────────

FROM node:20-slim AS frontend-build

WORKDIR /frontend

# Závislosti — oddělená vrstva pro cache (npm ci přeskočí pokud package*.json nezměněn)
COPY 01_frontend/package*.json ./
RUN npm ci --silent

# Zdrojový kód + build
COPY 01_frontend/ ./
RUN npm run build


# ── Stage 2: Python runtime ──────────────────────────────────────────────────

FROM python:3.11-slim

WORKDIR /app

# Python závislosti — oddělená vrstva pro cache
COPY 00_backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend
COPY 00_backend/ ./00_backend/
COPY main.py     ./

# Frontend build ze Stage 1 (bez node_modules — výrazně menší image)
COPY --from=frontend-build /frontend/dist ./01_frontend/dist/

EXPOSE 8080

# Config.toml se připojí jako bind-mount za runtime (viz docker-compose.yml)
# main.py auto-detekuje 01_frontend/dist/ a aktivuje servírování frontendu
CMD ["python", "main.py", "--config", "Config.toml"]
