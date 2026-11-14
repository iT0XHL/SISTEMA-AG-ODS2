import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LineChartCard, type ChartRow } from "../components/LineChartCard";
import { SeedStripPlot } from "../components/SolutionViews";
import { Badge, Callout, Feasible, Icon, PageHead, Spinner, StatusChip } from "../components/ui";
import { useStore } from "../features/store";
import { api, errorMessage } from "../services/api";
import type { Experiment, GenerationPoint } from "../types";
import { STOP_LABEL, dateTime, num, pct, shortHash } from "../utils/format";

const SEED_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

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

  const scenarioId = scenario?.scenario_id;
  const seeds = meta?.official_seeds ?? [11, 22, 33, 44];

  useEffect(() => {
    if (!scenarioId) return;
    api
      .listExperiments(scenarioId)
      .then(setPrevious)
      .catch(() => setPrevious([]));
  }, [scenarioId, experiment?.status]);

  // Sondeo del experimento mientras haya corridas en cola o en ejecución.
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

  // Historial de cada corrida completada (para las cuatro curvas de convergencia).
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
        Experimento oficial: exactamente cuatro ejecuciones con las semillas {seeds.join(", ")}, el
        mismo escenario, la misma matriz, la misma D_ref y el preset «Docente» sin cambios. Cuatro
        semillas muestran la variabilidad del método; no bastan para generalizar.
      </PageHead>

      {error && (
        <Callout tone="error" title="No se pudo completar la operación">
          {error}
        </Callout>
      )}

      {!experimentId && (
        <div className="card flat">
          <p className="muted">
            Aún no se lanzó el experimento en este escenario. Las cifras de esta página provienen
            siempre de corridas ejecutadas por el programa.
          </p>
        </div>
      )}
      {experimentId && !experiment && !error && <Spinner label="Consultando el experimento…" />}

      {experiment && (
        <>
          <section className="row">
            <StatusChip status={experiment.status} />
            <Badge>Semillas {experiment.seeds.join(" · ")}</Badge>
            <Badge>D_ref = {num(experiment.baseline.d_ref_km, 2)} km</Badge>
            <span className="muted small mono">
              escenario #{shortHash(experiment.scenario_hash, 10)} · código{" "}
              {experiment.code_version} · {dateTime(experiment.created_at)}
            </span>
          </section>

          <div className="table-wrap">
            <table className="data">
              <caption>
                Una fila por corrida; la media no reemplaza las filas individuales. La línea base es
                determinista y se calcula sobre la misma instancia.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Corrida</th>
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
                    Lotes entregados / demandados
                  </th>
                  <th scope="col" className="num">
                    Cobertura ponderada
                  </th>
                  <th scope="col" className="num">
                    Distancia (km)
                  </th>
                  <th scope="col" className="num">
                    Vehículos
                  </th>
                  <th scope="col" className="num">
                    Generaciones
                  </th>
                  <th scope="col" className="num">
                    CPU (s)
                  </th>
                  <th scope="col">Factible</th>
                  <th scope="col">
                    <span className="sr-only">Detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {experiment.runs.map((run) => (
                  <tr key={run.run_id}>
                    <th scope="row">{run.corrida}</th>
                    <td className="num">{run.seed}</td>
                    <td>
                      <StatusChip status={run.status} />
                      {run.error && (
                        <span className="field">
                          <span className="error">{run.error.message}</span>
                        </span>
                      )}
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
                    <td className="num" title={STOP_LABEL[run.stop_reason ?? ""]}>
                      {run.metrics?.generations_run ?? run.progress_generation}
                    </td>
                    <td className="num">{num(run.metrics?.cpu_seconds, 2)}</td>
                    <td>
                      <Feasible ok={run.feasible} />
                    </td>
                    <td>
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
                    </td>
                  </tr>
                ))}
                {base && (
                  <tr className="emph">
                    <th scope="row" colSpan={2}>
                      Línea base
                    </th>
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
                    <td className="num">—</td>
                    <td className="num">—</td>
                    <td>
                      <Feasible ok={experiment.baseline.feasible} />
                    </td>
                    <td />
                  </tr>
                )}
              </tbody>
              {summary && (
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={3}>
                      Media ± desv. estándar (AG)
                    </th>
                    <td className="num">{meanStd(summary.J, 5)}</td>
                    <td className="num">{meanStd(summary.fitness, 5)}</td>
                    <td className="num">{meanStd(summary.lots_delivered, 1)}</td>
                    <td className="num">{meanStd(summary.weighted_coverage, 2, 100)} %</td>
                    <td className="num">{meanStd(summary.total_km, 2)}</td>
                    <td className="num">—</td>
                    <td className="num">{meanStd(summary.generations_run, 1)}</td>
                    <td className="num">{meanStd(summary.cpu_seconds, 2)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="small muted">
            Distancias: {base?.distance_mode_label}. {summary?.std_note} El tiempo de CPU depende
            del equipo y varía entre ejecuciones; el resto de cifras es reproducible con la misma
            semilla.
          </p>

          {summary && base && (
            <Callout
              tone={summary.runs_better_than_baseline === 4 ? "good" : "warn"}
              title={`${summary.runs_better_than_baseline} de 4 corridas obtuvieron menor J que la línea base`}
            >
              J medio del AG {num(summary.J.mean, 5)} frente a {num(base.J, 5)} de la línea base.{" "}
              {summary.all_feasible
                ? "Las cuatro soluciones superaron la validación de restricciones."
                : "Atención: alguna solución no superó la validación."}{" "}
              {summary.runs_better_than_baseline < 4 &&
                "Cuando el AG no supera a la línea base se reporta tal cual; las causas posibles son estancamiento, parámetros o una heurística ya cercana a lo que el decodificador puede expresar."}
            </Callout>
          )}

          {points.length > 0 && base && (
            <div className="split">
              <section className="card">
                <div className="card-title">
                  <h3>Distribución de J por semilla</h3>
                  <span className="card-note">
                    Cada punto es una corrida; la raya gris es la línea base
                  </span>
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
              <LineChartCard
                title="Convergencia de las cuatro corridas"
                subtitle="Mejor fitness por generación (sin unidades). Cada curva termina donde se detuvo su corrida."
                data={rows}
                series={series}
                xLabel="Generación"
                digits={4}
                endLabels
                reference={{ y: base.fitness, label: "Fitness de la línea base" }}
              />
            </div>
          )}
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
