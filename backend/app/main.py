"""AI-Powered Smart Fire Evacuation System — FastAPI backend."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, building, simulation, analytics, websocket, iot, alerts_stats
from app.config import settings
from app.db.session import init_db
from app.simulation.engine import simulation_manager

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Retry DB so Railway healthchecks can pass after Postgres is reachable
    last_err: Exception | None = None
    for attempt in range(1, 6):
        try:
            await init_db()
            last_err = None
            break
        except Exception as exc:
            last_err = exc
            logger.error("Database init failed (%s/5): %s", attempt, exc)
            await asyncio.sleep(2)
    if last_err is not None:
        logger.error(
            "Starting without confirmed DB schema — check DATABASE_URL / Postgres plugin. Last error: %s",
            last_err,
        )
    await simulation_manager.initialize()
    yield
    await simulation_manager.shutdown()


app = FastAPI(
    title="FireExit Digital Twin API",
    description=(
        "Enterprise AI-Powered Smart Fire Evacuation Digital Twin — "
        "ESP32 telemetry, MQTT, WebSockets, hazard fusion, multi-exit A*/Dijkstra, crowd sim."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(building.router, prefix="/api/building", tags=["Building"])
app.include_router(simulation.router, prefix="/api/simulation", tags=["Simulation"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(iot.router, prefix="/api", tags=["IoT / Telemetry"])
app.include_router(alerts_stats.router, prefix="/api", tags=["Alerts / Statistics"])
app.include_router(websocket.router, tags=["WebSocket"])


@app.get("/")
async def root():
    return {"status": "ok", "service": "FireExit Digital Twin"}


@app.get("/api/health")
async def health():
    from app.services.device_registry import device_registry

    return {
        "status": "operational",
        "service": "FireExit Digital Twin",
        "version": "2.0.0",
        "simulation": simulation_manager.status,
        "mqtt": bool(simulation_manager.mqtt and simulation_manager.mqtt.connected),
        "devices": device_registry.statistics(),
    }
