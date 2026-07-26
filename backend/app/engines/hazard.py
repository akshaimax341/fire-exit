"""Hazard fusion engine — combines thermal, particulate, optical, and crowd vectors."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class HazardLevel(str, Enum):
    SAFE = "safe"
    WARNING = "warning"
    DANGER = "danger"
    CRITICAL = "critical"


@dataclass
class SensorReading:
    temperature: float  # °C
    smoke: float  # 0–100 %
    flame: bool
    occupancy: int


@dataclass
class HazardResult:
    temperature_risk: float
    smoke_risk: float
    flame_risk: float
    crowd_risk: float
    score: float
    level: HazardLevel
    blocked: bool


# Tunable weights (NIST-informed defaults)
W_FLAME = 0.40
W_SMOKE = 0.30
W_TEMP = 0.20
W_CROWD = 0.10

# Thresholds
TEMP_BASELINE = 22.0
TEMP_CRITICAL = 90.0
SMOKE_CRITICAL = 100.0
CROWD_CAPACITY_DEFAULT = 20
BLOCK_THRESHOLD = 0.75


def normalize_temperature(temp_c: float) -> float:
    """Map ambient→critical temperature to [0, 1] with soft exponential rise."""
    if temp_c <= TEMP_BASELINE:
        return 0.0
    span = TEMP_CRITICAL - TEMP_BASELINE
    x = min(1.0, (temp_c - TEMP_BASELINE) / span)
    # Exponential weighting: low temps rise slowly, flashover rises fast
    return min(1.0, x ** 1.4 * (1.0 + 0.5 * max(0.0, x - 0.6)))


def normalize_smoke(smoke_pct: float) -> float:
    """Map smoke density percentage to [0, 1]."""
    x = max(0.0, min(1.0, smoke_pct / SMOKE_CRITICAL))
    return x ** 1.2


def normalize_flame(flame: bool) -> float:
    return 1.0 if flame else 0.0


def normalize_crowd(occupancy: int, capacity: int = CROWD_CAPACITY_DEFAULT) -> float:
    if capacity <= 0:
        return 0.0
    return min(1.0, occupancy / capacity)


def compute_hazard(
    reading: SensorReading,
    capacity: int = CROWD_CAPACITY_DEFAULT,
) -> HazardResult:
    """
    Risk = 0.4·Flame + 0.3·Smoke + 0.2·Temperature + 0.1·Crowd

    Edge cost multiplier for pathfinding uses exponential amplification
    so hazardous corridors become prohibitively expensive.
    """
    t = normalize_temperature(reading.temperature)
    s = normalize_smoke(reading.smoke)
    f = normalize_flame(reading.flame)
    c = normalize_crowd(reading.occupancy, capacity)

    score = W_FLAME * f + W_SMOKE * s + W_TEMP * t + W_CROWD * c
    score = max(0.0, min(1.0, score))

    if score >= 0.85 or (f and s > 0.6):
        level = HazardLevel.CRITICAL
    elif score >= 0.55:
        level = HazardLevel.DANGER
    elif score >= 0.25:
        level = HazardLevel.WARNING
    else:
        level = HazardLevel.SAFE

    blocked = score >= BLOCK_THRESHOLD or (f and reading.temperature >= 70)

    return HazardResult(
        temperature_risk=round(t, 4),
        smoke_risk=round(s, 4),
        flame_risk=round(f, 4),
        crowd_risk=round(c, 4),
        score=round(score, 4),
        level=level,
        blocked=blocked,
    )


def edge_hazard_cost(score: float) -> float:
    """
    Exponential edge weight for A*.
    Safe ≈ 0, warning ≈ few units, critical ≈ thousands (effectively blocked).
    """
    if score >= BLOCK_THRESHOLD:
        return 1e6
    # cost = e^(k·score) - 1
    import math

    return math.exp(6.0 * score) - 1.0


def hazard_to_dict(result: HazardResult) -> dict[str, Any]:
    return {
        "temperature_risk": result.temperature_risk,
        "smoke_risk": result.smoke_risk,
        "flame_risk": result.flame_risk,
        "crowd_risk": result.crowd_risk,
        "score": result.score,
        "level": result.level.value,
        "blocked": result.blocked,
        "edge_cost": round(edge_hazard_cost(result.score), 2),
    }
