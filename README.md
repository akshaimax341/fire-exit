# FireExit — AI-Powered Smart Fire Evacuation Digital Twin

Enterprise-style **command-center / digital twin** for real-time fire evacuation:
dark glass UI, live IoT telemetry, 3D building twin, dynamic A* routing, and crowd simulation.

Design language: VisionOS glass · Tesla control surfaces · industrial SCADA · Google Maps–style path glow.

---

## What Was Built

### Control-room shell
- Sticky frosted **TopNav** — logo, live clock, simulation status, fire alert badge, search, notifications, settings, operator profile
- Collapsible **sidebar** with glow on the active route
- Framer Motion page transitions (blur / slide)
- Dark glassmorphism theme, neon accents, Inter typography

### Navigation (modules)
| Route | Module |
|-------|--------|
| `/dashboard` | Command Center KPIs, 2D heatmap, alerts |
| `/twin` | Immersive 3D digital twin (~70% canvas) |
| `/designer` | Building layout editor (React Flow) |
| `/iot` | Sensor network cards |
| `/occupancy` | RFID badge / people tracking |
| `/analytics` | Timeseries, exits, hazard charts |
| `/settings` | Profile, link status, sim defaults |

Fire simulation and path planning live **inside Digital Twin** (toolbar + glowing routes)—not separate nav items.

### Digital Twin (`/twin`)
- **Three.js / React Three Fiber** architectural cutaway (rooms, corridors, stairs, exits, floors)
- Orbit camera: zoom · rotate · pan · click spaces
- Fire FX, smoke plumes, hazard floor colors (safe → critical)
- Capsule people with heading / walk bob (no teleport)
- Glowing path tubes: **blue** safe · **orange** warning · **red** blocked/fire
- Heatmap toggle
- Right **SelectionPanel** — temp, smoke, flame, occupancy, hazard, recommended exit, sensor health, sparkline
- Floating bottom toolbar: Start · Pause · Reset · Start Fire · Smoke · Crowd · Block Exit · Extinguish · Fill 1000 · Random

### Building Designer
- Drag rooms / corridors / stairs / exits onto a grid
- Connect spaces, snap, labels, resize / delete / duplicate floors
- Draft persists across page navigation
- Deploy layout into the live simulation

### Simulation engine (backend)
- Tick loop (~200ms) with WebSocket broadcast
- Hazard fusion: `0.4·Flame + 0.3·Smoke + 0.2·Temp + 0.1·Crowd`
- Fire ignition, gradual smoke/heat, **adjacent spread**
- Multi-exit **A*** every ~1s with congestion / edge-flow costs
- Soft collisions, capacity gates, natural motion (heading, sway)
- Up to **1000** occupants (`spawn-max`)
- Extinguish fire, block/unblock exits, random fire/crowd scenarios

### Dashboard & analytics
- KPI strip: People Inside · Evacuated · Remaining · Avg Temp · Fire Rooms · Blocked / Safe Exits · System health
- 2D floor plan with occupancy bars and color-coded routes
- Live alerts, sensor health, Recharts analytics

### Auth & roles
| User | Password | Access |
|------|----------|--------|
| `admin` | `admin123` | Full |
| `operator` | `operator123` | Simulate |
| `viewer` | `viewer123` | Monitor only |

---

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.11+

### Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

UI: http://localhost:5173

### Docker Compose

```bash
docker compose up --build
```

- Frontend: http://localhost:3000  
- Backend: http://localhost:8000  
- MQTT: `localhost:1883` · Redis: `localhost:6379`  

Optional Postgres: `docker compose --profile full up --build`

---

## Recommended Demo Script

1. Login as `admin` / `admin123`
2. Open **Digital Twin** → **Start**
3. Click a room → **Start Fire** (or use Random)
4. Watch smoke/heat spread, rooms recolor, paths glow and reroute
5. **Block Exit** on an exit node → observe Google Maps–style reroute
6. **1000** to fill the building · **Extinguish** to clear fire
7. Open **Dashboard** / **Analytics** for KPIs and charts
8. **Building Designer** → edit layout → Deploy

---

## Architecture

```
┌─────────────────┐     WebSocket / REST      ┌──────────────────────┐
│  React Twin UI  │ ◄──────────────────────► │  FastAPI Simulation  │
│  Vite · R3F     │                           │  Hazard · A* · Crowd │
│  React Flow     │                           └──────────┬───────────┘
└─────────────────┘                                      │
                                                         ▼
                                              ┌──────────────────────┐
                                              │ Redis · MQTT · SQLite│
                                              └──────────────────────┘
```

Tick: sensors → hazard fusion → edge weights → A* → crowd motion → WebSocket snapshot.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/API.md](docs/API.md).

---

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | JWT |
| GET | `/api/simulation/state` | Full twin snapshot |
| POST | `/api/simulation/start\|pause\|resume\|reset` | Lifecycle |
| POST | `/api/simulation/fire` | Ignite `{ node_id, intensity }` |
| POST | `/api/simulation/extinguish` | Optional `{ node_id }` |
| POST | `/api/simulation/smoke` | Add smoke |
| POST | `/api/simulation/block-exit` | Block exit |
| POST | `/api/simulation/spawn` / `spawn-max` | Crowd (up to 1000) |
| POST | `/api/simulation/random-fire` | Scenario |
| WS | `/ws/simulation` | Live ticks |

---

## Tech Stack

**Frontend:** React 19 · TypeScript · Vite · Tailwind 4 · Framer Motion · R3F / Three.js · React Flow · Recharts · Zustand  

**Backend:** FastAPI · WebSockets · Pydantic · SQLAlchemy · Redis · MQTT · custom A*  

**Infra:** Docker Compose · Mosquitto · Redis · Nginx · Postgres (optional)

---

## Project Layout

```
FIRE-EXIT/
├── backend/app/
│   ├── api/            # REST + WebSocket
│   ├── engines/        # Hazard fusion + A*
│   ├── simulation/     # Tick engine, fire, crowd
│   ├── services/       # MQTT bridge
│   └── db/
├── frontend/src/
│   ├── components/     # Shell, SelectionPanel, toolbar, FloorMap2D, UI
│   ├── pages/          # Dashboard, Twin, Designer, IoT, …
│   ├── pages/twin/     # TwinScene (3D)
│   └── stores/         # Auth + sim + designer draft
├── docs/
├── infra/
└── docker-compose.yml
```

---

## Evaluation Mapping

| Criterion | Implementation |
|-----------|----------------|
| Algorithm & sensor fusion | Weighted fusion + exponential edge costs + A* (typically &lt; 300ms) |
| Simulation quality | Adjacent fire/smoke spread, congestion, 1000 occupants |
| Visual interface | Glass SCADA shell, 3D twin, pulsing path colors |
| Multi-node comms | MQTT `fireexit/{node}/hazard` |
| Fail-safe | Bad sensors raise risk; blocked exits auto-reroute; MQTT down → local sim |

---

## License

MIT — digital-twin demonstration platform for emergency-response / hackathon demos.
