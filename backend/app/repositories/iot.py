"""Repository layer for device / telemetry / alert persistence."""

from __future__ import annotations

from datetime import datetime
from typing import Optional, Sequence

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AlertRecord, Device, EventLog, TelemetrySample


class DeviceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert_from_state(self, state: dict) -> Device:
        q = await self.session.execute(
            select(Device).where(Device.device_id == state["device_id"])
        )
        row = q.scalar_one_or_none()
        now = datetime.utcnow()
        if row is None:
            row = Device(device_id=state["device_id"])
            self.session.add(row)
        row.room_name = state.get("room", row.room_name)
        row.room_type = state.get("room_type", row.room_type)
        row.floor = state.get("floor", row.floor)
        row.node_id = state.get("node_id", row.node_id)
        row.mqtt_topic = state.get("mqtt_topic", row.mqtt_topic or f"fireexit/device/{row.device_id}")
        row.last_temperature = state.get("temperature", row.last_temperature)
        row.last_humidity = state.get("humidity", row.last_humidity)
        row.last_gas = state.get("gas", row.last_gas)
        row.last_smoke = state.get("smoke", row.last_smoke)
        row.last_status = state.get("status", row.last_status)
        row.battery = state.get("battery", row.battery)
        row.signal = state.get("signal", row.signal)
        row.online = state.get("online", True)
        row.last_seen = state.get("last_seen", now)
        row.updated_at = now
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def list_all(self) -> Sequence[Device]:
        q = await self.session.execute(select(Device).order_by(Device.device_id))
        return q.scalars().all()

    async def get(self, device_id: str) -> Optional[Device]:
        q = await self.session.execute(select(Device).where(Device.device_id == device_id))
        return q.scalar_one_or_none()


class TelemetryRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def insert(self, sample: dict) -> TelemetrySample:
        row = TelemetrySample(
            device_id=sample["device_id"],
            node_id=sample.get("node_id"),
            temperature=sample["temperature"],
            humidity=sample.get("humidity", 40.0),
            gas=sample.get("gas", 0.0),
            smoke=sample.get("smoke", 0.0),
            flame=sample.get("flame", False),
            status=sample.get("status", "SAFE"),
            battery=sample.get("battery", 100.0),
            signal=sample.get("signal", -55.0),
            payload_json=sample.get("payload_json", {}),
            recorded_at=sample.get("recorded_at", datetime.utcnow()),
        )
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def recent(self, device_id: str | None = None, limit: int = 100) -> Sequence[TelemetrySample]:
        stmt = select(TelemetrySample).order_by(desc(TelemetrySample.recorded_at)).limit(limit)
        if device_id:
            stmt = stmt.where(TelemetrySample.device_id == device_id)
        q = await self.session.execute(stmt)
        return q.scalars().all()


class AlertRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, alert: dict) -> AlertRecord:
        row = AlertRecord(
            alert_id=alert["alert_id"],
            level=alert.get("level", "INFO"),
            category=alert.get("category", "general"),
            message=alert["message"],
            device_id=alert.get("device_id"),
            node_id=alert.get("node_id"),
            acknowledged=False,
            created_at=alert.get("created_at", datetime.utcnow()),
        )
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def list_recent(self, limit: int = 50, unacked_only: bool = False) -> Sequence[AlertRecord]:
        stmt = select(AlertRecord).order_by(desc(AlertRecord.created_at)).limit(limit)
        if unacked_only:
            stmt = stmt.where(AlertRecord.acknowledged.is_(False))
        q = await self.session.execute(stmt)
        return q.scalars().all()

    async def acknowledge(self, alert_id: str) -> Optional[AlertRecord]:
        q = await self.session.execute(select(AlertRecord).where(AlertRecord.alert_id == alert_id))
        row = q.scalar_one_or_none()
        if not row:
            return None
        row.acknowledged = True
        row.acknowledged_at = datetime.utcnow()
        await self.session.commit()
        await self.session.refresh(row)
        return row


class EventRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def log(self, event_type: str, message: str = "", payload: dict | None = None) -> EventLog:
        row = EventLog(
            event_type=event_type,
            message=message,
            payload_json=payload or {},
        )
        self.session.add(row)
        await self.session.commit()
        return row
