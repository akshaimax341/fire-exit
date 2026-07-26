"""SQLAlchemy models — users, layouts, devices, telemetry, alerts, events."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(128), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(32), default="operator")
    full_name: Mapped[str] = mapped_column(String(128), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class BuildingLayout(Base):
    __tablename__ = "building_layouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(Text, default="")
    floors: Mapped[int] = mapped_column(Integer, default=1)
    layout_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(32), default="idle")
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    metrics_json: Mapped[dict] = mapped_column(JSON, default=dict)
    config_json: Mapped[dict] = mapped_column(JSON, default=dict)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    room_name: Mapped[str] = mapped_column(String(128), default="")
    room_type: Mapped[str] = mapped_column(String(32), default="ROOM")
    floor: Mapped[int] = mapped_column(Integer, default=0)
    node_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    mqtt_topic: Mapped[str] = mapped_column(String(128), default="")
    last_temperature: Mapped[float] = mapped_column(Float, default=22.0)
    last_humidity: Mapped[float] = mapped_column(Float, default=40.0)
    last_gas: Mapped[float] = mapped_column(Float, default=0.0)
    last_smoke: Mapped[float] = mapped_column(Float, default=0.0)
    last_status: Mapped[str] = mapped_column(String(32), default="SAFE")
    battery: Mapped[float] = mapped_column(Float, default=100.0)
    signal: Mapped[float] = mapped_column(Float, default=-55.0)
    online: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    meta_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TelemetrySample(Base):
    __tablename__ = "telemetry_samples"
    __table_args__ = (Index("ix_telemetry_device_time", "device_id", "recorded_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    node_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    temperature: Mapped[float] = mapped_column(Float)
    humidity: Mapped[float] = mapped_column(Float, default=40.0)
    gas: Mapped[float] = mapped_column(Float, default=0.0)
    smoke: Mapped[float] = mapped_column(Float, default=0.0)
    flame: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(32), default="SAFE")
    battery: Mapped[float] = mapped_column(Float, default=100.0)
    signal: Mapped[float] = mapped_column(Float, default=-55.0)
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class AlertRecord(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alert_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    level: Mapped[str] = mapped_column(String(32), default="INFO")  # INFO WARNING CRITICAL
    category: Mapped[str] = mapped_column(String(64), default="general")
    message: Mapped[str] = mapped_column(Text)
    device_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    node_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class EventLog(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    message: Mapped[str] = mapped_column(Text, default="")
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
