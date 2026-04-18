from fastapi import FastAPI
from sklearn.ensemble import IsolationForest
from sklearn.metrics import silhouette_score
import pandas as pd
import numpy as np

app = FastAPI()


@app.get("/detect")
async def detect_leak(lat: float, lon: float):
    # 1. DATA GENERATION
    np.random.seed(42)
    days = 60  # More days make the Silhouette Score more reliable
    methane_data = np.random.normal(1850, 15, days)
    methane_data[55] = 2200  # Major Leak

    df = pd.DataFrame({"methane": methane_data})
    X = df[["methane"]].values

    # 2. RUN MODEL
    model = IsolationForest(contamination=0.05, random_state=42)
    preds = model.fit_predict(X)

    # 3. CALCULATE ACCURACY (Silhouette Score)
    # This measures how well the model separated the "Leak" group from "Normal" group
    # Note: Requires at least 2 clusters to be found
    score = silhouette_score(X, preds)

    # 4. DYNAMIC CONFIDENCE
    mean_val = df["methane"].mean()
    std_val = df["methane"].std()

    anomalies = df[preds == -1].copy()
    anomalies["confidence"] = anomalies["methane"].apply(
        lambda x: min(99.9, round((abs(x - mean_val) / std_val) * 15, 1))
    )

    return {
        "status": "success",
        "coordinates": {"lat": lat, "lon": lon},
        "metrics": {
            "silhouette_score": round(score, 4),  # Higher is better separation
            "model_type": "Isolation Forest",
            "samples_analyzed": days,
        },
        "detected_leaks": anomalies[["methane", "confidence"]].to_dict(
            orient="records"
        ),
        "full_report": [
            {"methane": m, "is_anomaly": int(p)} for m, p in zip(methane_data, preds)
        ],
    }
