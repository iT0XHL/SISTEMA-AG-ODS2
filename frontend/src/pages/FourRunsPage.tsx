import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExplainRuns } from "../components/Explain";
import { LineChartCard, type ChartRow } from "../components/LineChartCard";
import { CompareBars, SeedStripPlot } from "../components/SolutionViews";
import {
  Badge,
  Callout,
  Count,
  Feasible,
  Icon,
  PageHead,
  Skeleton,
  StatusChip,
  TabPanel,
  Tabs,
} from "../components/ui";
import { useStore } from "../features/store";
import { api, errorMessage } from "../services/api";
import type { Experiment, GenerationPoint } from "../types";
import { STOP_LABEL, dateTime, num, pct, shortHash, signed } from "../utils/format";

const SEED_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

const TABS = [
  { id: "resultados", label: "Resultados" },
  { id: "componentes", label: "Componentes de J" },
  { id: "poblacion", label: "Población" },
];

function meanStd(
  value: { mean: number | null; std: number | null } | undefined,
  digits: number,
  scale = 1,
) {
  if (!value || value.mean == null) return "—";
  return `${num(value.mean * scale, digits)} ± ${value.std == null ? "—" : num(value.std * scale, digits)}`;
}

export function FourRunsPage() {
  const { scenario, experimentId, setExperimentId, setRunId, meta } = useStore();
  const navigate = useNavigate();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [histories, setHistories] = useState<Record<number, GenerationPoint[]>>({});
  const [previous, setPrevious] = useState<
    { experiment_id: string; created_at: string; statuses: string[] }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("resultados");

  const scenarioId = scenario?.scenario_id;
  const seeds = meta?.official_seeds ?? [11, 22, 33, 44];

  useEffect(() => {
    if (!scenarioId) return;
    api
      .listExperiments(scenarioId)
      .then(setPrevious)
      .catch(() => setPrevious([]));
  }, [scenarioId, experiment?.status]);

  useEffect(() => {
    setExperiment(null);
    setHistories({});
    if (!experimentId) return;
    let cancelled = false;
    let timer: number | undefined;
    async function tick() {
      if (!experimentId) return;
      try {
        const data = await api.getExperiment(experimentId);
        if (cancelled) return;
        setExperiment(data);
        if (data.status === "running") timer = window.setTimeout(tick, 500);
      } catch (reason) {
        if (!cancelled) setError(errorMessage(reason));
      }
    }
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [experimentId]);

  const completedKey = experiment?.runs.map((run) => `${run.run_id}:${run.status}`).join("|") ?? "";
  useEffect(() => {
    if (!experiment) return;
    let cancelled = false;
    for (const run of experiment.runs) {
      if (run.status !== "completed") continue;
      api
        .getHistory(run.run_id)
        .then((data) => {
          if (!cancelled) setHistories((current) => ({ ...current, [run.seed]: data.generations }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedKey]);

  const series = useMemo(
    () =>
      (experiment?.runs ?? []).map((run, index) => ({
        key: `s${run.seed}`,
        label: `Semilla ${run.seed}`,
        color: SEED_COLORS[index % SEED_COLORS.length],
      })),
    [experiment],
  );
  const rows: ChartRow[] = useMemo(() => {
    const length = Math.max(0, ...Object.values(histories).map((h) => h.length));
    return Array.from({ length }, (_, generation) => {
      const row: ChartRow = { x: generation };
      for (const [seed, history] of Object.entries(histories)) {
        row[`s${seed}`] = history[generation]?.best_fitness ?? null;
      }
      return row;
    });
  }, [histories]);

  async function launch() {
    if (!scenarioId) return;
    setBusy(true);
    setError(null);
    try {
      const started = await api.startFourRuns(scenarioId);
      setExperimentId(started.experiment_id);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!scenario) {
    return (
      <>
        <PageHead step="Paso 6 de 6" title="Cuatro corridas" />
        <Callout tone="warn" title="No hay escenario activo">
          <Link to="/escenario">Cargue o cree un escenario</Link> para lanzar el experimento.
        </Callout>
      </>
    );
  }

  const done = experiment?.status === "completed";
  const base = experiment?.baseline.metrics;
  const summary = experiment?.summary;
  const points = (experiment?.runs ?? [])
    .filter((run) => run.metrics)
    .map((run) => ({ seed: run.seed, J: run.metrics!.J }));
  const meanChange =
    summary?.J.mean != null && base && base.J > 0
      ? ((summary.J.mean - base.J) / base.J) * 100
      : null;
  const finished = (experiment?.runs ?? []).filter((run) => run.metrics);
  const popRows = (experiment?.runs ?? []).map((run) => {
    const history = histories[run.seed];
    const first = history?.[0];
    const last = history?.[history.length - 1];
    return { run, first, last };
  });

  return (
    <>
      <PageHead
        step="Paso 6 de 6"
        title="Cuatro corridas"
        actions={
          <>
            {done && experiment && (
              <>
                <a className="btn" href={api.experimentExportUrl(experiment.experiment_id, "csv")}>
                  <Icon name="download" /> Exportar CSV
                </a>
                <a className="btn" href={api.experimentExportUrl(experiment.experiment_id, "json")}>
                  <Icon name="download" /> Exportar JSON
                </a>
                <button type="button" className="btn" onClick={() => window.print()}>
                  <Icon name="print" /> Captura para el informe
                </button>
              </>
            )}
            <button
              type="button"
              className="btn primary"
              onClick={launch}
              disabled={busy || experiment?.status === "running"}
            >
              <Icon name="play" />{" "}
              {experiment ? "Repetir las cuatro corridas" : "Lanzar las cuatro corridas"}
            </button>
          </>
        }
      >
        Cuatro ejecuciones con las semillas {seeds.join(", ")}, el mismo escenario, la misma matriz,
        la misma D_ref y el preset estándar. Muestran la variabilidad del método; no bastan para
        generalizar.
      </PageHead>

      {error && (
        <Callout tone="error" title="No se pudo completar la operación">
          {error}
        </Callout>
      )}

      {!experimentId && (
        <div className="card flat">
          <p className="muted">
            Aún no se lanzó el experimento en este escenario. Todas las cifras de esta página
            provienen de corridas ejecutadas por el programa.
          </p>
        </div>
      )}
      {experimentId && !experiment && !error && (
        <Skeleton height={220} label="Consultando el experimento" />
      )}

      {experiment && (
        <>
          <section className="row" aria-label="Datos del experimento">
            <StatusChip status={experiment.status} />
            <Badge>Semillas {experiment.seeds.join(" · ")}</Badge>
            <Badge>D_ref = {num(experiment.baseline.d_ref_km, 2)} km</Badge>
            <span className="muted small mono">
              #{shortHash(experiment.scenario_hash, 10)} · v{experiment.code_version} ·{" "}
              {dateTime(experiment.created_at)}
            </span>
          </section>

          {summary && base && (
            <section className="verdict" aria-label="Resumen del experimento">
              <div className="verdict-fig">
                <span className="label">J medio del AG frente a la línea base</span>
                <span className="hero-number">
                  <Count value={meanChange} format={(value) => `${signed(value, 1)} %`} />
                </span>
                <span className="sub">
                  {summary.runs_better_than_baseline} de {experiment.runs.length} corridas
                  obtuvieron menor J que la línea base
                </span>
                <div className="delta-chips">
                  <span className={`delta-chip ${summary.all_feasible ? "good" : "bad"}`}>
                    Factibilidad
                    <b>
                      {summary.all_feasible
                        ? `${experiment.runs.length} de ${experiment.runs.length} válidas`
                        : "Hay soluciones inválidas"}
                    </b>
                  </span>
                  <span className="delta-chip">
                    Desv. estándar de J<b>{num(summary.J.std, 5)}</b>
                  </span>
                </div>
              </div>
              <dl
                className="summary-list"
                style={{ alignSelf: "center", gridTemplateColumns: "1fr auto auto" }}
              >
                <dt />
                <dd className="muted">AG (media ± d.e.)</dd>
                <dd className="muted">Base</dd>
                <dt>J</dt>
                <dd>{meanStd(summary.J, 5)}</dd>
                <dd>{num(base.J, 5)}</dd>
                <dt>Distancia (km)</dt>
                <dd>{meanStd(summary.total_km, 2)}</dd>
                <dd>{num(base.total_km, 2)}</dd>
                <dt>Cobertura ponderada</dt>
                <dd>{meanStd(summary.weighted_coverage, 2, 100)} %</dd>
                <dd>{pct(base.weighted_coverage, 2)}</dd>
                <dt>Lotes entregados</dt>
                <dd>{meanStd(summary.lots_delivered, 1)}</dd>
                <dd>{base.lots_delivered}</dd>
              </dl>
            </section>
          )}

          <section className="seed-grid" aria-label="Resultado por semilla">
            {experiment.runs.map((run, index) => (
              <article
                key={run.run_id}
                className={`seed-card veh-${index % 4}`}
                aria-label={`Semilla ${run.seed}`}
              >
                <div className="seed-head">
                  <strong>Semilla {run.seed}</strong>
                  {run.status !== "completed" && <StatusChip status={run.status} />}
                </div>
                <span className="seed-j" title="J de la mejor solución">
                  {num(run.metrics?.J, 5)}
                </span>
                {run.error && (
                  <span className="small" style={{ color: "var(--critical-ink)" }}>
                    {run.error.message}
                  </span>
                )}
                <dl>
                  <dt>Lotes</dt>
                  <dd>
                    {run.metrics
                      ? `${run.metrics.lots_delivered} / ${run.metrics.lots_demanded}`
                      : "—"}
                  </dd>
                  <dt>Cobertura</dt>
                  <dd>{pct(run.metrics?.weighted_coverage, 2)}</dd>
                  <dt>Distancia</dt>
                  <dd>{run.metrics ? `${num(run.metrics.total_km, 2)} km` : "—"}</dd>
                  <dt>Generaciones</dt>
                  <dd title={STOP_LABEL[run.stop_reason ?? ""]}>
                    {run.metrics?.generations_run ?? run.progress_generation}
                  </dd>
                  <dt>CPU</dt>
                  <dd>{run.metrics ? `${num(run.metrics.cpu_seconds, 2)} s` : "—"}</dd>
                </dl>
                <div className="row spread">
                  <Feasible ok={run.feasible} />
                  {run.status === "completed" && (
                    <button
                      type="button"
                      className="btn small ghost no-print"
                      onClick={() => {
                        setRunId(run.run_id);
                        navigate("/resultados");
                      }}
                    >
                      Ver solución
                    </button>
                  )}
                </div>
              </article>
            ))}
            {base && (
              <article className="seed-card base" aria-label="Línea base">
                <div className="seed-head">
                  <strong>Línea base</strong>
                </div>
                <span className="seed-j">{num(base.J, 5)}</span>
                <dl>
                  <dt>Lotes</dt>
                  <dd>
                    {base.lots_delivered} / {base.lots_demanded}
                  </dd>
                  <dt>Cobertura</dt>
                  <dd>{pct(base.weighted_coverage, 2)}</dd>
                  <dt>Distancia</dt>
                  <dd>{num(base.total_km, 2)} km</dd>
                  <dt>Vehículos</dt>
                  <dd>{base.vehicles_used}</dd>
                </dl>
                <div className="row spread">
                  <Feasible ok={experiment.baseline.feasible} />
                  <Badge>Determinista</Badge>
                </div>
              </article>
            )}
          </section>

          <ExplainRuns experiment={experiment} />

          {points.length > 0 && base && (
            <>
              <div className="split even">
                <LineChartCard
                  title="Convergencia de las cuatro corridas"
                  subtitle="Mejor fitness por generación; cada curva termina donde se detuvo su corrida"
                  data={rows}
                  series={series}
                  xLabel="Generación"
                  digits={4}
                  animate
                  syncId="runs"
                  reference={{ y: base.fitness, label: "Fitness de la línea base" }}
                />
                <section className="card">
                  <div className="card-title">
                    <h3>J por semilla</h3>
                    <span className="card-note">La raya gris es la línea base</span>
                  </div>
                  <SeedStripPlot points={points} baseline={base.J} />
                  <details className="table-twin">
                    <summary>Ver los datos del gráfico en tabla</summary>
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th scope="col">Serie</th>
                            <th scope="col" className="num">
                              J
                            </th>
                            <th scope="col" className="num">
                              J − línea base
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {points.map((point) => (
                            <tr key={point.seed}>
                              <td>Semilla {point.seed}</td>
                              <td className="num">{num(point.J, 5)}</td>
                              <td className="num">{num(point.J - base.J, 5)}</td>
                            </tr>
                          ))}
                          <tr>
                            <td>Línea base</td>
                            <td className="num">{num(base.J, 5)}</td>
                            <td className="num">{num(0, 5)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </details>
                </section>
              </div>

              <div className="split even">
                <section className="card">
                  <div className="card-title">
                    <h3>Distancia total</h3>
                    <span className="card-note">km, menor es mejor</span>
                  </div>
                  <CompareBars
                    caption="Distancia total por semilla y de la línea base"
                    format={(value) => num(value, 2)}
                    rows={[
                      ...finished.map((run) => ({
                        label: `Semilla ${run.seed}`,
                        value: run.metrics!.total_km,
                      })),
                      { label: "Línea base", value: base.total_km, base: true },
                    ]}
                  />
                </section>
                <section className="card">
                  <div className="card-title">
                    <h3>Cobertura ponderada</h3>
                    <span className="card-note">mayor es mejor</span>
                  </div>
                  <CompareBars
                    caption="Cobertura ponderada por semilla y de la línea base"
                    format={(value) => pct(value, 1)}
                    axisMax={1}
                    rows={[
                      ...finished.map((run) => ({
                        label: `Semilla ${run.seed}`,
                        value: run.metrics!.weighted_coverage,
                      })),
                      { label: "Línea base", value: base.weighted_coverage, base: true },
                    ]}
                  />
                </section>
              </div>
            </>
          )}

          <section className="stack" style={{ "--gap": "1.1rem" } as CSSProperties}>
            <Tabs
              prefix="four"
              tabs={TABS}
              value={tab}
              onChange={setTab}
              label="Tablas del experimento"
            />

            <TabPanel prefix="four" id="resultados" active={tab}>
              <div className="table-wrap">
                <table className="data">
                  <caption>
                    Una fila por corrida; la media no reemplaza las filas individuales. La línea
                    base es determinista.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="num">
                        Semilla
                      </th>
                      <th scope="col">Estado</th>
                      <th scope="col" className="num">
                        J
                      </th>
                      <th scope="col" className="num">
                        Fitness
                      </th>
                      <th scope="col" className="num">
                        Lotes
                      </th>
                      <th scope="col" className="num">
                        Cobertura pond.
                      </th>
                      <th scope="col" className="num">
                        Km
                      </th>
                      <th scope="col" className="num">
                        Veh.
                      </th>
                      <th scope="col">Factible</th>
                    </tr>
                  </thead>
                  <tbody>
                    {experiment.runs.map((run) => (
                      <tr key={run.run_id}>
                        <th scope="row" className="num">
                          {run.seed}
                        </th>
                        <td>
                          <StatusChip status={run.status} />
                        </td>
                        <td className="num">{num(run.metrics?.J, 5)}</td>
                        <td className="num">{num(run.metrics?.fitness, 5)}</td>
                        <td className="num">
                          {run.metrics
                            ? `${run.metrics.lots_delivered} / ${run.metrics.lots_demanded}`
                            : "—"}
                        </td>
                        <td className="num">{pct(run.metrics?.weighted_coverage, 2)}</td>
                        <td className="num">{num(run.metrics?.total_km, 2)}</td>
                        <td className="num">{run.metrics?.vehicles_used ?? "—"}</td>
                        <td>
                          <Feasible ok={run.feasible} />
                        </td>
                      </tr>
                    ))}
                    {base && (
                      <tr className="emph">
                        <th scope="row">Base</th>
                        <td>
                          <Badge>Determinista</Badge>
                        </td>
                        <td className="num">{num(base.J, 5)}</td>
                        <td className="num">{num(base.fitness, 5)}</td>
                        <td className="num">
                          {base.lots_delivered} / {base.lots_demanded}
                        </td>
                        <td className="num">{pct(base.weighted_coverage, 2)}</td>
                        <td className="num">{num(base.total_km, 2)}</td>
                        <td className="num">{base.vehicles_used}</td>
                        <td>
                          <Feasible ok={experiment.baseline.feasible} />
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {summary && (
                    <tfoot>
                      <tr>
                        <th scope="row" colSpan={2}>
                          Media ± d.e. (AG)
                        </th>
                        <td className="num">{meanStd(summary.J, 5)}</td>
                        <td className="num">{meanStd(summary.fitness, 5)}</td>
                        <td className="num">{meanStd(summary.lots_delivered, 1)}</td>
                        <td className="num">{meanStd(summary.weighted_coverage, 2, 100)} %</td>
                        <td className="num">{meanStd(summary.total_km, 2)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="small muted">
                Distancias: {base?.distance_mode_label}. {summary?.std_note} El tiempo de CPU
                depende del equipo; el resto de cifras es reproducible con la misma semilla.
              </p>
            </TabPanel>

            <TabPanel prefix="four" id="componentes" active={tab}>
              <div className="table-wrap">
                <table className="data">
                  <caption>
                    U = demanda ponderada no cubierta, R = distancia relativa a D_ref, H = centros
                    de prioridad alta sin entrega.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="num">
                        Semilla
                      </th>
                      <th scope="col" className="num">
                        U
                      </th>
                      <th scope="col" className="num">
                        R
                      </th>
                      <th scope="col" className="num">
                        H
                      </th>
                      <th scope="col" className="num">
                        Generaciones
                      </th>
                      <th scope="col">Parada</th>
                      <th scope="col" className="num">
                        CPU (s)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {experiment.runs.map((run) => (
                      <tr key={run.run_id}>
                        <th scope="row" className="num">
                          {run.seed}
                        </th>
                        <td className="num">{num(run.metrics?.U, 5)}</td>
                        <td className="num">{num(run.metrics?.R, 5)}</td>
                        <td className="num">{num(run.metrics?.H, 5)}</td>
                        <td className="num">
                          {run.metrics?.generations_run ?? run.progress_generation}
                        </td>
                        <td>{STOP_LABEL[run.stop_reason ?? ""] ?? "—"}</td>
                        <td className="num">{num(run.metrics?.cpu_seconds, 3)}</td>
                      </tr>
                    ))}
                    {base && (
                      <tr className="emph">
                        <th scope="row">Base</th>
                        <td className="num">{num(base.U, 5)}</td>
                        <td className="num">{num(base.R, 5)}</td>
                        <td className="num">{num(base.H, 5)}</td>
                        <td className="num">—</td>
                        <td>—</td>
                        <td className="num">—</td>
                      </tr>
                    )}
                  </tbody>
                  {summary && (
                    <tfoot>
                      <tr>
                        <th scope="row">Media ± d.e.</th>
                        <td className="num">{meanStd(summary.U, 5)}</td>
                        <td className="num">{meanStd(summary.R, 5)}</td>
                        <td className="num">{meanStd(summary.H, 5)}</td>
                        <td className="num">{meanStd(summary.generations_run, 1)}</td>
                        <td />
                        <td className="num">{meanStd(summary.cpu_seconds, 3)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabPanel>

            <TabPanel prefix="four" id="poblacion" active={tab}>
              <div className="table-wrap">
                <table className="data">
                  <caption>
                    Generación 0 frente al último registro de cada historial. La diversidad cuenta
                    órdenes π distintos y no compara las cantidades q.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="num">
                        Semilla
                      </th>
                      <th scope="col" className="num">
                        Fitness inicial
                      </th>
                      <th scope="col" className="num">
                        Fitness final
                      </th>
                      <th scope="col" className="num">
                        Promedio final
                      </th>
                      <th scope="col" className="num">
                        Diversidad final
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {popRows.map(({ run, first, last }) => (
                      <tr key={run.run_id}>
                        <th scope="row" className="num">
                          {run.seed}
                        </th>
                        <td className="num">{num(first?.best_fitness, 5)}</td>
                        <td className="num">{num(last?.best_fitness, 5)}</td>
                        <td className="num">{num(last?.mean_fitness, 5)}</td>
                        <td className="num">{pct(last?.diversity, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabPanel>
          </section>
        </>
      )}

      {previous.length > 1 && (
        <section className="stack no-print">
          <div className="section-title">
            <h2>Experimentos anteriores de este escenario</h2>
          </div>
          <div className="row">
            <label htmlFor="experiment-select" className="small">
              Experimento mostrado
            </label>
            <select
              id="experiment-select"
              className="select"
              style={{ maxWidth: "26rem" }}
              value={experimentId ?? ""}
              onChange={(event) => setExperimentId(event.target.value || null)}
            >
              {previous.map((item) => (
                <option key={item.experiment_id} value={item.experiment_id}>
                  {dateTime(item.created_at)} ·{" "}
                  {item.statuses.filter((s) => s === "completed").length}/4 completadas
                </option>
              ))}
            </select>
          </div>
        </section>
      )}
      {!experimentId && previous.length > 0 && (
        <button
          type="button"
          className="btn"
          onClick={() => setExperimentId(previous[0].experiment_id)}
        >
          Abrir el último experimento ({dateTime(previous[0].created_at)})
        </button>
      )}
    </>
  );
}
