# FireExit API Documentation

Base URL: `http://localhost:8000`

Interactive Swagger UI: `/docs` · ReDoc: `/redoc`

## Authentication

### POST `/api/auth/login`

```json
{ "username": "operator", "password": "operator123" }
```

Response:

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "role": "operator",
  "username": "operator",
  "full_name": "Simulation Operator"
}
```

Use header: `Authorization: Bearer <jwt>`

### GET `/api/auth/me`

Returns the current user profile.

---

## Simulation

### GET `/api/simulation/state`

Full digital-twin snapshot: building graph, rooms/sensors, people, routes, metrics, alerts, history.

### Lifecycle

- `POST /api/simulation/start`
- `POST /api/simulation/pause`
- `POST /api/simulation/resume`
- `POST /api/simulation/reset`

### Hazards & crowd

```http
POST /api/simulation/fire
{ "node_id": "office_1", "intensity": 0.5 }

POST /api/simulation/smoke
{ "node_id": "corr_a", "amount": 25 }

POST /api/simulation/block-exit
{ "exit_id": "exit_west" }

POST /api/simulation/spawn
{ "count": 10 }

POST /api/simulation/random-fire
POST /api/simulation/random-crowd

PATCH /api/simulation/config
{ "spread_rate": 0.12, "smoke_rate": 0.15, "heat_rate": 0.18 }
```

### Fail-safe sensor fault

```http
POST /api/simulation/sensor-fail/{node_id}
```

Treats the node as degraded; hazard engine applies elevated unknown risk.

---

## Building

- `GET /api/building/layout` — live layout
- `GET /api/building/default-layout` — factory default
- `PUT /api/building/layout` — deploy designer graph
- `POST /api/building/reset-layout`

---

## Analytics

- `GET /api/analytics/overview`
- `GET /api/analytics/timeseries` — temp, smoke, evacuated, occupancy, pathfinding ms
- `GET /api/analytics/heatmap`
- `GET /api/analytics/exit-utilization`

---

## WebSocket

Connect: `ws://localhost:8000/ws/simulation`

Server events:

```json
{ "event": "snapshot" | "tick" | "status" | "heartbeat", "data": { ... }, "tick": 42 }
```

Client commands:

```json
{ "cmd": "start" }
{ "cmd": "pause" }
{ "cmd": "fire", "node_id": "lab_1", "intensity": 0.6 }
{ "cmd": "ping" }
```

---

## MQTT Topics

| Topic | Payload |
|-------|---------|
| `fireexit/{node_id}/hazard` | Hazard fusion result |
| `fireexit/{node_id}/path` | Current evacuation path |
| `fireexit/{node_id}/cmd` | Remote inject commands |

If the broker is unavailable the simulation continues in **local fail-safe mode**.

---

## Hazard Formula

```
Risk = 0.4·Flame + 0.3·Smoke + 0.2·Temperature + 0.1·Crowd
EdgeCost = exp(6 · Risk) − 1   (blocked if Risk ≥ 0.75)
PathCost = Distance + HazardCost + CrowdCost
```

Levels: `safe` (&lt;0.25) · `warning` · `danger` · `critical` (≥0.85)
