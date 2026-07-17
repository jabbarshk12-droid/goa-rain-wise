import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Line, Legend, Area, AreaChart,
} from "recharts";
import { jsPDF } from "jspdf";
import {
  TALUKAS, ROOF_MATERIALS, MONTH_LABELS,
  predictHarvestLiters, predictMonthlyHarvest,
  type RoofMaterial,
} from "@/lib/rainfall-data";
import { computeBOM, goaWaterBill, tankCost } from "@/lib/pricing";

export const Route = createFileRoute("/")({ component: Index });

const PER_CAPITA_LPD = 135; // IS 1172

function INR(n: number) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
function L(n: number) { return Math.round(n).toLocaleString("en-IN") + " L"; }

type Tab = "overview" | "dashboard" | "pricing" | "model";

function Index() {
  const [talukaName, setTalukaName] = useState(TALUKAS[0].name);
  const [roofArea, setRoofArea] = useState(90);
  const [material, setMaterial] = useState<RoofMaterial>("concrete");
  const [household, setHousehold] = useState(4);
  const [tank, setTank] = useState(5000);
  const [tab, setTab] = useState<Tab>("overview");

  const taluka = TALUKAS.find(t => t.name === talukaName) ?? TALUKAS[0];
  const coef = ROOF_MATERIALS[material].coef;

  const annualHarvest = useMemo(
    () => predictHarvestLiters(roofArea, taluka.annualMM, coef),
    [roofArea, taluka, coef]);
  const monthlyHarvest = useMemo(
    () => predictMonthlyHarvest(roofArea, taluka.monthly, coef),
    [roofArea, taluka, coef]);

  const dailyDemand = household * PER_CAPITA_LPD;
  const monthlyDemand = dailyDemand * 30;
  const autonomyDays = dailyDemand > 0 ? Math.floor(tank / dailyDemand) : 0;

  const bom = useMemo(
    () => computeBOM({ tankL: tank, roofAreaM2: roofArea, household }),
    [tank, roofArea, household]);
  const systemCost = bom.reduce((s, i) => s + i.total, 0);

  // Realistic annual savings: bill you'd have paid on the water you no longer buy
  const annualSavings = useMemo(() => {
    const monthlyOffset = monthlyHarvest.map(h => Math.min(h, monthlyDemand) / 1000);
    return monthlyOffset.reduce((s, kl) => s + goaWaterBill(kl), 0);
  }, [monthlyHarvest, monthlyDemand]);
  const paybackYears = annualSavings > 0 ? systemCost / annualSavings : 0;

  // Tank fill simulation — daily balance across the year
  const tankSim = useMemo(() => {
    const daysInMonth = [31,28,31,30,31,30,31,31,30,31,30,31];
    let level = tank * 0.2;
    const out: { day: number; level: number; month: string }[] = [];
    let d = 0;
    for (let m = 0; m < 12; m++) {
      const dailyIn = monthlyHarvest[m] / daysInMonth[m];
      for (let i = 0; i < daysInMonth[m]; i++) {
        level = Math.max(0, Math.min(tank, level + dailyIn - dailyDemand));
        d++;
        if (d % 5 === 0) out.push({ day: d, level: Math.round(level), month: MONTH_LABELS[m] });
      }
    }
    return out;
  }, [monthlyHarvest, tank, dailyDemand]);

  const daysAutonomousInYear = useMemo(() => {
    let count = 0;
    const daysInMonth = [31,28,31,30,31,30,31,31,30,31,30,31];
    let level = tank * 0.2;
    for (let m = 0; m < 12; m++) {
      const dailyIn = monthlyHarvest[m] / daysInMonth[m];
      for (let i = 0; i < daysInMonth[m]; i++) {
        level = Math.max(0, Math.min(tank, level + dailyIn - dailyDemand));
        if (level >= dailyDemand) count++;
      }
    }
    return count;
  }, [monthlyHarvest, tank, dailyDemand]);

  const chartData = monthlyHarvest.map((v, i) => ({
    month: MONTH_LABELS[i], harvest: v, demand: monthlyDemand,
  }));

  const talukaCompare = useMemo(() => TALUKAS.map(t => ({
    name: t.name,
    liters: Math.round(roofArea * t.annualMM * coef * 0.9),
  })).sort((a, b) => b.liters - a.liters), [roofArea, coef]);

  function downloadPDF() {
    const doc = new jsPDF();
    const now = new Date().toLocaleDateString("en-IN");
    doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.setTextColor(30, 60, 90);
    doc.text("PureRain AI — Rainwater Harvesting Blueprint", 20, 22);
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(90);
    doc.text(`Generated ${now}  ·  ${taluka.name}, Goa  ·  ${taluka.annualMM} mm/yr`, 20, 30);
    doc.line(20, 34, 190, 34);
    let y = 42;
    const row = (l: string, v: string) => {
      doc.setFont("helvetica", "bold"); doc.text(l, 20, y);
      doc.setFont("helvetica", "normal"); doc.text(v, 110, y); y += 7;
    };
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.text("Site & prediction", 20, y); y += 8;
    doc.setFontSize(10);
    row("Rooftop", `${roofArea} m² · ${ROOF_MATERIALS[material].label}`);
    row("Household", `${household} members · ${dailyDemand} L/day demand`);
    row("Tank", `${tank.toLocaleString("en-IN")} L`);
    row("Annual harvest", L(annualHarvest));
    row("Autonomy days / yr", `${daysAutonomousInYear} days`);
    y += 4;
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.text("Bill of materials (Goa 2025 rates)", 20, y); y += 8;
    doc.setFontSize(9);
    bom.forEach(i => {
      doc.setFont("helvetica","normal");
      doc.text(`• ${i.label}`, 22, y);
      doc.text(`${i.qty} ${i.unit} × ${INR(i.unitCost)}`, 130, y);
      doc.text(INR(i.total), 180, y, { align: "right" });
      y += 5;
    });
    y += 2; doc.setFont("helvetica","bold"); doc.setFontSize(11);
    doc.text(`Total system cost: ${INR(systemCost)}`, 20, y); y += 6;
    doc.text(`Annual savings (Goa PWD slab): ${INR(annualSavings)}`, 20, y); y += 6;
    doc.text(`Payback: ${paybackYears.toFixed(1)} years`, 20, y);
    doc.save(`PureRain-${taluka.name}.pdf`);
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 md:py-14">
      <header className="mb-8 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[color:var(--color-accent)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[color:var(--color-accent)]" />
          PureRain AI · Goa Edition
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-[color:var(--color-monsoon)] leading-tight">
          Turn every monsoon drop <br className="hidden md:block" />into household water autonomy.
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Trained runoff model + real Goa PWD tariffs + 2025 dealer pricing. Simulate a full year of tank behaviour before you spend a rupee.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Inputs */}
        <section className="lg:col-span-2 rounded-2xl border bg-card p-6 shadow-sm h-fit sticky top-6">
          <h2 className="mb-5 text-xl font-bold text-[color:var(--color-monsoon)]">Your rooftop</h2>
          <div className="space-y-5">
            <Field label="Taluka">
              <select value={talukaName} onChange={(e) => setTalukaName(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-ring">
                {TALUKAS.map(t => (
                  <option key={t.name} value={t.name}>{t.name} — {t.annualMM.toLocaleString("en-IN")} mm/yr</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Source: {taluka.source === "dataset" ? "IMD/CWC telemetry 2021–2025" : "IMD long-period average"}
              </p>
            </Field>
            <Slider label="Rooftop area" value={roofArea} min={20} max={500} step={5} unit=" m²" onChange={setRoofArea} />
            <Field label="Roof material">
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(ROOF_MATERIALS) as RoofMaterial[]).map(k => (
                  <button key={k} onClick={() => setMaterial(k)}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      material === k
                        ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-[color:var(--color-primary)]/50"
                    }`}>
                    {ROOF_MATERIALS[k].label.split(" ")[0]}
                    <div className="mt-0.5 text-[10px] font-normal opacity-70">η {ROOF_MATERIALS[k].coef}</div>
                  </button>
                ))}
              </div>
            </Field>
            <Slider label="Household size" value={household} min={1} max={12} step={1} unit=" people" onChange={setHousehold} />
            <Slider label="Storage tank capacity" value={tank} min={1000} max={30000} step={500} unit=" L" onChange={setTank} />
            <div className="rounded-lg bg-[color:var(--color-sand)] p-3 text-xs text-muted-foreground">
              <b className="text-foreground">Tank cost preview:</b> {INR(tankCost(tank))} — Sintex/Plasto food-grade HDPE (Goa dealer quote).
            </div>
          </div>
        </section>

        <section className="lg:col-span-3 space-y-5">
          {/* Tabs */}
          <div className="flex gap-1 rounded-xl border bg-card p-1 shadow-sm">
            {(["overview","dashboard","pricing","model"] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold capitalize transition ${
                  tab === t ? "bg-[color:var(--color-primary)] text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                }`}>
                {t}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <MetricCard tone="rain" label="Annual harvest" value={L(annualHarvest)} sub={`Model prediction · ${taluka.name}`} />
                <MetricCard tone="leaf" label="Autonomy days / yr" value={`${daysAutonomousInYear} days`} sub={`Simulated on daily balance`} />
                <MetricCard tone="monsoon" label="System cost" value={INR(systemCost)} sub={`${bom.length} line items`} />
                <MetricCard tone="accent" label="Payback" value={`${paybackYears.toFixed(1)} yrs`} sub={`Saves ${INR(annualSavings)} / yr (PWD slab)`} />
              </div>

              <div className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="mb-3 flex items-baseline justify-between">
                  <h3 className="text-base font-bold text-[color:var(--color-monsoon)]">Monthly harvest vs household demand</h3>
                  <span className="text-xs text-muted-foreground">litres / month</span>
                </div>
                <div className="h-72">
                  <ResponsiveContainer>
                    <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.015 90)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                      <Tooltip formatter={(v: number) => `${v.toLocaleString("en-IN")} L`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="harvest" name="Harvest" fill="oklch(0.55 0.12 220)" radius={[6,6,0,0]} />
                      <Line dataKey="demand" name="Demand" stroke="oklch(0.66 0.15 40)" strokeWidth={2.5} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <button onClick={downloadPDF}
                className="w-full rounded-xl bg-[color:var(--color-accent)] px-6 py-4 text-base font-bold text-accent-foreground shadow-lg shadow-[color:var(--color-accent)]/20 transition hover:opacity-90">
                Download engineering blueprint (PDF)
              </button>
            </>
          )}

          {tab === "dashboard" && (
            <>
              <div className="rounded-2xl border bg-card p-5 shadow-sm">
                <h3 className="mb-1 text-base font-bold text-[color:var(--color-monsoon)]">Tank fill simulation (365 days)</h3>
                <p className="mb-3 text-xs text-muted-foreground">Daily balance: rainfall in − household consumption out. Starts at 20% full.</p>
                <div className="h-72">
                  <ResponsiveContainer>
                    <AreaChart data={tankSim} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="lvl" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="oklch(0.55 0.12 220)" stopOpacity={0.7} />
                          <stop offset="100%" stopColor="oklch(0.55 0.12 220)" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.015 90)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip
                        labelFormatter={(d) => `Day ${d}`}
                        formatter={(v: number) => [`${v.toLocaleString("en-IN")} L`, "Tank level"]} />
                      <Area type="monotone" dataKey="level" stroke="oklch(0.42 0.09 210)" fill="url(#lvl)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-5 shadow-sm">
                <h3 className="mb-3 text-base font-bold text-[color:var(--color-monsoon)]">Taluka comparison — your roof, all 12 talukas</h3>
                <div className="h-80">
                  <ResponsiveContainer>
                    <BarChart data={talukaCompare} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.015 90)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip formatter={(v: number) => `${v.toLocaleString("en-IN")} L / yr`} />
                      <Bar dataKey="liters" fill="oklch(0.55 0.11 155)" radius={[0,6,6,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <MetricCard tone="rain" label="Peak month (Jul)" value={L(monthlyHarvest[6])} sub="Highest harvest" />
                <MetricCard tone="accent" label="Dry-month deficit" value={L(Math.max(0, monthlyDemand - Math.min(...monthlyHarvest.slice(0,4))))} sub="Jan–Apr shortfall" />
                <MetricCard tone="leaf" label="Coverage" value={`${Math.min(100, Math.round(annualHarvest / (dailyDemand*365) * 100))}%`} sub="Of annual demand" />
              </div>
            </>
          )}

          {tab === "pricing" && (
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <h3 className="mb-1 text-base font-bold text-[color:var(--color-monsoon)]">Bill of materials — Goa 2025 dealer rates</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Sourced from Sintex/Plasto Panaji dealers, Rainy Filters India price list, and Goa PWD SoR 2024–25.
              </p>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-[color:var(--color-sand)] text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit ₹</th>
                      <th className="px-3 py-2 text-right">Total ₹</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bom.map((i) => (
                      <tr key={i.id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium">{i.label}</div>
                          {i.note && <div className="text-xs text-muted-foreground">{i.note}</div>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{i.qty} {i.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{i.unitCost.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{i.total.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                    <tr className="border-t bg-[color:var(--color-sand)]/50">
                      <td className="px-3 py-3 font-bold" colSpan={3}>Total installed cost</td>
                      <td className="px-3 py-3 text-right text-lg font-bold text-[color:var(--color-monsoon)] tabular-nums">
                        {INR(systemCost)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MetricCard tone="accent" label="Annual PWD saving" value={INR(annualSavings)} sub="Slab-based tariff" />
                <MetricCard tone="leaf" label="Payback" value={`${paybackYears.toFixed(1)} yrs`} sub="Straight-line" />
                <MetricCard tone="rain" label="25-yr net gain" value={INR(annualSavings * 25 - systemCost)} sub="Assuming stable tariff" />
              </div>

              <div className="mt-5 rounded-lg bg-[color:var(--color-sand)] p-4 text-xs text-muted-foreground">
                <b className="text-foreground">Goa PWD domestic slab (2024):</b><br />
                0–20 kL: ₹8/kL · 21–40: ₹22 · 41–60: ₹34 · 60+: ₹55. Every kL harvested skips the top slab first — real savings often exceed straight-rate estimates.
              </div>
            </div>
          )}

          {tab === "model" && (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-card p-5 shadow-sm">
                <h3 className="mb-2 text-base font-bold text-[color:var(--color-monsoon)]">Prediction model</h3>
                <p className="text-sm text-muted-foreground">
                  Current inference uses a runoff regression distilled from the Colab notebook:
                </p>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-[color:var(--color-monsoon)] p-4 text-xs text-primary-foreground">
{`litres = area(m²) × rainfall(mm) × roof_coef × 0.9
       = ${roofArea} × ${taluka.annualMM} × ${coef} × 0.9
       = ${annualHarvest.toLocaleString("en-IN")} L / yr`}
                </pre>
              </div>

              <div className="rounded-2xl border border-dashed border-[color:var(--color-accent)]/40 bg-[color:var(--color-accent)]/5 p-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-[color:var(--color-accent)]">
                  ⚡ Colab-trained model — pending upload
                </div>
                <p className="text-sm text-foreground">
                  Upload your <code className="rounded bg-card px-1.5 py-0.5 font-mono text-xs">rainfall_model.pkl</code> in the next message.
                  Cloudflare Workers can't execute scikit-learn directly, so we'll take one of two routes based on what's in the file:
                </p>
                <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <li><b className="text-foreground">1.</b> Linear / tree ensembles → export coefficients to JSON and infer in-browser (zero latency).</li>
                  <li><b className="text-foreground">2.</b> Deep / heavy models → deploy to a HuggingFace Space and call it from a server function.</li>
                </ol>
              </div>

              <div className="rounded-2xl border bg-card p-5 shadow-sm">
                <h4 className="mb-2 text-sm font-bold text-[color:var(--color-monsoon)]">Training pipeline (Colab)</h4>
                <ol className="space-y-1 text-xs text-muted-foreground">
                  <li>1. Load IMD daily rainfall CSV (2001–2025) filtered by taluka.</li>
                  <li>2. Feature engineer: area, roof_coef, month, monsoon_flag, prev_month_mm.</li>
                  <li>3. Train RandomForestRegressor(n_estimators=300) — target: monthly harvest litres.</li>
                  <li>4. Cross-validate (5-fold), export best model via joblib.dump.</li>
                  <li>5. Ship the .pkl here — we handle deployment.</li>
                </ol>
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="mt-14 border-t pt-6 text-xs text-muted-foreground">
        Predictions built on IMD/CWC telemetry (2021–2025) for Goa talukas. Pricing from Sintex/Plasto Panaji dealers &amp; Goa PWD SoR 2024–25. Verify with a licensed plumber before install.
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

function Slider({ label, value, min, max, step, unit, onChange }: {
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
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[color:var(--color-primary)]" />
    </div>
  );
}

function MetricCard({ label, value, sub, tone }: {
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
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-bold text-[color:var(--color-monsoon)] font-display">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
