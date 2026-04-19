import asyncio
import os
from typing import Any

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sklearn.ensemble import IsolationForest
from sklearn.metrics import silhouette_score
import numpy as np
import pandas as pd

app = FastAPI()

MONITOR_INTERVAL_SECONDS = 15
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
LEAK_METHANE_HIGH_THRESHOLD = 2100

monitor_task: asyncio.Task[None] | None = None
monitor_stop_event = asyncio.Event()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def run_isolation_detection(lat: float, lon: float) -> dict[str, Any]:
    """Run methane anomaly detection simulation for a coordinate pair."""

    seed = int((lat * 1000) + (lon * 1000)) % 99999
    np.random.seed(seed)

    days = 60
    base = 1850 + (lat % 3) * 10
    methane = np.random.normal(base, 20, days)

    anomaly_index = np.random.randint(40, 59)
    methane[anomaly_index] += np.random.randint(200, 400)

    df = pd.DataFrame({"methane": methane})
    X = df[["methane"]].values

    model = IsolationForest(contamination=0.03, random_state=42)
    preds = model.fit_predict(X)

    score = silhouette_score(X, preds)

    mean = df["methane"].mean()
    std = df["methane"].std()

    anomalies = df[preds == -1].copy()
    anomalies["confidence"] = anomalies["methane"].apply(
        lambda x: round(min(99.9, (abs(x - mean) / std) * 18), 1)
    )

    return {
        "status": "success",
        "coordinates": {"lat": lat, "lon": lon},
        "metrics": {
            "silhouette_score": round(score, 4),
            "samples": days,
        },
        "detected_leaks": anomalies.to_dict(orient="records"),
        "full_data": [
            {"methane": float(m), "anomaly": int(p)} for m, p in zip(methane, preds)
        ],
    }


def _supabase_headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


async def fetch_locations_from_supabase(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    response = await client.get(
        f"{SUPABASE_URL}/rest/v1/locations",
        headers=_supabase_headers(),
        params={
            "select": "id,created_by,name,latitude,longitude,is_active",
            "is_active": "eq.true",
        },
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


async def insert_leak_log(
    client: httpx.AsyncClient,
    location: dict[str, Any],
    methane_level: float,
    confidence_score: float,
) -> None:
    severity = "high" if methane_level > LEAK_METHANE_HIGH_THRESHOLD else "medium"

    payload = {
        "location_id": str(location["id"]),
        "user_id": str(location["created_by"]),
        "methane_level": methane_level,
        "confidence_score": confidence_score,
        "severity": severity,
    }

    response = await client.post(
        f"{SUPABASE_URL}/rest/v1/leak_logs",
        headers={**_supabase_headers(), "Prefer": "return=minimal"},
        json=payload,
        timeout=15,
    )
    response.raise_for_status()


async def run_scan_once() -> dict[str, Any]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return {
            "status": "skipped",
            "reason": "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
        }

    scanned = 0
    inserted = 0
    errors: list[str] = []

    async with httpx.AsyncClient() as client:
        try:
            locations = await fetch_locations_from_supabase(client)
        except Exception as exc:  # pragma: no cover - runtime network error path
            return {
                "status": "error",
                "reason": f"Failed to fetch locations: {exc}",
            }

        for location in locations:
            scanned += 1
            lat = float(location["latitude"])
            lon = float(location["longitude"])
            detection = run_isolation_detection(lat, lon)
            leaks = detection["detected_leaks"]

            if not leaks:
                continue

            for leak in leaks:
                methane_level = float(leak["methane"])
                confidence_score = float(leak["confidence"])

                try:
                    await insert_leak_log(client, location, methane_level, confidence_score)
                    inserted += 1
                    print(
                        "[SkySpy Monitor] Anomaly detected at"
                        f" {location['name']} ({lat:.4f}, {lon:.4f})"
                        f" methane={methane_level:.2f} confidence={confidence_score:.1f}"
                    )
                except Exception as exc:  # pragma: no cover - runtime network error path
                    errors.append(f"Location {location['id']}: {exc}")

    return {
        "status": "success",
        "scanned_locations": scanned,
        "inserted_logs": inserted,
        "errors": errors,
    }


async def monitoring_loop() -> None:
    while not monitor_stop_event.is_set():
        result = await run_scan_once()
        print(f"[SkySpy Monitor] Scan cycle result: {result}")
        try:
            await asyncio.wait_for(monitor_stop_event.wait(), timeout=MONITOR_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            continue


@app.on_event("startup")
async def startup_monitor() -> None:
    global monitor_task
    monitor_stop_event.clear()
    monitor_task = asyncio.create_task(monitoring_loop())
    print("[SkySpy Monitor] Background monitoring started.")


@app.on_event("shutdown")
async def shutdown_monitor() -> None:
    global monitor_task
    monitor_stop_event.set()
    if monitor_task:
        await monitor_task
        monitor_task = None
    print("[SkySpy Monitor] Background monitoring stopped.")

@app.get("/detect")
def detect(lat: float, lon: float):
    return run_isolation_detection(lat, lon)


@app.get("/scan")
async def scan() -> dict[str, Any]:
    """Manual trigger endpoint for a one-time monitoring scan."""
    return await run_scan_once()