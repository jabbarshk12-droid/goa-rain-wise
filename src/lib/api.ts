// Client for the local FastAPI microservice (backend/main.py).
// Set VITE_API_URL in a .env file to override (default: http://localhost:8000).

import { TALUKAS } from "./rainfall-data";

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

// LabelEncoder in the training notebook sorts classes alphabetically.
// Taluka encoder → alphabetical order of taluka names present at training time.
// Roof encoder  → alphabetical: Concrete=0, Metal=1, Tile=2.
export const TALUKA_ENCODING: Record<string, number> = Object.fromEntries(
  [...TALUKAS.map((t) => t.name)].sort().map((name, i) => [name, i])
);

export const ROOF_ENCODING = {
  concrete: 0,
  metal: 1,
  tile: 2,
} as const;

export interface PredictRequest {
  taluka: number;
  roof_area: number;
  roof_type: number;
  family_size: number;
  tank_size: number;
}

export interface PredictResponse {
  annual_collection_liters: number;
  water_autonomy_days: number;
  estimated_setup_cost: number;
  payback_period_years: number;
}

export async function predict(input: PredictRequest): Promise<PredictResponse> {
  const res = await fetch(`${API_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Backend ${res.status}: ${await res.text()}`);
  return res.json();
}
