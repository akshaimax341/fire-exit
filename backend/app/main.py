"""AI-Powered Smart Fire Evacuation System — FastAPI backend."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, building, simulation, analytics, websocket
from app.config import settings
from app.db.session import init_db
from app.simulation.engine import simulation_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await simulation_manager.initialize()
    yield
    await simulation_manager.shutdown()


app = FastAPI(
    title="FireExit Digital Twin API",
    description="AI-Powered Smart Fire Evacuation System with Real-Time Digital Twin",
    version="1.0.0",
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
app.include_router(websocket.router, tags=["WebSocket"])


@app.get("/api/health")
async def health():
    return {
        "status": "operational",
        "service": "FireExit Digital Twin",
        "version": "1.0.0",
        "simulation": simulation_manager.status,
    }
