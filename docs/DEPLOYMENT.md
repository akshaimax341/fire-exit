# FireExit — Production Deployment Guide

## Overview

FireExit is an enterprise digital twin for fire evacuation:
ESP32 IoT → FastAPI (telemetry, hazard, A*/Dijkstra, crowd) → React command center.

## Architecture

```
ESP32 ──HTTP POST /api/telemetry──► FastAPI
   │                                    │
   └── MQTT fireexit/device/{id} ───────┤
                                        ├── Redis (cache/ready)
                                        ├── Mosquitto MQTT
                                        ├── SQLite / Postgres
                                        └── WebSocket /ws/simulation
                                               │
                                               ▼
                                         React + R3F Twin
```

## Local development

```bash
# Backend
cd backend && python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

Demo users: `admin/admin123`, `operator/operator123`, `viewer/viewer123`.

## Docker (recommended production path)

```bash
docker compose up --build
```

| Service   | URL |
|-----------|-----|
| UI        | http://localhost:3000 |
| API       | http://localhost:8000 |
| OpenAPI   | http://localhost:8000/docs |
| MQTT      | localhost:1883 |
| Redis     | localhost:6379 |

Postgres profile:

```bash
docker compose --profile full up --build
```

Then set `DATABASE_URL=postgresql+asyncpg://fireexit:fireexit@postgres:5432/fireexit` on the backend service.

## Railway (backend)

Deploy the FastAPI API to [Railway](https://railway.app) with Postgres. MQTT/Redis are optional — the app continues in local fail-safe mode if the broker is unreachable.

### 1. Prep (already in repo)

- [`backend/Dockerfile`](../backend/Dockerfile) binds `0.0.0.0:${PORT:-8000}` (Railway injects `PORT`)
- [`backend/railway.toml`](../backend/railway.toml) health-checks `GET /api/health`
- `asyncpg` + URL normalizer: Railway `postgresql://…` → `postgresql+asyncpg://…`
- `CORS_ORIGINS` accepts a comma-separated env string

### 2. Create the project

1. Push this repo to GitHub.
2. Railway → **New Project** → **Deploy from GitHub** → select `FIRE-EXIT`.
3. Open the service → **Settings** → set **Root Directory** to `backend` (uses `backend/Dockerfile`).
4. Leave **Custom Start Command** empty so the Dockerfile `CMD` expands `$PORT`.
5. **Add Database** → **PostgreSQL**.

### 3. Environment variables

In the backend service **Variables** tab:

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Reference Postgres: `${{Postgres.DATABASE_URL}}` (name may match your plugin) |
| `SECRET_KEY` | Long random string (required for production) |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173` |
| `MQTT_BROKER` | `localhost` (optional; MQTT stays offline, HTTP + WebSocket still work) |

Add more origins to `CORS_ORIGINS` when you host the frontend (comma-separated, no spaces required).

### 4. Public domain

**Settings → Networking → Generate Domain**  
Example: `https://fireexit-api-xxxx.up.railway.app`

Verify:

- Health: `https://YOUR_DOMAIN/api/health`
- OpenAPI: `https://YOUR_DOMAIN/docs`

### 5. Point clients at Railway

**ESP32** — in `firmware/esp32_fireexit_telemetry.ino`:

```cpp
#define API_BASE "https://YOUR_DOMAIN"
```

**Local frontend** — create `frontend/.env`:

```
VITE_API_URL=https://YOUR_DOMAIN
VITE_WS_URL=wss://YOUR_DOMAIN
```

Restart `npm run dev`. WebSocket path remains `/ws/simulation` (`wss://YOUR_DOMAIN/ws/simulation`).

### 6. Smoke tests (PowerShell)

```powershell
Invoke-RestMethod https://YOUR_DOMAIN/api/health

Invoke-RestMethod -Method POST -Uri "https://YOUR_DOMAIN/api/telemetry" `
  -ContentType "application/json" `
  -Body '{"deviceId":"DEV001","room":"Office 101","type":"ROOM","floor":1,"temperature":42,"humidity":35,"gasLevel":1300,"status":"WARNING","battery":88,"signal":-62}'
```

Demo login against the Railway API: `admin` / `admin123`.

### Railway notes

- Prefer the **private** Postgres URL Railway injects between services (no public egress needed).
  Use `${{Postgres.DATABASE_PRIVATE_URL}}` when available; otherwise `${{Postgres.DATABASE_URL}}`.
- Do **not** hardcode `PORT` in Railway variables — the platform sets it at runtime.
- Redeploys recreate the container; Postgres keeps devices / telemetry / alerts durable.
- Hosting Mosquitto on Railway is out of scope for this path; ESP32 uses HTTPS telemetry.
- If healthchecks fail with **service unavailable**, check deploy **Runtime logs** (not only build logs)
  for `Database init failed` — usually a missing/wrong `DATABASE_URL` link to the Postgres plugin.
- Leave **Custom Start Command** empty; `entrypoint.sh` binds uvicorn to `$PORT`.

## ESP32 integration

1. Flash `firmware/esp32_fireexit_telemetry.ino`
2. Set Wi‑Fi + `API_BASE` to your backend LAN IP
3. Devices POST every 5s to `POST /api/telemetry`
4. Devices offline after **15 seconds** without updates
5. Twin rooms update when `room` name matches a building node (or set `nodeId`)

### Sample payload

```json
{
  "deviceId": "DEV001",
  "room": "Office 101",
  "type": "ROOM",
  "floor": 1,
  "temperature": 42,
  "humidity": 35,
  "gasLevel": 1300,
  "status": "WARNING",
  "battery": 88,
  "signal": -62,
  "timestamp": 1710000000
}
```

### MQTT

- Publish state: `fireexit/device/{deviceId}`
- Commands: `fireexit/commands/#` (`reset`, `ping`, `led`, `buzzer`, `display`, `firmware`, `simulation`)

## Key APIs

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/telemetry` | Public ESP32 ingest |
| GET | `/api/devices` | JWT |
| GET | `/api/device/{id}` | JWT |
| GET | `/api/rooms` | JWT |
| GET | `/api/buildings` | JWT |
| GET | `/api/statistics` | JWT |
| GET | `/api/alerts` | JWT |
| POST | `/api/alerts/{id}/ack` | Operator+ |
| WS | `/ws/simulation` | Twin + telemetry events |

## Security checklist

- Change `SECRET_KEY` in compose / env
- Put telemetry behind a reverse proxy + device tokens for public internet
- Restrict CORS origins
- Use Postgres + backups for production
- TLS terminate at Nginx / load balancer

## Tests

```bash
cd backend
pytest tests/ -q
```

## Capacity targets

- 100 rooms · 100 ESP32 devices · 1000 occupants
- Simulation tick ~200ms · path refresh ~1s · UI 60 FPS (people render capped in 3D)
