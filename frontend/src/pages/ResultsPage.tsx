import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ExplainPanel, ExplainSummary } from "../components/Explain";
import { DecodeSteps, EvolutionLoop, RouteReplay } from "../components/Explainers";
import { LineChartCard, type ChartRow } from "../components/LineChartCard";
import { RouteMap } from "../components/RouteMap";
import {
  ChromosomeView,
  CompareBars,
  CoverageCell,
  JBreakdown,
  RouteManifests,
} from "../components/SolutionViews";
import {
  Badge,
  Callout,
  Count,
  Feasible,
  Icon,
  Kpi,
  PageHead,
  Skeleton,
  TabPanel,
  Tabs,
} from "../components/ui";
import { useStore } from "../features/store";
import { ApiError, api, errorMessage } from "../services/api";
import type { GenerationPoint, Metrics, RunState, Solution } from "../types";
import { lastImprovement } from "../utils/evolution";
import {
  REPAIR_LABEL,
  STOP_LABEL,
  dateTime,
  km,
  num,
  pct,
  seconds,
  shortHash,
  signed,
} from "../utils/format";

const FITNESS_SERIES = [
  { key: "best", label: "Mejor fitness", color: "var(--series-1)" },
  { key: "mean", label: "Fitness promedio", color: "var(--series-2)" },
];
const DIVERSITY_SERIES = [{ key: "diversity", label: "Diversidad", color: "var(--series-3)" }];

const TABS = [
  { id: "explicacion", label: "Explicación" },
  { id: "asignacion", label: "Asignación" },
  { id: "rutas", label: "Rutas" },
  { id: "evolucion", label: "Evolución" },
  { id: "tecnico", label: "Detalle técnico" },
];

type Filter = "todos" | "sin" | "parcial" | "completa";

function CompareRow({
  label,
  unit,
  ga,
  base,
  digits,
  lowerIsBetter,
  format,
}: {
  label: string;
  unit: string;
  ga: number;
  base: number;
  digits: number;
  lowerIsBetter: boolean | null;
  format?: (value: number) => string;
}) {
  const show = format ?? ((value: number) => num(value, digits));
  const delta = ga - base;
  const rounded = Number(delta.toFixed(digits + (format ? 2 : 0)));
  const verdict =
    lowerIsBetter == null || rounded === 0
      ? "igual"
      : rounded < 0 === lowerIsBetter
        ? "mejor el AG"
        : "mejor la línea base";
  return (
    <tr>
      <th scope="row" style={{ fontWeight: 500 }}>
        {label} <span className="muted small">({unit})</span>
      </th>
      <td className="num">{show(ga)}</td>
      <td className="num">{show(base)}</td>
      <td className="num">{format ? signed(delta * 100, 1) + " pp" : signed(delta, digits)}</td>
      <td>
        {lowerIsBetter == null ? (
          <span className="muted">—</span>
        ) : (
          <span
            className={
              verdict === "mejor el AG" ? "tone-good" : verdict === "igual" ? "muted" : undefined
            }
          >
            {verdict}
          </span>
        )}
      </td>
    </tr>
  );
}

export function ResultsPage() {
  const { scenario, runId, setRunId } = useStore();
  const [solution, setSolution] = useState<Solution | null>(null);
  const [history, setHistory] = useState<GenerationPoint[]>([]);
  const [runs, setRuns] = useState<RunState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("explicacion");
  const [vehicle, setVehicle] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");

  const scenarioId = scenario?.scenario_id;

  useEffect(() => {
    if (!scenarioId) return;
    api
      .listRuns(scenarioId)
      .then((list) => setRuns(list.filter((run) => run.status === "completed")))
      .catch(() => setRuns([]));
  }, [scenarioId]);

  useEffect(() => {
    setSolution(null);
    setHistory([]);
    setError(null);
    setVehicle(null);
    setFilter("todos");
    if (!runId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([api.getSolution(runId), api.getHistory(runId)])
      .then(([loaded, hist]) => {
        if (cancelled) return;
        setSolution(loaded);
        setHistory(hist.generations);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(
          reason instanceof ApiError && reason.code === "RUN_NOT_COMPLETED"
            ? "Esta corrida no tiene una solución validada (está en curso, fue cancelada o falló)."
            : errorMessage(reason),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const rows: ChartRow[] = useMemo(
    () =>
      history.map((g) => ({
        x: g.number,
        best: g.best_fitness,
        mean: g.mean_fitness,
        diversity: g.diversity,
      })),
    [history],
  );
  const names = useMemo(
    () => new Map((scenario?.scenario.centers ?? []).map((c) => [c.id, c.name])),
    [scenario],
  );
  const vehicleIndex = useMemo(
    () => new Map((solution?.routes ?? []).map((route, index) => [route.vehicle_id, index])),
    [solution],
  );

  if (!scenario) {
    return (
      <>
        <PageHead step="Paso 5 de 6" title="Resultados" />
        <Callout tone="warn" title="No hay escenario activo">
          <Link to="/escenario">Cargue o cree un escenario</Link> para ver resultados.
        </Callout>
      </>
    );
  }

  const m: Metrics | undefined = solution?.metrics;
  const b: Metrics | undefined = solution?.baseline.metrics;
  const straight = scenario.distance_mode === "haversine_demo";

  const statusOf = (row: Solution["assignments"][number]): "sin" | "parcial" | "completa" =>
    row.assigned_lots === 0 ? "sin" : row.pending_lots === 0 ? "completa" : "parcial";
  const counts = solution
    ? solution.assignments.reduce(
        (acc, row) => {
          acc[statusOf(row)] += 1;
          return acc;
        },
        { sin: 0, parcial: 0, completa: 0 } as Record<"sin" | "parcial" | "completa", number>,
      )
    : { sin: 0, parcial: 0, completa: 0 };
  const visibleAssignments = solution
    ? solution.assignments.filter((row) => filter === "todos" || statusOf(row) === filter)
    : [];

  const tolerance = solution?.parameters.improvement_tolerance ?? 1e-6;
  const stall = lastImprovement(history, tolerance);
  const stagnated = m?.stop_reason === "stagnation" && stall.since > 0;

  const jChange = m && b && b.J > 0 ? ((m.J - b.J) / b.J) * 100 : null;
  const kmChange = m && b && b.total_km > 0 ? ((m.total_km - b.total_km) / b.total_km) * 100 : null;

  return (
    <>
      <PageHead
        step="Paso 5 de 6"
        title="Resultados"
        actions={
          solution && (
            <>
              <a className="btn" href={api.runExportUrl(solution.run_id, "csv")}>
                <Icon name="download" /> CSV de asignaciones
              </a>
              <a className="btn" href={api.runExportUrl(solution.run_id, "json")}>
                <Icon name="download" /> JSON completo
              </a>
              <button type="button" className="btn" onClick={() => window.print()}>
                <Icon name="print" /> Imprimir / PDF
              </button>
            </>
          )
        }
      >
        La mejor solución de una corrida, comparada con un reparto simple de referencia (la línea
        base) sobre los mismos datos.
      </PageHead>

      {runs.length > 0 && (
        <div className="row no-print">
          <label htmlFor="run-select" className="small">
            Corrida mostrada
          </label>
          <select
            id="run-select"
            className="select"
            style={{ maxWidth: "26rem" }}
            value={runId ?? ""}
            onChange={(event) => setRunId(event.target.value || null)}
          >
            {!runs.some((run) => run.run_id === runId) && (
              <option value={runId ?? ""}>— Elija una corrida —</option>
            )}
            {runs.map((run) => (
              <option key={run.run_id} value={run.run_id}>
                Semilla {run.seed} · {dateTime(run.ended_at)} ·{" "}
                {run.experiment_id ? "cuatro corridas" : "individual"}
              </option>
            ))}
          </select>
        </div>
      )}

      {!runId && runs.length === 0 && (
        <Callout tone="info" title="Todavía no hay corridas completadas">
          Ejecute el AG desde <Link to="/configuracion">Configuración AG</Link>.
        </Callout>
      )}
      {loading && <Skeleton height={260} label="Cargando la solución" />}
      {error && (
        <Callout tone="error" title="No hay resultados para esta corrida">
          {error}
        </Callout>
      )}

      {solution && m && b && (
        <>
          <section className="row" aria-label="Datos de la corrida">
            <Feasible ok={solution.validation.feasible} />
            <Badge>Semilla {solution.seed}</Badge>
            <Badge title={m.distance_mode_label}>
              {straight ? "Distancia en línea recta (no vial)" : "Distancia de matriz vial"}
            </Badge>
            {scenario.data_origin === "synthetic" && <Badge tone="sim">Datos sintéticos</Badge>}
          </section>

          <section className="verdict" aria-label="Resumen frente a la línea base">
            <div className="verdict-fig">
              <span className="label">Puntaje J del AG frente a la línea base</span>
              <span className="hero-number">
                <Count value={jChange} format={(value) => `${signed(value, 1)} %`} />
              </span>
              <span className="sub">
                J = {num(m.J, 5)} el AG · {num(b.J, 5)} la línea base (menor es mejor)
              </span>
              <div className="delta-chips">
                <span className={`delta-chip ${m.total_km <= b.total_km ? "good" : "bad"}`}>
                  Distancia
                  <b>{kmChange == null ? "—" : `${signed(kmChange, 1)} %`}</b>
                  <span>{signed(m.total_km - b.total_km, 2)} km</span>
                </span>
                <span
                  className={`delta-chip ${m.weighted_coverage >= b.weighted_coverage ? "good" : "bad"}`}
                >
                  Cobertura ponderada
                  <b>{signed((m.weighted_coverage - b.weighted_coverage) * 100, 1)} pp</b>
                  <span>
                    {pct(m.weighted_coverage)} vs. {pct(b.weighted_coverage)}
                  </span>
                </span>
                <span
                  className={`delta-chip ${m.lots_delivered >= b.lots_delivered ? "good" : "bad"}`}
                >
                  Lotes entregados
                  <b>{signed(m.lots_delivered - b.lots_delivered, 0)}</b>
                  <span>
                    {m.lots_delivered} vs. {b.lots_delivered}
                  </span>
                </span>
              </div>
            </div>
            <ExplainSummary solution={solution} />
          </section>

          <div className="kpis" style={{ "--kpi-cols": 4 } as CSSProperties}>
            <Kpi
              label="Lotes entregados"
              value={m.lots_delivered}
              unit={`de ${m.inventory_lots}`}
              definition={`Demanda total: ${m.lots_demanded} lotes.`}
              delta={`${signed(m.lots_delivered - b.lots_delivered, 0)} vs. base`}
              deltaTone={m.lots_delivered >= b.lots_delivered ? "good" : "bad"}
            />
            <Kpi
              label="Centros atendidos"
              value={`${m.centers_served} / ${m.centers_with_demand}`}
              definition={`${m.centers_fully_served} reciben su demanda completa.`}
              delta={`${m.centers_fully_served} completos`}
            />
            <Kpi
              label="Cobertura ponderada"
              value={pct(m.weighted_coverage)}
              definition="Parte de la demanda atendida, dando más peso a la prioridad alta."
              delta={`${signed((m.weighted_coverage - b.weighted_coverage) * 100, 1)} pp vs. base`}
              deltaTone={m.weighted_coverage >= b.weighted_coverage ? "good" : "bad"}
            />
            <Kpi
              label={straight ? "Distancia (línea recta)" : "Distancia (vía real)"}
              value={num(m.total_km, 2)}
              unit="km"
              definition={`Suma de las rutas depósito → centros → depósito. D_ref = ${km(m.d_ref_km)}.`}
              delta={`${signed(m.total_km - b.total_km, 2)} km vs. base`}
              deltaTone={m.total_km <= b.total_km ? "good" : "bad"}
            />
          </div>

          <section className="stack" style={{ "--gap": "1.1rem" } as CSSProperties}>
            <Tabs
              prefix="res"
              tabs={TABS}
              value={tab}
              onChange={setTab}
              label="Detalle de la solución"
            />

            <TabPanel prefix="res" id="explicacion" active={tab}>
              <ExplainPanel solution={solution} />
            </TabPanel>

            <TabPanel prefix="res" id="asignacion" active={tab}>
              <div className="card">
                <div className="card-title">
                  <h3>Cromosoma (π, q) decodificado</h3>
                  {vehicle && (
                    <button
                      type="button"
                      className="btn small ghost"
                      onClick={() => setVehicle(null)}
                    >
                      Quitar resaltado de {vehicle}
                    </button>
                  )}
                </div>
                <ChromosomeView
                  chromosome={solution.chromosome}
                  assignments={solution.assignments}
                  routes={solution.routes}
                  active={vehicle}
                />
                <DecodeSteps
                  chromosome={solution.chromosome}
                  assignments={solution.assignments}
                  routes={solution.routes}
                />
              </div>
              <div className="row spread">
                <div className="chips" role="group" aria-label="Filtrar centros">
                  {(
                    [
                      ["todos", "Todos", solution.assignments.length],
                      ["completa", "Completos", counts.completa],
                      ["parcial", "Parciales", counts.parcial],
                      ["sin", "Sin entrega", counts.sin],
                    ] as [Filter, string, number][]
                  ).map(([id, label, total]) => (
                    <button
                      key={id}
                      type="button"
                      className="chip"
                      aria-pressed={filter === id}
                      onClick={() => setFilter(id)}
                    >
                      {label} <span className="count">{total}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <caption>
                    «Solo parcial» marca los centros cuya demanda supera la capacidad del mayor
                    vehículo: el prototipo no programa varios viajes al mismo centro.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Centro</th>
                      <th scope="col" className="num">
                        Prioridad
                      </th>
                      <th scope="col" className="num">
                        Demanda
                      </th>
                      <th scope="col" className="num">
                        Asignado
                      </th>
                      <th scope="col">Cobertura</th>
                      <th scope="col">Vehículo</th>
                      <th scope="col" className="num">
                        Parada
                      </th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAssignments.map((row) => {
                      const index = row.vehicle_id ? (vehicleIndex.get(row.vehicle_id) ?? -1) : -1;
                      return (
                        <tr key={row.center_id}>
                          <td className="id">
                            {row.center_id}
                            <span
                              className="small muted"
                              style={{ display: "block", fontFamily: "var(--font-sans)" }}
                            >
                              {names.get(row.center_id) ?? "—"}
                            </span>
                          </td>
                          <td className="num">
                            <span className={`prio p${row.priority_weight}`}>
                              {row.priority_weight}
                            </span>
                          </td>
                          <td className="num">{row.demand_lots}</td>
                          <td className="num">{row.assigned_lots}</td>
                          <td>
                            <CoverageCell
                              assigned={row.assigned_lots}
                              demand={row.demand_lots}
                              vehicleIndex={index}
                            />
                          </td>
                          <td className="id">{row.vehicle_id ?? "—"}</td>
                          <td className="num">{row.stop_order ?? "—"}</td>
                          <td>
                            {row.assigned_lots === 0 ? (
                              <Badge tone={row.demand_lots > 0 ? "bad" : "neutral"}>
                                {row.demand_lots > 0 ? "Sin entrega" : "Sin demanda"}
                              </Badge>
                            ) : row.pending_lots === 0 ? (
                              <Badge tone="good">Completa</Badge>
                            ) : (
                              <Badge tone="sim">Parcial</Badge>
                            )}
                            {row.partial_only && (
                              <>
                                {" "}
                                <Badge>Solo parcial</Badge>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filter === "todos" && (
                    <tfoot>
                      <tr>
                        <th scope="row" colSpan={2}>
                          Total
                        </th>
                        <td className="num">{m.lots_demanded}</td>
                        <td className="num">{m.lots_delivered}</td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabPanel>

            <TabPanel prefix="res" id="rutas" active={tab}>
              <div className="stack" style={{ "--gap": "1.25rem" } as CSSProperties}>
                <RouteMap
                  title="Rutas por vehículo"
                  depot={scenario.scenario.depot}
                  centers={scenario.scenario.centers}
                  distanceMode={scenario.distance_mode}
                  routes={solution.routes}
                  assignments={solution.assignments}
                  active={vehicle}
                  onSelect={setVehicle}
                />
                <RouteReplay
                  depot={scenario.scenario.depot}
                  centers={scenario.scenario.centers}
                  routes={solution.routes}
                  assignments={solution.assignments}
                />
                <RouteManifests routes={solution.routes} active={vehicle} onSelect={setVehicle} />
              </div>
            </TabPanel>

            <TabPanel prefix="res" id="evolucion" active={tab}>
              <div className="split wide-left">
                <LineChartCard
                  title="Evolución del fitness"
                  subtitle={`Semilla ${solution.seed} · ${m.generations_run} generaciones · parada por ${(STOP_LABEL[m.stop_reason ?? ""] ?? "").toLowerCase()}`}
                  data={rows}
                  series={FITNESS_SERIES}
                  xLabel="Generación"
                  digits={4}
                  animate
                  syncId="evo"
                  reference={{
                    y: b.fitness,
                    label: `Fitness de la línea base (${num(b.fitness, 5)})`,
                  }}
                  shade={stagnated ? { from: stall.at, label: "Sin mejora" } : undefined}
                />
                <LineChartCard
                  title="Diversidad"
                  subtitle="Permutaciones π distintas en la población"
                  data={rows}
                  series={DIVERSITY_SERIES}
                  xLabel="Generación"
                  digits={2}
                  animate
                  syncId="evo"
                  percent
                />
              </div>
              <EvolutionLoop params={solution.parameters} />
            </TabPanel>

            <TabPanel prefix="res" id="tecnico" active={tab}>
              <div className="kpis" style={{ "--kpi-cols": 4 } as CSSProperties}>
                <Kpi
                  label="Demanda pendiente"
                  value={m.lots_pending}
                  unit="lotes"
                  delta={`${signed(m.lots_pending - b.lots_pending, 0)} vs. base`}
                  deltaTone={m.lots_pending <= b.lots_pending ? "good" : "bad"}
                />
                <Kpi label="Fitness" value={num(m.fitness, 5)} definition="1 / (1 + J)" />
                <Kpi label="Vehículos usados" value={`${m.vehicles_used} / ${m.vehicles_total}`} />
                <Kpi
                  label="Tiempo de CPU"
                  value={num(m.cpu_seconds, 2)}
                  unit="s"
                  definition={`${num(m.evaluations)} evaluaciones de fitness.`}
                />
              </div>

              <div className="section-title">
                <h2>AG frente a la línea base</h2>
                <Badge tone={solution.comparison.ga_better_than_baseline ? "good" : "sim"}>
                  <Icon name={solution.comparison.ga_better_than_baseline ? "check" : "warn"} />
                  {solution.comparison.ga_better_than_baseline
                    ? "En esta corrida el AG obtuvo menor J"
                    : "En esta corrida el AG no superó a la línea base"}
                </Badge>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <caption>
                    Misma matriz, mismo inventario y misma D_ref = {km(m.d_ref_km)} para ambos
                    métodos. pp = puntos porcentuales.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Indicador</th>
                      <th scope="col" className="num">
                        AG
                      </th>
                      <th scope="col" className="num">
                        Línea base
                      </th>
                      <th scope="col" className="num">
                        AG − base
                      </th>
                      <th scope="col">Lectura</th>
                    </tr>
                  </thead>
                  <tbody>
                    <CompareRow
                      label="J"
                      unit="sin unidades"
                      ga={m.J}
                      base={b.J}
                      digits={5}
                      lowerIsBetter
                    />
                    <CompareRow
                      label="U · demanda ponderada no cubierta"
                      unit="0–1"
                      ga={m.U}
                      base={b.U}
                      digits={4}
                      lowerIsBetter
                    />
                    <CompareRow
                      label="R · distancia relativa"
                      unit="km / D_ref"
                      ga={m.R}
                      base={b.R}
                      digits={4}
                      lowerIsBetter
                    />
                    <CompareRow
                      label="H · prioridad alta sin entrega"
                      unit="0–1"
                      ga={m.H}
                      base={b.H}
                      digits={4}
                      lowerIsBetter
                    />
                    <CompareRow
                      label="Lotes entregados"
                      unit="lotes"
                      ga={m.lots_delivered}
                      base={b.lots_delivered}
                      digits={0}
                      lowerIsBetter={false}
                    />
                    <CompareRow
                      label="Cobertura ponderada"
                      unit="%"
                      ga={m.weighted_coverage}
                      base={b.weighted_coverage}
                      digits={1}
                      lowerIsBetter={false}
                      format={(v) => pct(v)}
                    />
                    <CompareRow
                      label="Distancia total"
                      unit="km"
                      ga={m.total_km}
                      base={b.total_km}
                      digits={2}
                      lowerIsBetter
                    />
                    <CompareRow
                      label="Vehículos usados"
                      unit="vehículos"
                      ga={m.vehicles_used}
                      base={b.vehicles_used}
                      digits={0}
                      lowerIsBetter={null}
                    />
                  </tbody>
                </table>
              </div>

              <div className="split even">
                <section className="card">
                  <h3>Cómo se compone J</h3>
                  <JBreakdown
                    params={solution.parameters}
                    rows={[
                      { label: "AG", metrics: m },
                      { label: "Línea base", metrics: b },
                    ]}
                  />
                </section>
                <section className="card">
                  <h3>Distancia y cobertura</h3>
                  <CompareBars
                    caption={`Distancia total: AG ${num(m.total_km, 2)} km, línea base ${num(b.total_km, 2)} km`}
                    format={(value) => `${num(value, 2)} km`}
                    rows={[
                      { label: "AG", value: m.total_km },
                      { label: "Línea base", value: b.total_km, base: true },
                    ]}
                  />
                  <CompareBars
                    caption={`Cobertura ponderada: AG ${pct(m.weighted_coverage)}, línea base ${pct(b.weighted_coverage)}`}
                    format={(value) => pct(value)}
                    axisMax={1}
                    rows={[
                      { label: "AG", value: m.weighted_coverage },
                      { label: "Línea base", value: b.weighted_coverage, base: true },
                    ]}
                  />
                </section>
              </div>
              <p className="small muted">{solution.baseline.method}</p>

              <div className="split even">
                <div className="card">
                  <div className="card-title">
                    <h3>Validación desde cero</h3>
                    <Feasible ok={solution.validation.feasible} />
                  </div>
                  <ul className="issue-list">
                    {solution.validation.checks.map((check) => (
                      <li key={check.id}>
                        <span
                          style={{ color: check.ok ? "var(--good-ink)" : "var(--critical-ink)" }}
                        >
                          <Icon name={check.ok ? "check" : "error"} />
                        </span>
                        <span>
                          <span className="sr-only">{check.ok ? "Cumple: " : "No cumple: "}</span>
                          {check.description}
                          <span className="field-path">{check.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="stack">
                  <div className="card">
                    <h3>Reparación de factibilidad</h3>
                    {solution.repair.total_lots_removed === 0 ? (
                      <p className="small">
                        El mejor individuo no necesitó reparación: ya cumplía inventario y
                        capacidades.
                      </p>
                    ) : (
                      <ul className="plain small">
                        {Object.entries(solution.repair.by_reason).map(([reason, items]) => (
                          <li key={reason}>
                            {REPAIR_LABEL[reason] ?? reason}:{" "}
                            <span className="mono">
                              {items.map((item) => `${item.center_id} −${item.lots}`).join(", ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="small muted">
                      En toda la corrida, {num(m.individuals_repaired)} de {num(m.evaluations)}{" "}
                      individuos requirieron retirar lotes.
                    </p>
                  </div>
                  <div className="card">
                    <h3>Corrida y parámetros</h3>
                    <dl className="summary-list">
                      <dt>Corrida</dt>
                      <dd>{shortHash(solution.run_id, 8)}</dd>
                      <dt>Escenario</dt>
                      <dd>#{shortHash(solution.scenario_hash, 10)}</dd>
                      <dt>Versión</dt>
                      <dd>{solution.code_version}</dd>
                      <dt>Fecha</dt>
                      <dd>{dateTime(solution.ended_at)}</dd>
                      <dt>CPU</dt>
                      <dd>{seconds(m.cpu_seconds)}</dd>
                      <dt>Población · élite</dt>
                      <dd>
                        {solution.parameters.population_size} · {solution.parameters.elite}
                      </dd>
                      <dt>Torneo · estancamiento</dt>
                      <dd>
                        k={solution.parameters.tournament_k} ·{" "}
                        {solution.parameters.stagnation_generations}
                      </dd>
                      <dt>p_c · p_π · p_q</dt>
                      <dd>
                        {num(solution.parameters.crossover_prob, 2)} ·{" "}
                        {num(solution.parameters.perm_mutation_prob, 2)} ·{" "}
                        {num(solution.parameters.qty_mutation_prob, 2)}
                      </dd>
                      <dt>Pesos U · R · H</dt>
                      <dd>
                        {num(solution.parameters.w_u, 2)} · {num(solution.parameters.w_r, 2)} ·{" "}
                        {num(solution.parameters.w_h, 2)}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </TabPanel>
          </section>
        </>
      )}
    </>
  );
}
