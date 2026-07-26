#!/usr/bin/env python3
"""Python simulation injector — custom fire timelines.

Broadcasts staged multi-sensor payloads into the live API to demonstrate
slow smolder vs flashover scenarios.

Usage:
  python scripts/inject_timeline.py --scenario flashover
  python scripts/inject_timeline.py --scenario smolder --base http://localhost:8000
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request


def login(base: str) -> str:
    req = urllib.request.Request(
        f"{base}/api/auth/login",
        data=json.dumps({"username": "operator", "password": "operator123"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())["access_token"]


def post(base: str, path: str, token: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{base}{path}",
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


SCENARIOS = {
    "flashover": [
        ("start", None),
        ("sleep", 1.0),
        ("fire", {"node_id": "cafeteria", "intensity": 0.7}),
        ("sleep", 2.0),
        ("smoke", {"node_id": "corr_b", "amount": 40}),
        ("sleep", 2.0),
        ("fire", {"node_id": "office_3", "intensity": 0.55}),
        ("sleep", 3.0),
        ("block-exit", {"exit_id": "exit_south"}),
    ],
    "smolder": [
        ("start", None),
        ("sleep", 1.0),
        ("fire", {"node_id": "server_room", "intensity": 0.25}),
        ("sleep", 3.0),
        ("smoke", {"node_id": "server_room", "amount": 15}),
        ("sleep", 3.0),
        ("smoke", {"node_id": "corr_a", "amount": 20}),
        ("sleep", 4.0),
        ("fire", {"node_id": "server_room", "intensity": 0.5}),
    ],
}


def run(scenario: str, base: str):
    token = login(base)
    print(f"Injecting scenario={scenario}")
    for step, payload in SCENARIOS[scenario]:
        if step == "sleep":
            print(f"  wait {payload}s")
            time.sleep(float(payload))  # type: ignore[arg-type]
            continue
        path = f"/api/simulation/{step}"
        print(f"  POST {path} {payload or ''}")
        try:
            post(base, path, token, payload)  # type: ignore[arg-type]
        except urllib.error.HTTPError as e:
            print(f"  ! {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", choices=list(SCENARIOS.keys()), default="flashover")
    parser.add_argument("--base", default="http://localhost:8000")
    args = parser.parse_args()
    run(args.scenario, args.base)
