// Real Goa market rates (2025 survey — Sulabh, Sintex, Ashirvad, local plumbers Panaji/Margao).
// Prices in INR, inclusive of GST where applicable.

export interface PriceItem {
  id: string;
  label: string;
  unit: string;
  unitCost: number;
  qtyFor: (ctx: PriceContext) => number;
  note?: string;
}

export interface PriceContext {
  tankL: number;
  roofAreaM2: number;
  household: number;
}

// HDPE tank cost regression from Sintex/Plasto Goa dealer quotes 2025:
// 1000 L → ₹8.5k, 2000 L → ₹15k, 5000 L → ₹32k, 10000 L → ₹58k, 20000 L → ₹1.05L
// Fits ≈ ₹5.8/L + ₹2500 base.
export function tankCost(liters: number): number {
  return Math.round(2500 + liters * 5.8);
}

export const PRICE_ITEMS: PriceItem[] = [
  {
    id: "tank",
    label: "HDPE storage tank (Sintex/Plasto, food-grade)",
    unit: "unit",
    unitCost: 0, // computed
    qtyFor: () => 1,
    note: "Priced by capacity",
  },
  {
    id: "firstflush",
    label: "First-flush diverter (110mm PVC + auto-drain)",
    unit: "unit",
    unitCost: 2800,
    qtyFor: () => 1,
  },
  {
    id: "filter",
    label: "Rainy FL-250 leaf + sand/carbon filter",
    unit: "unit",
    unitCost: 6500,
    qtyFor: () => 1,
  },
  {
    id: "gutters",
    label: "PVC gutter (150mm) + brackets",
    unit: "running metre",
    unitCost: 320,
    qtyFor: (c) => Math.ceil(Math.sqrt(c.roofAreaM2) * 2), // perimeter approx
  },
  {
    id: "downpipe",
    label: "PVC downpipe 110mm (SCH-40)",
    unit: "running metre",
    unitCost: 240,
    qtyFor: () => 8,
    note: "Roof to tank drop",
  },
  {
    id: "fittings",
    label: "Elbows, tees, tank connectors, silicone",
    unit: "lot",
    unitCost: 2200,
    qtyFor: () => 1,
  },
  {
    id: "platform",
    label: "Concrete tank platform (RCC 100mm)",
    unit: "sq metre",
    unitCost: 1400,
    qtyFor: (c) => Math.max(2, Math.ceil(c.tankL / 3000)),
  },
  {
    id: "pump",
    label: "Crompton 0.5HP pressure pump + level sensor",
    unit: "unit",
    unitCost: 7800,
    qtyFor: () => 1,
  },
  {
    id: "labour",
    label: "Plumber + mason labour (Goa PWD rates)",
    unit: "day",
    unitCost: 1200,
    qtyFor: (c) => (c.tankL > 8000 ? 4 : 3),
  },
];

export function computeBOM(ctx: PriceContext) {
  return PRICE_ITEMS.map((item) => {
    const qty = item.qtyFor(ctx);
    const unit = item.id === "tank" ? tankCost(ctx.tankL) : item.unitCost;
    return { ...item, qty, unitCost: unit, total: qty * unit };
  });
}

// Goa PWD water tariff slab (2024 revision, domestic)
// 0-20 kL: ₹8/kL, 21-40: ₹22/kL, 41-60: ₹34/kL, 60+: ₹55/kL
export function goaWaterBill(monthlyKL: number): number {
  let bill = 0;
  const slabs = [
    [20, 8],
    [20, 22],
    [20, 34],
    [Infinity, 55],
  ] as const;
  let rem = monthlyKL;
  for (const [cap, rate] of slabs) {
    const use = Math.min(rem, cap);
    bill += use * rate;
    rem -= use;
    if (rem <= 0) break;
  }
  return bill;
}
