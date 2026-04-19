from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sklearn.ensemble import IsolationForest
from sklearn.metrics import silhouette_score
import numpy as np
import pandas as pd

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/detect")
def detect(lat: float, lon: float):

    # 🌍 MAKE DATA DEPEND ON LOCATION (KEY FIX)
    seed = int((lat * 1000) + (lon * 1000)) % 99999
    np.random.seed(seed)

    days = 60

    # 📡 simulate satellite drift + noise
    base = 1850 + (lat % 3) * 10
    methane = np.random.normal(base, 20, days)

    # 🔥 dynamic anomaly position
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
            "samples": days
        },
        "detected_leaks": anomalies.to_dict(orient="records"),
        "full_data": [
            {"methane": float(m), "anomaly": int(p)}
            for m, p in zip(methane, preds)
        ]
    }