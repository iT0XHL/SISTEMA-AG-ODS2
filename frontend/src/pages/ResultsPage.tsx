import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { LineChartCard, type ChartRow } from "../components/LineChartCard";
import { RouteMap } from "../components/RouteMap";
import { ChromosomeView, JBreakdown, RouteManifests } from "../components/SolutionViews";
import { Badge, Callout, Feasible, Icon, Kpi, PageHead, Spinner } from "../components/ui";
import { useStore } from "../features/store";
import { ApiError, api, errorMessage } from "../services/api";
import type { GenerationPoint, Metrics, RunState, Solution } from "../types";
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

type Tab = "asignacion" | "rutas";

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
      <td>{lowerIsBetter == null ? <span className="muted">—</span> : verdict}</td>
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
  const [tab, setTab] = useState<Tab>("asignacion");

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
    () => history.map((g) => ({ x: g.number, best: g.best_fitness, mean: g.mean_fitness })),
    [history],
  );
  const names = useMemo(
    () => new Map((scenario?.scenario.centers ?? []).map((c) => [c.id, c.name])),
    [scenario],
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
        Mejor solución encontrada en una corrida (no es una garantía de óptimo). Se compara con la
        línea base heurística sobre la misma instancia, las mismas unidades y la misma D_ref.
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
      {loading && <Spinner label="Cargando la solución…" />}
      {error && (
        <Callout tone="error" title="No hay resultados para esta corrida">
          {error}
        </Callout>
      )}

      {solution && m && b && (
        <>
          <section className="row">
            <Feasible ok={solution.validation.feasible} />
            <Badge>Semilla {solution.seed}</Badge>
            <Badge title={m.distance_mode_label}>
              {straight ? "Distancia en línea recta (no vial)" : "Distancia de matriz vial"}
            </Badge>
            <Badge>
              {STOP_LABEL[m.stop_reason ?? ""] ?? m.stop_reason} · {m.generations_run} generaciones
            </Badge>
            <span className="muted small mono">
              escenario #{shortHash(solution.scenario_hash, 10)} · código {solution.code_version}
            </span>
          </section>

          <div className="kpis" style={{ "--kpi-cols": 4 } as CSSProperties}>
            <Kpi
              label="Lotes entregados"
              value={m.lots_delivered}
              unit={`de ${m.inventory_lots} en inventario`}
              definition={`Σ qᵢ. Demanda total: ${m.lots_demanded} lotes.`}
              delta={`${signed(m.lots_delivered - b.lots_delivered, 0)} frente a la línea base`}
            />
            <Kpi
              label="Demanda pendiente"
              value={m.lots_pending}
              unit="lotes"
              definition="Σ (dᵢ − qᵢ): demanda que queda sin cubrir en el período."
            />
            <Kpi
              label="Cobertura ponderada"
              value={pct(m.weighted_coverage)}
              definition="1 − U: parte de la demanda ponderada por prioridad que sí se atiende."
              delta={`${signed((m.weighted_coverage - b.weighted_coverage) * 100, 1)} pp frente a la línea base`}
            />
            <Kpi
              label={straight ? "Distancia estimada (línea recta)" : "Distancia (vía real)"}
              value={num(m.total_km, 2)}
              unit="km"
              definition={`Suma de las rutas depósito → centros → depósito. D_ref = ${km(m.d_ref_km)}.`}
              delta={`${signed(m.total_km - b.total_km, 2)} km frente a la línea base`}
            />
            <Kpi
              label="Fitness (sin unidades)"
              value={num(m.fitness, 5)}
              definition={`1 / (1 + J), con J = ${num(m.J, 5)}. Mayor fitness = menor J.`}
            />
            <Kpi
              label="Centros atendidos"
              value={`${m.centers_served} / ${m.centers_with_demand}`}
              definition={`Centros con qᵢ > 0. ${m.centers_fully_served} reciben su demanda completa; prioridad alta sin entrega: ${m.high_priority_unserved} de ${m.high_priority_total}.`}
            />
            <Kpi
              label="Vehículos usados"
              value={`${m.vehicles_used} / ${m.vehicles_total}`}
              definition="Vehículos con al menos una parada; cada uno hace un solo recorrido."
            />
            <Kpi
              label="Tiempo de CPU"
              value={num(m.cpu_seconds, 2)}
              unit="s"
              definition={`${num(m.evaluations)} evaluaciones de fitness en el worker.`}
            />
          </div>

          <section className="stack">
            <div className="section-title">
              <h2>AG frente a la línea base</h2>
              <Badge tone={solution.comparison.ga_better_than_baseline ? "good" : "sim"}>
                <Icon name={solution.comparison.ga_better_than_baseline ? "check" : "warn"} />
                {solution.comparison.ga_better_than_baseline
                  ? "En esta corrida el AG obtuvo menor J"
                  : "En esta corrida el AG no superó a la línea base"}
              </Badge>
            </div>
            <div className="stack">
              <div className="table-wrap">
                <table className="data">
                  <caption>
                    Misma matriz de distancias, mismo inventario y misma D_ref = {km(m.d_ref_km)}{" "}
                    para ambos métodos. pp = puntos porcentuales.
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
              <div className="card">
                <h3>Cómo se compone J</h3>
                <JBreakdown
                  params={solution.parameters}
                  rows={[
                    { label: "AG", metrics: m },
                    { label: "Línea base", metrics: b },
                  ]}
                />
                {!solution.comparison.ga_better_than_baseline && (
                  <Callout tone="warn">
                    Posibles causas: estancamiento prematuro, ajuste de parámetros o una heurística
                    ya cercana a lo que el decodificador puede expresar. Se reporta tal cual.
                  </Callout>
                )}
                <p className="small muted">{solution.baseline.method}</p>
              </div>
            </div>
          </section>

          <section className="stack">
            <div className="tabs" role="tablist" aria-label="Detalle de la solución">
              <button
                type="button"
                role="tab"
                id="tab-asignacion"
                aria-selected={tab === "asignacion"}
                aria-controls="panel-asignacion"
                onClick={() => setTab("asignacion")}
              >
                Asignación
              </button>
              <button
                type="button"
                role="tab"
                id="tab-rutas"
                aria-selected={tab === "rutas"}
                aria-controls="panel-rutas"
                onClick={() => setTab("rutas")}
              >
                Rutas
              </button>
            </div>

            {tab === "asignacion" && (
              <div
                className="stack"
                role="tabpanel"
                id="panel-asignacion"
                aria-labelledby="tab-asignacion"
              >
                <div className="card">
                  <div className="card-title">
                    <h3>Cromosoma (π, q) y su decodificación</h3>
                    <span className="card-note">Genotipo → plan operativo</span>
                  </div>
                  <ChromosomeView
                    chromosome={solution.chromosome}
                    assignments={solution.assignments}
                    routes={solution.routes}
                  />
                </div>
                <div className="table-wrap">
                  <table className="data">
                    <caption>
                      Asignación por centro. «Solo parcial» marca los centros cuya demanda supera la
                      capacidad del mayor vehículo: el prototipo no programa varios viajes al mismo
                      centro.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Centro</th>
                        <th scope="col">Nombre</th>
                        <th scope="col" className="num">
                          Prioridad pᵢ
                        </th>
                        <th scope="col" className="num">
                          Demanda dᵢ
                        </th>
                        <th scope="col" className="num">
                          Asignado qᵢ
                        </th>
                        <th scope="col" className="num">
                          Pendiente
                        </th>
                        <th scope="col">Vehículo</th>
                        <th scope="col" className="num">
                          Parada
                        </th>
                        <th scope="col">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {solution.assignments.map((row) => (
                        <tr key={row.center_id}>
                          <td className="id">{row.center_id}</td>
                          <td>{names.get(row.center_id) ?? "—"}</td>
                          <td className="num">{row.priority_weight}</td>
                          <td className="num">{row.demand_lots}</td>
                          <td className="num">{row.assigned_lots}</td>
                          <td className="num">{row.pending_lots}</td>
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
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="emph">
                        <th scope="row" colSpan={3}>
                          Total
                        </th>
                        <td className="num">{m.lots_demanded}</td>
                        <td className="num">{m.lots_delivered}</td>
                        <td className="num">{m.lots_pending}</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {tab === "rutas" && (
              <div className="split" role="tabpanel" id="panel-rutas" aria-labelledby="tab-rutas">
                <div className="stack">
                  <RouteManifests routes={solution.routes} />
                  <p className="small muted">
                    Cada hoja de ruta lista las paradas en orden, los lotes que se descargan y la
                    carga frente a la capacidad del vehículo.
                  </p>
                </div>
                <RouteMap
                  title="Rutas por vehículo"
                  depot={scenario.scenario.depot}
                  centers={scenario.scenario.centers}
                  distanceMode={scenario.distance_mode}
                  routes={solution.routes}
                  assignments={solution.assignments}
                />
              </div>
            )}
          </section>

          <section className="stack">
            <div className="section-title">
              <h2>Evidencia de la corrida</h2>
            </div>
            <div className="split wide-left">
              <LineChartCard
                title="Evolución del fitness"
                subtitle={`Semilla ${solution.seed} · ${m.generations_run} generaciones · parada por ${(STOP_LABEL[m.stop_reason ?? ""] ?? "").toLowerCase()}`}
                data={rows}
                series={FITNESS_SERIES}
                xLabel="Generación"
                digits={4}
              />
              <div className="stack">
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
                <div className="card">
                  <h3>Reparación de factibilidad</h3>
                  {solution.repair.total_lots_removed === 0 ? (
                    <p className="small">
                      El mejor individuo no necesitó reparación: su cromosoma ya cumplía inventario
                      y capacidades.
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
                    individuos requirieron retirar lotes
                    {Object.entries(m.repair_totals_all_evaluations ?? {}).length > 0 &&
                      ` (${Object.entries(m.repair_totals_all_evaluations ?? {})
                        .map(([reason, lots]) => `${reason.replace("_", " ")}: ${num(lots)} lotes`)
                        .join("; ")})`}
                    . El registro distingue la variación genética de la corrección de factibilidad.
                  </p>
                </div>
              </div>
            </div>
            <div className="card">
              <h3>Metadatos para el informe</h3>
              <dl className="io-list">
                <dt>Corrida</dt>
                <dd className="mono">{solution.run_id}</dd>
                <dt>Semilla</dt>
                <dd className="mono">{solution.seed}</dd>
                <dt>Escenario</dt>
                <dd className="mono">
                  {solution.scenario_id} · sha256 {solution.scenario_hash}
                </dd>
                <dt>Versión</dt>
                <dd className="mono">{solution.code_version}</dd>
                <dt>Fecha</dt>
                <dd>
                  {dateTime(solution.ended_at)} · CPU {seconds(m.cpu_seconds)}
                </dd>
                <dt>Parámetros</dt>
                <dd className="mono small">
                  N={solution.parameters.population_size} · G_max=
                  {solution.parameters.max_generations} · k=
                  {solution.parameters.tournament_k} · p_c=
                  {num(solution.parameters.crossover_prob, 2)} · p_π=
                  {num(solution.parameters.perm_mutation_prob, 2)} · p_q=
                  {num(solution.parameters.qty_mutation_prob, 2)} · élite=
                  {solution.parameters.elite} · estancamiento=
                  {solution.parameters.stagnation_generations}
                </dd>
              </dl>
            </div>
          </section>
        </>
      )}
    </>
  );
}
