# PureRain AI

A React + FastAPI web application that predicts household rainwater harvesting potential for Goa, India using a trained machine learning model.

- **Live frontend**: https://goa-rain-wise-frontend.netlify.app
- **Live backend**: https://goa-rain-wise-1.onrender.com

## What it does

PureRain AI helps Goa homeowners estimate how much rainwater they can collect from their rooftop each year. Users select their local taluka, enter rooftop area and material, and specify household size and tank capacity. The frontend sends these inputs to the Python FastAPI backend that runs a trained RandomForest model and returns annual collection, water autonomy days, estimated setup cost, and payback period.

## Tech stack

- **Frontend**: React 19 + TanStack Start + Tailwind CSS + Recharts + jsPDF
- **Backend**: Python + FastAPI + scikit-learn + joblib
- **Model**: RandomForestRegressor trained on taluka-wise monthly rainfall data

## Project structure

```
├── backend/
│   ├── main.py                 # FastAPI prediction service
│   ├── purerain_model.pkl      # Trained RandomForest model
│   ├── taluka_encoder.pkl      # Taluka label encoder
│   ├── roof_encoder.pkl        # Roof type label encoder
│   ├── requirements.txt        # Python dependencies
│   └── README.md               # Backend setup guide
├── src/
│   ├── lib/
│   │   ├── api.ts              # Frontend client for /predict
│   │   ├── rainfall-data.ts    # Goa taluka rainfall profiles
│   │   └── pricing.ts          # Goa material pricing & BOM
│   └── routes/
│       ├── __root.tsx          # Root layout
│       └── index.tsx           # Main dashboard
├── package.json
├── src/styles.css
└── vite.config.ts
```

## Quick start

### 1. Start the Python backend

Open a terminal in the `backend` folder:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate.bat
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The backend will be available at `http://localhost:8000`.

### 2. Start the React frontend

Open another terminal in the project root:

```bash
bun install
bun run dev
```

The frontend will open at `http://localhost:8080` and call the local backend automatically.

## API endpoint

`POST http://localhost:8000/predict`

Request body:

```json
{
  "taluka": 7,
  "roof_area": 100,
  "roof_type": 0,
  "family_size": 4,
  "tank_size": 5000
}
```

Response:

```json
{
  "annual_collection_liters": 184175.99,
  "water_autonomy_days": 9.3,
  "estimated_setup_cost": 12500.0,
  "payback_period_years": 33.9
}
```

## Model inputs

The trained model expects these features in order:

| Feature    | Type   | Description                          |
|------------|--------|--------------------------------------|
| `Taluka`   | int    | Encoded taluka name                  |
| `Month`    | int    | 1–12, batched internally for annual total |
| `RoofArea` | float  | Rooftop area in square meters        |
| `RoofType` | int    | Encoded roof material                |

Frontend string values are mapped to integers using the encoders loaded from `taluka_encoder.pkl` and `roof_encoder.pkl`.

## Features

- Dropdown selection of all 12 Goa talukas
- Interactive rooftop area slider
- Roof material selection (Concrete, Metal, Clay Tiles)
- Household size and tank capacity inputs
- Live ML-powered prediction display
- Monthly harvest visualization chart
- Water autonomy tracking
- Financial analysis with setup cost and payback period
- Downloadable PDF engineering blueprint report

## Deployment

The frontend can be deployed to any static hosting service. The backend must be hosted separately and the frontend pointed at it via the `VITE_API_URL` environment variable.

Current deployments:

- Frontend: https://goa-rain-wise-frontend.netlify.app
- Backend: https://goa-rain-wise-1.onrender.com

Build the frontend against the deployed backend:

```bash
VITE_API_URL=https://goa-rain-wise-1.onrender.com bun run build
```

Netlify users can also set `VITE_API_URL` under **Site settings → Environment variables**.

## License

MIT
