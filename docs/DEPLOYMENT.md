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
