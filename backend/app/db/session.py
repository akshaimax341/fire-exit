from __future__ import annotations

import logging
import os
import ssl
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger(__name__)


def _engine_kwargs(url: str) -> tuple[str, dict]:
    """Strip libpq-only query params that asyncpg rejects; enable SSL for Railway/public PG."""
    if not url.startswith("postgresql"):
        return url, {"echo": False}

    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    connect_args: dict = {}

    sslmode = (query.pop("sslmode", None) or "").lower()
    query.pop("channel_binding", None)
    host = (parsed.hostname or "").lower()

    # Public Railway / Heroku-style hosts need SSL; internal *.railway.internal usually does not.
    needs_ssl = sslmode in {"require", "verify-ca", "verify-full", "prefer"} or (
        bool(os.getenv("RAILWAY_ENVIRONMENT"))
        and "railway.internal" not in host
        and host not in {"", "localhost", "127.0.0.1"}
    )

    if needs_ssl:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        connect_args["ssl"] = ctx

    # Fail fast when Postgres is unreachable (Railway healthcheck window)
    connect_args.setdefault("timeout", 10)

    clean = urlunparse(parsed._replace(query=urlencode(query)))
    kwargs: dict = {"echo": False, "pool_pre_ping": True}
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
    logger.info("Database schema ready")


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
