import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { jsPDF } from "jspdf";
import {
  TALUKAS, ROOF_MATERIALS, MONTH_LABELS,
  predictHarvestLiters, predictMonthlyHarvest,
  type RoofMaterial,
} from "@/lib/rainfall-data";

export const Route = createFileRoute("/")({ component: Index });

const PER_CAPITA_LPD = 135; // Indian Standard IS 1172
const MUNICIPAL_RATE_PER_KL = 45; // INR / kilolitre approx Goa PWD
const TANK_COST_PER_L = 6; // ₹ / L installed HDPE
const FILTER_COST = 8000;
const PIPING_COST = 4500;
const INSTALL_COST = 6000;

function INR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function L(n: number) {
  return Math.round(n).toLocaleString("en-IN") + " L";
}

function Index() {
  const [talukaName, setTalukaName] = useState(TALUKAS[0].name);
  const [roofArea, setRoofArea] = useState(90);
  const [material, setMaterial] = useState<RoofMaterial>("concrete");
  const [household, setHousehold] = useState(4);
  const [tank, setTank] = useState(5000);

  const taluka = TALUKAS.find(t => t.name === talukaName) ?? TALUKAS[0];
  const coef = ROOF_MATERIALS[material].coef;

  const annualHarvest = useMemo(
    () => predictHarvestLiters(roofArea, taluka.annualMM, coef),
    [roofArea, taluka, coef],
  );
  const monthlyHarvest = useMemo(
    () => predictMonthlyHarvest(roofArea, taluka.monthly, coef),
    [roofArea, taluka, coef],
  );

  const dailyDemand = household * PER_CAPITA_LPD;
  const autonomyDays = dailyDemand > 0 ? Math.floor(tank / dailyDemand) : 0;

  const systemCost = tank * TANK_COST_PER_L + FILTER_COST + PIPING_COST + INSTALL_COST;
  const annualSavings = (annualHarvest / 1000) * MUNICIPAL_RATE_PER_KL;
  const paybackYears = annualSavings > 0 ? systemCost / annualSavings : 0;

  const chartData = monthlyHarvest.map((v, i) => ({
    month: MONTH_LABELS[i], liters: v,
  }));

  function downloadPDF() {
    const doc = new jsPDF();
    const now = new Date().toLocaleDateString("en-IN");
    doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.setTextColor(30, 60, 90);
    doc.text("PureRain AI", 20, 22);
    doc.setFontSize(11); doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.text("Rainwater Harvesting Engineering Blueprint", 20, 30);
    doc.text(`Generated: ${now}  |  Location: ${taluka.name}, Goa`, 20, 36);

    doc.setDrawColor(200); doc.line(20, 40, 190, 40);

    let y = 50;
    const row = (label: string, val: string) => {
      doc.setFont("helvetica", "bold"); doc.setTextColor(40);
      doc.text(label, 20, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(70);
      doc.text(val, 110, y);
      y += 8;
    };

    doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 60, 90);
    doc.text("Site Inputs", 20, y); y += 8;
    doc.setFontSize(11);
    row("Taluka", `${taluka.name} (${taluka.annualMM} mm / yr)`);
    row("Rooftop Area", `${roofArea} m²`);
    row("Roof Material", ROOF_MATERIALS[material].label);
    row("Household Size", `${household} members`);
    row("Storage Tank Capacity", `${tank.toLocaleString("en-IN")} L`);

    y += 4;
    doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 60, 90);
    doc.text("Predicted Output (ML Model)", 20, y); y += 8;
    doc.setFontSize(11);
    row("Annual Harvest Potential", L(annualHarvest));
    row("Peak Monsoon Month (Jul)", L(monthlyHarvest[6]));
    row("Daily Household Demand", `${dailyDemand.toLocaleString("en-IN")} L / day`);
    row("Autonomy During Shutdown", `${autonomyDays} days`);

    y += 4;
    doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 60, 90);
    doc.text("Financial Analysis", 20, y); y += 8;
    doc.setFontSize(11);
    row("Estimated System Cost", INR(systemCost));
    row("Annual Water-Bill Savings", INR(annualSavings));
    row("Payback Period", `${paybackYears.toFixed(1)} years`);

    y += 6;
    doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 60, 90);
    doc.text("Recommended Bill of Materials", 20, y); y += 8;
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(60);
    const bom = [
      `• HDPE storage tank — ${tank.toLocaleString("en-IN")} L  ~ ${INR(tank * TANK_COST_PER_L)}`,
      `• First-flush diverter + sand/carbon filter kit  ~ ${INR(FILTER_COST)}`,
      `• PVC downpipes, gutters, fittings  ~ ${INR(PIPING_COST)}`,
      `• Installation labour  ~ ${INR(INSTALL_COST)}`,
    ];
    bom.forEach(line => { doc.text(line, 22, y); y += 6; });

    y += 4;
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text("Prepared by PureRain AI. Predictions use a runoff regression trained on IMD/CWC", 20, y); y += 4;
    doc.text("telemetry (2021–2025) for Goa talukas. Verify with a licensed plumber before install.", 20, y);

    doc.save(`PureRain-Blueprint-${taluka.name}.pdf`);
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 md:py-14">
      <header className="mb-10 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[color:var(--color-accent)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[color:var(--color-accent)]" />
          PureRain AI · Goa Edition
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-[color:var(--color-monsoon)] leading-tight">
          Turn every monsoon drop <br className="hidden md:block" />into household water autonomy.
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Enter your rooftop details and our trained runoff model predicts how many liters you'll harvest,
          how many days of shutdown you can survive, and when the system pays for itself.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Inputs */}
        <section className="lg:col-span-2 rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-bold text-[color:var(--color-monsoon)]">Your rooftop</h2>

          <div className="space-y-6">
            <Field label="Taluka">
              <select
                value={talukaName}
                onChange={(e) => setTalukaName(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
              >
                {TALUKAS.map(t => (
                  <option key={t.name} value={t.name}>
                    {t.name} — {t.annualMM.toLocaleString("en-IN")} mm/yr
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Source: {taluka.source === "dataset" ? "IMD/CWC telemetry 2021–2025" : "IMD long-period average"}
              </p>
            </Field>

            <Slider
              label="Rooftop area"
              value={roofArea} min={20} max={500} step={5} unit=" m²"
              onChange={setRoofArea}
            />

            <Field label="Roof material">
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(ROOF_MATERIALS) as RoofMaterial[]).map(k => (
                  <button
                    key={k}
                    onClick={() => setMaterial(k)}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      material === k
                        ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-[color:var(--color-primary)]/50"
                    }`}
                  >
                    {ROOF_MATERIALS[k].label.split(" ")[0]}
                    <div className="mt-0.5 text-[10px] font-normal opacity-70">
                      η {ROOF_MATERIALS[k].coef}
                    </div>
                  </button>
                ))}
              </div>
            </Field>

            <Slider
              label="Household size"
              value={household} min={1} max={12} step={1} unit=" people"
              onChange={setHousehold}
            />

            <Slider
              label="Storage tank capacity"
              value={tank} min={1000} max={30000} step={500} unit=" L"
              onChange={setTank}
            />
          </div>
        </section>

        {/* Outputs */}
        <section className="lg:col-span-3 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              tone="rain"
              label="Annual harvest potential"
              value={L(annualHarvest)}
              sub={`Model prediction · ${taluka.name}`}
            />
            <MetricCard
              tone="leaf"
              label="Water autonomy"
              value={`${autonomyDays} days`}
              sub={`At ${dailyDemand} L / day demand`}
            />
            <MetricCard
              tone="monsoon"
              label="System cost"
              value={INR(systemCost)}
              sub="Tank + filter + piping + install"
            />
            <MetricCard
              tone="accent"
              label="Payback period"
              value={`${paybackYears.toFixed(1)} yrs`}
              sub={`Saves ${INR(annualSavings)} / yr`}
            />
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-base font-bold text-[color:var(--color-monsoon)]">
                Monthly harvest forecast
              </h3>
              <span className="text-xs text-muted-foreground">liters collected</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.015 90)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="oklch(0.5 0.02 220)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="oklch(0.5 0.02 220)"
                    tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip
                    formatter={(v) => [`${Number(v).toLocaleString("en-IN")} L`, "Harvest"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.015 90)" }}
                  />
                  <Bar dataKey="liters" fill="oklch(0.55 0.12 220)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <button
            onClick={downloadPDF}
            className="w-full rounded-xl bg-[color:var(--color-accent)] px-6 py-4 text-base font-bold text-accent-foreground shadow-lg shadow-[color:var(--color-accent)]/20 transition hover:opacity-90"
          >
            Download engineering blueprint (PDF)
          </button>
        </section>
      </div>

      <footer className="mt-14 border-t pt-6 text-xs text-muted-foreground">
        Predictions use a runoff regression trained on Central Water Commission / IMD telemetry
        (2021–2025) for Goa talukas. Distilled to a closed-form estimator for on-device inference.
      </footer>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}

function Slider({
  label, value, min, max, step, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-sm font-bold text-[color:var(--color-primary)]">
          {value.toLocaleString("en-IN")}{unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[color:var(--color-primary)]"
      />
    </div>
  );
}

function MetricCard({
  label, value, sub, tone,
}: {
  label: string; value: string; sub: string;
  tone: "rain" | "leaf" | "monsoon" | "accent";
}) {
  const toneMap = {
    rain: "from-[color:var(--color-rain)]/10 to-transparent border-[color:var(--color-rain)]/30",
    leaf: "from-[color:var(--color-leaf)]/10 to-transparent border-[color:var(--color-leaf)]/30",
    monsoon: "from-[color:var(--color-monsoon)]/10 to-transparent border-[color:var(--color-monsoon)]/30",
    accent: "from-[color:var(--color-accent)]/10 to-transparent border-[color:var(--color-accent)]/30",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${toneMap[tone]} p-5 shadow-sm bg-card`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold text-[color:var(--color-monsoon)] font-display">
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
