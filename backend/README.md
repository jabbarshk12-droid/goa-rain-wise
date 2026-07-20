# PureRain AI — FastAPI Backend

Lightweight microservice that loads the RandomForest model trained in
`PureRain.ipynb` and serves runoff predictions.

## Files
- `main.py` — FastAPI app with `/predict`
- `purerain_model.pkl` — trained RandomForestRegressor
- `taluka_encoder.pkl`, `roof_encoder.pkl` — LabelEncoders used at training time
- `requirements.txt` — pinned deps

## Run locally
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Docs UI: http://localhost:8000/docs

## Example request
```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"taluka":"PONDA","roof_area":100,"roof_type":"Concrete"}'
```

Response:
```json
{
  "taluka": "PONDA",
  "roof_area": 100,
  "roof_type": "Concrete",
  "monthly": [{"month": 1, "liters": 0.0}, ...],
  "annual_liters": 184175.99
}
```

## Model contract
Features (order matters): `Taluka` (encoded), `Month` (1–12), `RoofArea` (m²),
`RoofType` (encoded). Target: `RunoffLiters`.

The training dataset (CWC Goa, 1991–2020) covers the **PONDA** tehsil and roof
categories **Concrete / Metal / Tile** — those are the only valid inputs.

## Connecting the React frontend
Point the frontend to `http://localhost:8000/predict`. CORS is open (`*`) for
local development; restrict `allow_origins` before deploying.
