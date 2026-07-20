"""
PureRain AI — FastAPI microservice
Loads the RandomForest model trained in PureRain.ipynb and exposes a
single /predict endpoint that returns monthly + annual rainwater runoff
(litres) for a given Goa taluka, roof area (m²) and roof material.

Model features (in order, as trained in the notebook):
    [Taluka (encoded), Month (1-12), RoofArea (m²), RoofType (encoded)]
Target:
    RunoffLiters
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import List

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Load serialized artefacts
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent
MODEL_PATH = BASE_DIR / "purerain_model.pkl"
TALUKA_ENC_PATH = BASE_DIR / "taluka_encoder.pkl"
ROOF_ENC_PATH = BASE_DIR / "roof_encoder.pkl"

model = joblib.load(MODEL_PATH)
taluka_encoder = joblib.load(TALUKA_ENC_PATH)
roof_encoder = joblib.load(ROOF_ENC_PATH)

# The notebook was trained on the CWC Goa dataset which only contains the
# PONDA tehsil, and the roof categories are Concrete / Metal / Tile.
# We keep an explicit fallback mapping in case the pickled LabelEncoders
# were fit on already-encoded integers.
TALUKA_FALLBACK = {"PONDA": 0}
ROOF_FALLBACK = {"Concrete": 0, "Metal": 1, "Tile": 2}


def _encode(encoder, fallback: dict, value: str, kind: str) -> int:
    try:
        classes = [str(c) for c in encoder.classes_]
        if value in classes:
            return int(encoder.transform([value])[0])
    except Exception:
        pass
    if value in fallback:
        return fallback[value]
    raise HTTPException(
        status_code=400,
        detail=f"Unknown {kind} '{value}'. Allowed: {list(fallback.keys())}",
    )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class PredictRequest(BaseModel):
    taluka: str = Field(..., examples=["PONDA"])
    roof_area: float = Field(..., gt=0, description="Roof area in square metres")
    roof_type: str = Field(..., examples=["Concrete", "Metal", "Tile"])


class MonthlyPrediction(BaseModel):
    month: int
    liters: float


class PredictResponse(BaseModel):
    taluka: str
    roof_area: float
    roof_type: str
    monthly: List[MonthlyPrediction]
    annual_liters: float


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="PureRain AI Prediction Service",
    description="Serves runoff predictions from the trained RandomForest model.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FEATURE_COLUMNS = ["Taluka", "Month", "RoofArea", "RoofType"]


@app.get("/")
def root():
    return {
        "service": "PureRain AI",
        "status": "ok",
        "model": type(model).__name__,
        "talukas": list(TALUKA_FALLBACK.keys()),
        "roof_types": list(ROOF_FALLBACK.keys()),
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    taluka_enc = _encode(taluka_encoder, TALUKA_FALLBACK, req.taluka, "taluka")
    roof_enc = _encode(roof_encoder, ROOF_FALLBACK, req.roof_type, "roof_type")

    # Build one row per month (1..12) and batch-predict
    rows = [
        [taluka_enc, month, req.roof_area, roof_enc]
        for month in range(1, 13)
    ]
    X = pd.DataFrame(rows, columns=FEATURE_COLUMNS)
    preds = model.predict(X)
    preds = np.clip(preds, a_min=0, a_max=None)

    monthly = [
        MonthlyPrediction(month=int(m), liters=float(round(l, 2)))
        for m, l in zip(range(1, 13), preds)
    ]
    return PredictResponse(
        taluka=req.taluka,
        roof_area=req.roof_area,
        roof_type=req.roof_type,
        monthly=monthly,
        annual_liters=float(round(preds.sum(), 2)),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=False,
    )
