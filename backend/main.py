"""
PureRain AI — FastAPI microservice
Loads the RandomForest model trained in PureRain.ipynb and exposes a
/predict endpoint that returns annual rainwater collection, household
water autonomy, estimated setup cost and payback period.

Model features (order as trained in the notebook):
    [Taluka (encoded), Month (1-12), RoofArea (m²), RoofType (encoded)]
Target:
    RunoffLiters (monthly)
"""

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="PureRain AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent
model = joblib.load(BASE_DIR / "rainfall_model.pkl")


class UserInput(BaseModel):
    taluka: int
    roof_area: float
    roof_type: int
    family_size: int
    tank_size: int


@app.get("/")
def home():
    return {"status": "online"}


@app.post("/predict")
def predict(data: UserInput):
    # Predict runoff for every month (1..12) and sum for annual total
    rows = [
        {
            "Taluka": data.taluka,
            "Month": m,
            "RoofArea": data.roof_area,
            "RoofType": data.roof_type,
        }
        for m in range(1, 13)
    ]
    features = pd.DataFrame(rows)
    monthly = np.clip(model.predict(features), a_min=0, a_max=None)
    annual_liters = float(monthly.sum())

    daily_consumption = data.family_size * 135  # litres/day (IS 1172)
    autonomy_days = (
        data.tank_size / daily_consumption if daily_consumption > 0 else 0
    )

    setup_cost = data.tank_size * 1.5 + data.roof_area * 50
    annual_savings = annual_liters * 0.002
    payback_years = setup_cost / annual_savings if annual_savings > 0 else 0

    return {
        "annual_collection_liters": round(annual_liters, 2),
        "water_autonomy_days": round(autonomy_days, 1),
        "estimated_setup_cost": round(setup_cost, 2),
        "payback_period_years": round(payback_years, 1),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
