from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


def _engine_kwargs(url: str) -> tuple[str, dict]:
    """Strip libpq-only query params that asyncpg rejects; enable SSL when required."""
    if not url.startswith("postgresql"):
        return url, {}

    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    connect_args: dict = {}

    sslmode = (query.pop("sslmode", None) or "").lower()
    if sslmode in {"require", "verify-ca", "verify-full"}:
        connect_args["ssl"] = True
    query.pop("channel_binding", None)

    clean = urlunparse(parsed._replace(query=urlencode(query)))
    kwargs: dict = {"echo": False}
    if connect_args:
        kwargs["connect_args"] = connect_args
    return clean, kwargs


_db_url, _engine_opts = _engine_kwargs(settings.DATABASE_URL)
engine = create_async_engine(_db_url, **_engine_opts)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    from app.db import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
