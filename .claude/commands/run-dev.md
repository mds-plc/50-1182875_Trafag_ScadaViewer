# /run-dev — spuštění v dev módu

Vysvětlí uživateli jak spustit backend a frontend pro vývoj.

---

## Backend

```bash
cd "10.Scada program\ScadaViewer"
pip install -r 00_backend/requirements.txt
python main.py --config Config.toml --debug
# Swagger UI: http://localhost:8080/docs
# ReDoc:      http://localhost:8080/redoc
```

## Frontend (samostatný terminál)

```bash
cd 01_frontend
npm install
npm run dev
# http://localhost:5173  (proxy → backend :8080)
```

## Produkce (po buildu)

```bash
# 1. Build frontend
cd 01_frontend && npm run build

# 2. Odkomentovat StaticFiles v app.py

# 3. Spustit backend — servíruje i frontend
python main.py --config Config.toml
# http://localhost:8080
```
