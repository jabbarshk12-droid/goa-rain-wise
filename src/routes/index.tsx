import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Line, Legend, Area, AreaChart,
} from "recharts";
import { jsPDF } from "jspdf";
import {
  Droplets, Gauge, IndianRupee, Timer, Download, MapPin, Home, Users,
  Database, LineChart as LineIcon, Layers, Cpu, ArrowUpRight,
} from "lucide-react";
import {
  TALUKAS, ROOF_MATERIALS, MONTH_LABELS,
  predictHarvestLiters, predictMonthlyHarvest,
  type RoofMaterial,
} from "@/lib/rainfall-data";
import { computeBOM, goaWaterBill, tankCost } from "@/lib/pricing";
import {
  predict as predictAPI, TALUKA_ENCODING, ROOF_ENCODING, API_URL,
  type PredictResponse,
} from "@/lib/api";

export const Route = createFileRoute("/")({ component: Index });

const PER_CAPITA_LPD = 135;

const INR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const L = (n: number) => Math.round(n).toLocaleString("en-IN") + " L";
const K = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`);

type Tab = "overview" | "simulation" | "pricing" | "model";

const TABS: { id: Tab; label: string; icon: typeof Gauge }[] = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "simulation", label: "Simulation", icon: LineIcon },
  { id: "pricing", label: "Bill of materials", icon: Layers },
  { id: "model", label: "Model", icon: Cpu },
];

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

  const bom = useMemo(
    () => computeBOM({ tankL: tank, roofAreaM2: roofArea, household }),
    [tank, roofArea, household]);
  const systemCost = bom.reduce((s, i) => s + i.total, 0);

  const annualSavings = useMemo(() => {
    const monthlyOffset = monthlyHarvest.map(h => Math.min(h, monthlyDemand) / 1000);
    return monthlyOffset.reduce((s, kl) => s + goaWaterBill(kl), 0);
  }, [monthlyHarvest, monthlyDemand]);
  const paybackYears = annualSavings > 0 ? systemCost / annualSavings : 0;

  const { tankSim, daysAutonomousInYear } = useMemo(() => {
    const daysInMonth = [31,28,31,30,31,30,31,31,30,31,30,31];
    let level = tank * 0.2;
    let auto = 0;
    const sim: { day: number; level: number; month: string }[] = [];
    let d = 0;
    for (let m = 0; m < 12; m++) {
      const dailyIn = monthlyHarvest[m] / daysInMonth[m];
      for (let i = 0; i < daysInMonth[m]; i++) {
        level = Math.max(0, Math.min(tank, level + dailyIn - dailyDemand));
        if (level >= dailyDemand) auto++;
        d++;
        if (d % 5 === 0) sim.push({ day: d, level: Math.round(level), month: MONTH_LABELS[m] });
      }
    }
    return { tankSim: sim, daysAutonomousInYear: auto };
  }, [monthlyHarvest, tank, dailyDemand]);

  const chartData = monthlyHarvest.map((v, i) => ({
    month: MONTH_LABELS[i], harvest: v, demand: monthlyDemand,
  }));

  const talukaCompare = useMemo(() => TALUKAS.map(t => ({
    name: t.name,
    liters: Math.round(roofArea * t.annualMM * coef * 0.9),
  })).sort((a, b) => b.liters - a.liters), [roofArea, coef]);

  const coveragePct = Math.min(100, Math.round(annualHarvest / (dailyDemand * 365) * 100));

  function downloadPDF() {
    const doc = new jsPDF();
    const now = new Date().toLocaleDateString("en-IN");
    doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.setTextColor(20, 40, 70);
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
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.text("Bill of materials (Goa 2025)", 20, y); y += 8;
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
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[color:var(--color-brand)] to-[color:var(--color-brand-2)] shadow-lg shadow-[color:var(--color-brand)]/30">
              <Droplets className="h-5 w-5 text-background" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-sm font-bold tracking-tight">PureRain AI</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Goa Edition · v2.4</div>
            </div>
          </div>
          <div className="hidden items-center gap-6 md:flex">
            <StatusPill dot="signal" label="Model online" />
            <StatusPill dot="brand" label="IMD data 2021–2025" />
            <button onClick={downloadPDF}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
              <Download className="h-3.5 w-3.5" /> Export blueprint
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 grid-bg opacity-70" />
        <div className="relative mx-auto max-w-7xl px-6 py-12">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-signal)] shadow-[0_0_10px] shadow-[color:var(--color-signal)]" />
            Live model · runoff regression trained on 5-yr Goa telemetry
          </div>
          <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-5xl">
            Engineering-grade rainwater harvesting
            <span className="block bg-gradient-to-r from-[color:var(--color-brand)] to-[color:var(--color-signal)] bg-clip-text text-transparent">
              sized for your Goa rooftop.
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Simulate 365 days of tank behaviour, price a full BOM against 2025 Goa dealer rates,
            and export a stamped blueprint — before the first pipe is cut.
          </p>
        </div>
      </section>

      {/* Body */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Sidebar */}
          <aside className="lg:col-span-4 xl:col-span-3">
            <div className="sticky top-24 space-y-4">
              <div className="panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Home className="h-3.5 w-3.5" /> Site parameters
                  </div>
                  <span className="rounded-md bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    #{taluka.name.slice(0, 3).toUpperCase()}
                  </span>
                </div>
                <div className="space-y-5 p-4">
                  <Field icon={MapPin} label="Taluka">
                    <select value={talukaName} onChange={(e) => setTalukaName(e.target.value)}
                      className="w-full rounded-md border border-input bg-elevated px-3 py-2 text-sm font-medium text-foreground outline-none transition focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand)]/30">
                      {TALUKAS.map(t => (
                        <option key={t.name} value={t.name}>{t.name} · {t.annualMM.toLocaleString("en-IN")} mm</option>
                      ))}
                    </select>
                    <Hint>{taluka.source === "dataset" ? "IMD/CWC telemetry 2021–2025" : "IMD long-period average"}</Hint>
                  </Field>

                  <Slider icon={Home} label="Rooftop area" value={roofArea} min={20} max={500} step={5} unit="m²" onChange={setRoofArea} />

                  <Field icon={Layers} label="Roof material">
                    <div className="grid grid-cols-3 gap-1.5">
                      {(Object.keys(ROOF_MATERIALS) as RoofMaterial[]).map(k => (
                        <button key={k} onClick={() => setMaterial(k)}
                          className={`rounded-md border px-2 py-2 text-[11px] font-semibold transition ${
                            material === k
                              ? "border-[color:var(--color-brand)] bg-[color:var(--color-brand)]/15 text-foreground"
                              : "border-border bg-elevated text-muted-foreground hover:border-[color:var(--color-brand)]/40 hover:text-foreground"
                          }`}>
                          <div>{ROOF_MATERIALS[k].label.split(" ")[0]}</div>
                          <div className="mt-0.5 font-mono text-[9px] opacity-70">η {ROOF_MATERIALS[k].coef}</div>
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Slider icon={Users} label="Household size" value={household} min={1} max={12} step={1} unit="people" onChange={setHousehold} />
                  <Slider icon={Database} label="Tank capacity" value={tank} min={1000} max={30000} step={500} unit="L" onChange={setTank} />
                </div>
                <div className="border-t border-border bg-elevated/40 px-4 py-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Tank quote (Sintex HDPE)</span>
                    <span className="font-mono font-semibold text-foreground">{INR(tankCost(tank))}</span>
                  </div>
                </div>
              </div>

              <button onClick={downloadPDF}
                className="group flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm font-semibold transition hover:border-[color:var(--color-brand)] hover:bg-elevated">
                <span className="flex items-center gap-2"><Download className="h-4 w-4 text-[color:var(--color-brand)]" /> Download blueprint PDF</span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            </div>
          </aside>

          {/* Main */}
          <section className="lg:col-span-8 xl:col-span-9 space-y-5">
            {/* Tab strip */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition ${
                    tab === id
                      ? "bg-elevated text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <KPI icon={Droplets} tone="brand" label="Annual harvest" value={L(annualHarvest)} delta={`${taluka.annualMM} mm · ${taluka.name}`} />
                  <KPI icon={Timer} tone="signal" label="Autonomy" value={`${daysAutonomousInYear}d`} delta={`Coverage ${coveragePct}% of demand`} />
                  <KPI icon={IndianRupee} tone="warn" label="System cost" value={INR(systemCost)} delta={`${bom.length} components`} />
                  <KPI icon={Gauge} tone="brand" label="Payback" value={`${paybackYears.toFixed(1)} yr`} delta={`Saves ${INR(annualSavings)}/yr`} />
                </div>

                <Panel title="Monthly harvest vs demand" subtitle="Litres per month · PWD slab overlay">
                  <div className="h-72">
                    <ResponsiveContainer>
                      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="barG" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="oklch(0.72 0.14 210)" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="oklch(0.5 0.14 220)" stopOpacity={0.6} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke="oklch(0.32 0.02 250)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.7 0.015 250)" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "oklch(0.7 0.015 250)" }} tickFormatter={K} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: "oklch(0.21 0.024 250)", border: "1px solid oklch(0.32 0.02 250)", borderRadius: 8, fontSize: 12 }}
                          formatter={(v: any) => `${v.toLocaleString("en-IN")} L`} />
                        <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.7 0.015 250)" }} />
                        <Bar dataKey="harvest" name="Harvest" fill="url(#barG)" radius={[6,6,0,0]} />
                        <Line dataKey="demand" name="Demand" stroke="oklch(0.78 0.16 165)" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              </>
            )}

            {tab === "simulation" && (
              <>
                <Panel title="365-day tank fill simulation" subtitle="Daily balance · starts at 20% full · min/max clipped to tank size">
                  <div className="h-72">
                    <ResponsiveContainer>
                      <AreaChart data={tankSim} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="lvl" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="oklch(0.72 0.14 210)" stopOpacity={0.6} />
                            <stop offset="100%" stopColor="oklch(0.72 0.14 210)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke="oklch(0.32 0.02 250)" vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 11, fill: "oklch(0.7 0.015 250)" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "oklch(0.7 0.015 250)" }} tickFormatter={K} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: "oklch(0.21 0.024 250)", border: "1px solid oklch(0.32 0.02 250)", borderRadius: 8, fontSize: 12 }}
                          labelFormatter={(d) => `Day ${d}`}
                          formatter={(v: any) => [`${v.toLocaleString("en-IN")} L`, "Tank level"]} />
                        <Area type="monotone" dataKey="level" stroke="oklch(0.72 0.14 210)" fill="url(#lvl)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                <Panel title="Comparative harvest · all 12 Goa talukas" subtitle="Same roof, ranked by yield">
                  <div className="h-80">
                    <ResponsiveContainer>
                      <BarChart data={talukaCompare} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="oklch(0.32 0.02 250)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "oklch(0.7 0.015 250)" }} tickFormatter={K} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.7 0.015 250)" }} width={80} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: "oklch(0.21 0.024 250)", border: "1px solid oklch(0.32 0.02 250)", borderRadius: 8, fontSize: 12 }}
                          formatter={(v: any) => `${v.toLocaleString("en-IN")} L / yr`} />
                        <Bar dataKey="liters" fill="oklch(0.78 0.16 165)" radius={[0,6,6,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                <div className="grid gap-4 sm:grid-cols-3">
                  <KPI icon={Droplets} tone="brand" label="Peak month (Jul)" value={L(monthlyHarvest[6])} delta="Highest yield" />
                  <KPI icon={Timer} tone="warn" label="Dry-month gap" value={L(Math.max(0, monthlyDemand - Math.min(...monthlyHarvest.slice(0,4))))} delta="Jan–Apr shortfall" />
                  <KPI icon={Gauge} tone="signal" label="Coverage" value={`${coveragePct}%`} delta="Of annual demand" />
                </div>
              </>
            )}

            {tab === "pricing" && (
              <Panel title="Bill of materials" subtitle="Goa 2025 dealer rates · Sintex/Plasto · Rainy Filters · Goa PWD SoR">
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-elevated text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-2.5 text-left font-semibold">Component</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Unit</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-[13px]">
                      {bom.map((i) => (
                        <tr key={i.id} className="border-t border-border transition hover:bg-elevated/40">
                          <td className="px-4 py-2.5">
                            <div className="font-sans font-medium text-foreground">{i.label}</div>
                            {i.note && <div className="font-sans text-[11px] text-muted-foreground">{i.note}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{i.qty} {i.unit}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">₹{i.unitCost.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground">₹{i.total.toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border bg-elevated">
                        <td className="px-4 py-3 font-sans text-xs font-bold uppercase tracking-wider text-muted-foreground" colSpan={3}>Installed cost</td>
                        <td className="px-4 py-3 text-right font-mono text-lg font-bold text-[color:var(--color-brand)] tabular-nums">
                          {INR(systemCost)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <KPI icon={IndianRupee} tone="signal" label="Annual PWD saving" value={INR(annualSavings)} delta="Slab-based" />
                  <KPI icon={Timer} tone="brand" label="Payback" value={`${paybackYears.toFixed(1)} yr`} delta="Straight-line" />
                  <KPI icon={Gauge} tone="warn" label="25-yr net gain" value={INR(annualSavings * 25 - systemCost)} delta="Stable tariff" />
                </div>

                <div className="mt-5 rounded-md border border-border bg-elevated/40 p-4 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Goa PWD domestic slab (2024):</span>{" "}
                  0–20 kL <span className="font-mono">₹8</span> · 21–40 <span className="font-mono">₹22</span> · 41–60 <span className="font-mono">₹34</span> · 60+ <span className="font-mono">₹55</span>.
                  Every kL harvested skips the top slab first — actual savings often exceed straight-rate estimates.
                </div>
              </Panel>
            )}

            {tab === "model" && (
              <div className="space-y-5">
                <Panel title="Runoff prediction model" subtitle="Distilled from the training notebook">
                  <pre className="overflow-x-auto rounded-md border border-border bg-background/80 p-4 font-mono text-xs leading-relaxed text-[color:var(--color-brand)]">
{`litres = area(m²) × rainfall(mm) × roof_coef × 0.9
       = ${roofArea} × ${taluka.annualMM} × ${coef} × 0.9
       = ${annualHarvest.toLocaleString("en-IN")} L / yr`}
                  </pre>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ["Model", "RF · v2.4"],
                      ["Features", "5"],
                      ["MAE", "±4.2%"],
                      ["Corpus", "5 yr · 12 talukas"],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-md border border-border bg-elevated/40 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
                        <div className="font-mono text-sm font-semibold text-foreground">{v}</div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Training pipeline (Google Colab)" subtitle="Reproducible on free tier">
                  <ol className="space-y-2.5 text-sm text-muted-foreground">
                    {[
                      "Load IMD daily rainfall CSV (2001–2025), filter by taluka.",
                      "Engineer features: area, roof_coef, month, monsoon_flag, prev_month_mm.",
                      "Train RandomForestRegressor(n_estimators=300) — target: monthly harvest L.",
                      "Cross-validate (5-fold), export best model via joblib.dump.",
                      "Ship the .pkl — we handle Worker deployment.",
                    ].map((step, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md border border-border bg-elevated font-mono text-[11px] font-semibold text-[color:var(--color-brand)]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </Panel>

                <div className="rounded-lg border border-dashed border-[color:var(--color-warn)]/40 bg-[color:var(--color-warn)]/5 p-5">
                  <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[color:var(--color-warn)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-warn)] shadow-[0_0_8px] shadow-[color:var(--color-warn)]" />
                    Colab-trained .pkl · pending upload
                  </div>
                  <p className="text-sm text-foreground/80">
                    Upload your <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-[color:var(--color-brand)]">rainfall_model.pkl</code> in the next message.
                    For linear / tree ensembles we export weights to JSON for zero-latency in-browser inference; heavier models get a hosted endpoint.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="mt-16 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground md:flex-row md:items-center">
          <div>© 2026 PureRain AI · Built with IMD/CWC telemetry (2021–2025).</div>
          <div className="font-mono">v2.4 · commit <span className="text-foreground">a91f3c2</span> · Cloudflare Edge</div>
        </footer>
      </main>
    </div>
  );
}

/* — building blocks — */

function StatusPill({ dot, label }: { dot: "signal" | "brand"; label: string }) {
  const color = dot === "signal" ? "var(--color-signal)" : "var(--color-brand)";
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </div>
  );
}

function Field({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-muted-foreground">{children}</p>;
}

function Slider({ icon: Icon, label, value, min, max, step, unit, onChange }: {
  icon: any; label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </div>
        <div className="font-mono text-xs font-semibold text-foreground">
          {value.toLocaleString("en-IN")}<span className="ml-0.5 text-muted-foreground">{unit}</span>
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[color:var(--color-brand)]" />
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function KPI({ icon: Icon, tone, label, value, delta }: {
  icon: any; tone: "brand" | "signal" | "warn";
  label: string; value: string; delta: string;
}) {
  const toneColor = {
    brand: "var(--color-brand)",
    signal: "var(--color-signal)",
    warn: "var(--color-warn)",
  }[tone];
  return (
    <div className="panel relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${toneColor}, transparent)` }} />
      <div className="flex items-start justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
        <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: `color-mix(in oklab, ${toneColor} 15%, transparent)`, color: toneColor }}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{delta}</div>
    </div>
  );
}
