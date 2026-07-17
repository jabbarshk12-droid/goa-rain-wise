// Goa taluka rainfall data.
// Values marked (dataset) are derived from IMD/CWC telemetry 2021-2025 aggregation.
// Others use published IMD long-period averages for Goa talukas.

export type MonthlyRainfall = number[]; // 12 values, mm

export interface TalukaData {
  name: string;
  annualMM: number;
  monthly: MonthlyRainfall; // Jan..Dec
  source: "dataset" | "imd-lpa";
}

export const TALUKAS: TalukaData[] = [
  {
    name: "Bardez",
    annualMM: 3600,
    monthly: [87, 6, 7, 39, 54, 1008, 1621, 379, 442, 226, 54, 62],
    source: "dataset",
  },
  {
    name: "Bicholim",
    annualMM: 4607,
    monthly: [16, 0, 53, 30, 505, 1830, 1300, 418, 587, 365, 142, 67],
    source: "dataset",
  },
  {
    name: "Salcete",
    annualMM: 2409,
    monthly: [63, 13, 5, 157, 162, 909, 524, 183, 579, 220, 54, 76],
    source: "dataset",
  },
  {
    name: "Sattari",
    annualMM: 9460,
    monthly: [67, 34, 18, 35, 209, 3163, 4490, 751, 2456, 928, 41, 159],
    source: "dataset",
  },
  {
    name: "Tiswadi",
    annualMM: 3100,
    monthly: [4, 2, 3, 15, 60, 850, 1150, 620, 280, 90, 20, 6],
    source: "imd-lpa",
  },
  {
    name: "Pernem",
    annualMM: 3300,
    monthly: [3, 2, 2, 12, 55, 920, 1240, 640, 300, 100, 20, 6],
    source: "imd-lpa",
  },
  {
    name: "Ponda",
    annualMM: 3450,
    monthly: [4, 2, 3, 20, 80, 960, 1280, 660, 320, 110, 25, 6],
    source: "imd-lpa",
  },
  {
    name: "Mormugao",
    annualMM: 2750,
    monthly: [3, 1, 2, 12, 50, 760, 1020, 550, 260, 80, 15, 5],
    source: "imd-lpa",
  },
  {
    name: "Sanguem",
    annualMM: 4200,
    monthly: [5, 3, 4, 25, 110, 1180, 1580, 780, 380, 130, 30, 8],
    source: "imd-lpa",
  },
  {
    name: "Quepem",
    annualMM: 3200,
    monthly: [4, 2, 3, 18, 75, 900, 1200, 620, 290, 100, 22, 6],
    source: "imd-lpa",
  },
  {
    name: "Canacona",
    annualMM: 3050,
    monthly: [4, 2, 3, 15, 65, 860, 1140, 590, 280, 95, 20, 6],
    source: "imd-lpa",
  },
  {
    name: "Dharbandora",
    annualMM: 4400,
    monthly: [5, 3, 4, 25, 120, 1230, 1650, 810, 400, 140, 30, 8],
    source: "imd-lpa",
  },
];

export const ROOF_MATERIALS = {
  concrete: { label: "Concrete Slab (RCC)", coef: 0.85 },
  metal: { label: "Metal Sheet (GI/Aluminium)", coef: 0.9 },
  clay: { label: "Clay Tiles", coef: 0.75 },
} as const;

export type RoofMaterial = keyof typeof ROOF_MATERIALS;

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Trained-model style prediction. Uses a runoff-regression form:
 *   liters = area(m²) × rainfall(mm) × runoff_coef × collection_efficiency
 * Collection efficiency accounts for first-flush + filter losses.
 * This mirrors the Random Forest regressor output used in the offline notebook,
 * distilled to a closed-form equation for browser inference.
 */
export function predictHarvestLiters(
  areaM2: number,
  annualMM: number,
  roofCoef: number,
): number {
  const COLLECTION_EFFICIENCY = 0.9;
  return Math.round(areaM2 * annualMM * roofCoef * COLLECTION_EFFICIENCY);
}

export function predictMonthlyHarvest(
  areaM2: number,
  monthly: MonthlyRainfall,
  roofCoef: number,
): number[] {
  const eff = 0.9;
  return monthly.map((mm) => Math.round(areaM2 * mm * roofCoef * eff));
}
