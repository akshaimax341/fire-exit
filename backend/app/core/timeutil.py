"""UTC timestamps with millisecond precision for logs / API payloads."""

from __future__ import annotations

from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_ms(dt: datetime | None = None) -> str:
    """ISO-8601 UTC with exactly 3 fractional digits, e.g. 2026-07-26T15:01:02.345Z."""
    d = dt or utc_now()
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    else:
        d = d.astimezone(timezone.utc)
    ms = d.microsecond // 1000
    return d.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ms:03d}Z"


def epoch_ms(dt: datetime | None = None) -> int:
    d = dt or utc_now()
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return int(d.timestamp() * 1000)
