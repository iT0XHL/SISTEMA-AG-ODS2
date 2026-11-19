import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { EvolutionLoop } from "../components/Explainers";
import { LineChartCard, type ChartRow } from "../components/LineChartCard";
import { Callout, Icon, Kpi, Meter, PageHead, Skeleton, StatusChip } from "../components/ui";
import { useStore } from "../features/store";
import { useRun } from "../features/useRun";
import { api, errorMessage } from "../services/api";
import type { RunState } from "../types";
import { STATUS_LABEL, STOP_LABEL, dateTime, num, pct, signed } from "../utils/format";
import { lastImprovement } from "../utils/evolution";

const FITNESS_SERIES = [
  { key: "best", label: "Mejor fitness", color: "var(--series-1)" },
  { key: "mean", label: "Fitness promedio", color: "var(--series-2)" },
];
const DIVERSITY_SERIES = [{ key: "diversity", label: "Diversidad", color: "var(--series-3)" }];
const SPEEDS = [1, 2, 4];

export function RunPage() {
  const { scenario, runId, setRunId } = useStore();
  const { run, history, error } = useRun(runId);
  const [recent, setRecent] = useState<RunState[]>([]);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timer = useRef<number | undefined>(undefined);

  const scenarioId = scenario?.scenario_id;
  const active = run ? ["queued", "running"].includes(run.status) : false;
  const finished = run ? !active : false;

  useEffect(() => {
    if (!scenarioId) return;
    api
      .listRuns(scenarioId)
      .then(setRecent)
      .catch(() => setRecent([]));
  }, [scenarioId, run?.status]);

  useEffect(() => {
    setReplay(null);
    setPlaying(false);
  }, [runId]);

  useEffect(() => {
    window.clearInterval(timer.current);
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setReplay((current) => {
        const next = (current ?? 0) + 1;
        if (next >= history.length - 1) {
          setPlaying(false);
          return null;
        }
        return next;
      });
    }, 70 / speed);
    return () => window.clearInterval(timer.current);
  }, [playing, speed, history.length]);

  const visible = useMemo(
    () => (replay == null ? history : history.slice(0, replay + 1)),
    [history, replay],
  );
  const rows: ChartRow[] = useMemo(
    () =>
      visible.map((g) => ({
        x: g.number,
        best: g.best_fitness,
        mean: g.mean_fitness,
        diversity: g.diversity,
      })),
    [visible],
  );
  const last = visible[visible.length - 1];
  const first = history[0];
  const xMax = finished ? history[history.length - 1]?.number : run?.progress.max_generations;
  const recentToShow = showAllRecent ? recent : recent.slice(0, 5);
  const tolerance = run?.parameters.improvement_tolerance ?? 1e-6;
  const stagnationLimit = run?.parameters.stagnation_generations ?? 0;
  const stall = lastImprovement(visible, tolerance);
  const showShade =
    finished && replay == null && run?.stop_reason === "stagnation" && stall.since > 0;

  async function cancel() {
    if (!runId) return;
    setCancelError(null);
    try {
      await api.cancelRun(runId);
    } catch (reason) {
      setCancelError(errorMessage(reason));
    }
  }

  if (!scenario) {
    return (
      <>
        <PageHead step="Paso 4 de 6" title="Ejecución" />
        <Callout tone="warn" title="No hay escenario activo">
          <Link to="/escenario">Cargue o cree un escenario</Link> antes de ejecutar el AG.
        </Callout>
      </>
    );
  }

  return (
    <>
      <PageHead
        step="Paso 4 de 6"
        title="Ejecución"
        actions={
          <Link className="btn" to="/configuracion">
            Nueva corrida
          </Link>
        }
      >
        Un proceso aparte ejecuta el algoritmo mientras esta página lee el avance. El mejor fitness
        nunca baja porque el elitismo conserva las mejores soluciones.
      </PageHead>

      {!runId && (
        <Callout tone="info" title="Aún no hay una corrida seleccionada">
          Pulse «Ejecutar AG» en <Link to="/configuracion">Configuración</Link> o elija una corrida
          de la lista.
        </Callout>
      )}
      {error && (
        <Callout tone="error" title="No se pudo leer la corrida">
          {error}
        </Callout>
      )}
      {runId && !run && !error && <Skeleton height={200} label="Consultando la corrida" />}

      {run && (
        <>
          <section className="card">
            <div className="card-title">
              <div className="row">
                <h2>Corrida con semilla {run.seed}</h2>
                <StatusChip status={run.status} />
              </div>
              <div className="row no-print">
                {!finished && (
                  <button
                    type="button"
                    className="btn danger"
                    onClick={cancel}
                    disabled={run.cancel_requested}
                  >
                    <Icon name="stop" />{" "}
                    {run.cancel_requested ? "Cancelación solicitada…" : "Cancelar corrida"}
                  </button>
                )}
                {run.status === "completed" && (
                  <Link className="btn primary" to="/resultados">
                    Ver resultados <Icon name="arrow" />
                  </Link>
                )}
              </div>
            </div>
            <div>
              <div className="meter-row" style={{ marginBottom: "0.4rem" }}>
                <span>
                  Generación {run.progress.generation} de {run.progress.max_generations} como máximo
                </span>
                <span className="mono">{pct(run.progress.fraction, 0)}</span>
              </div>
              <div
                className={`progress ${active ? "live" : ""}`}
                role="progressbar"
                aria-label="Avance de la corrida"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(run.progress.fraction * 100)}
              >
                <span style={{ width: `${run.progress.fraction * 100}%` }} />
              </div>
            </div>
            {stagnationLimit > 0 && (
              <Meter
                label="Generaciones sin mejora relevante"
                value={Math.min(stall.since, stagnationLimit)}
                max={stagnationLimit}
                unit="gen."
              />
            )}
            <p className="small muted" aria-live="polite">
              {STATUS_LABEL[run.status]}
              {run.stop_reason &&
                ` · parada por ${(STOP_LABEL[run.stop_reason] ?? run.stop_reason).toLowerCase()}`}
              {run.started_at && ` · inicio ${dateTime(run.started_at)}`}
              {run.ended_at && ` · fin ${dateTime(run.ended_at)}`}
            </p>
            {run.error && (
              <Callout tone="error" title={`La corrida falló (${run.error.code})`}>
                {run.error.message}
              </Callout>
            )}
            {run.status === "cancelled" && (
              <Callout tone="warn" title="Corrida cancelada">
                Se conserva el historial hasta la generación {run.progress.generation}; no se
                publica ninguna solución.
              </Callout>
            )}
            {run.status === "completed" && (
              <Callout tone="good" title="Solución validada">
                Cumple inventario, capacidades y visitas únicas.
              </Callout>
            )}
            {cancelError && <Callout tone="error">{cancelError}</Callout>}
          </section>

          <div className="kpis" style={{ "--kpi-cols": 3 } as CSSProperties}>
            <Kpi
              label="Generación"
              value={last ? last.number : "—"}
              definition="Última generación mostrada en los gráficos."
            />
            <Kpi
              label="Mejor fitness"
              value={num(last?.best_fitness, 5)}
              definition="Calidad del mejor reparto hallado; mayor es mejor."
              delta={
                first && last && last.number > 0
                  ? `${signed(last.best_fitness - first.best_fitness, 5)} desde la generación 0`
                  : undefined
              }
              deltaTone="good"
            />
            <Kpi
              label="Diversidad"
              value={pct(last?.diversity, 0)}
              definition="Qué tan distintas son las soluciones de la población."
            />
          </div>

          <section className="stack">
            <div className="section-title">
              <h2>Evolución</h2>
            </div>
            {finished && history.length > 2 && (
              <div
                className="player no-print"
                role="group"
                aria-label="Reproducción de la evolución"
              >
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    if (!playing && (replay == null || replay >= history.length - 1)) setReplay(0);
                    setPlaying((value) => !value);
                  }}
                >
                  <Icon name={playing ? "pause" : "play"} /> {playing ? "Pausar" : "Reproducir"}
                </button>
                <div className="segmented" role="group" aria-label="Velocidad">
                  {SPEEDS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={speed === value}
                      style={{ minHeight: 30, paddingInline: "0.6rem" }}
                      onClick={() => setSpeed(value)}
                    >
                      {value}×
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  aria-label="Generación mostrada"
                  min={0}
                  max={history.length - 1}
                  value={replay ?? history.length - 1}
                  onChange={(event) => {
                    setPlaying(false);
                    setReplay(Number(event.target.value));
                  }}
                />
                <span className="mono small">{replay ?? history.length - 1}</span>
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => {
                    setPlaying(false);
                    setReplay(null);
                  }}
                  disabled={replay == null}
                >
                  <Icon name="replay" /> Mostrar todo
                </button>
              </div>
            )}
            <LineChartCard
              title="Fitness por generación"
              subtitle="Mejor individuo y promedio de la población"
              data={rows}
              series={FITNESS_SERIES}
              xLabel="Generación"
              xMax={xMax}
              digits={4}
              syncId="run"
              shade={showShade ? { from: stall.at, label: "Sin mejora" } : undefined}
            />
            <EvolutionLoop params={run.parameters} />
            <details className="advanced">
              <summary>
                Más indicadores <span>fitness promedio, J y diversidad</span>
              </summary>
              <div className="advanced-body stack" style={{ "--gap": "1rem" } as CSSProperties}>
                <div className="kpis" style={{ "--kpi-cols": 2 } as CSSProperties}>
                  <Kpi
                    label="Fitness promedio"
                    value={num(last?.mean_fitness, 5)}
                    definition="Media de la población en esa generación."
                  />
                  <Kpi
                    label="Mejor J"
                    value={num(last?.best_J, 5)}
                    definition="Puntaje del mejor reparto; menor es mejor."
                  />
                </div>
                <LineChartCard
                  title="Diversidad de la población"
                  subtitle="Proporción de permutaciones π distintas"
                  data={rows}
                  series={DIVERSITY_SERIES}
                  xLabel="Generación"
                  xMax={xMax}
                  digits={2}
                  syncId="run"
                  percent
                />
              </div>
            </details>
          </section>
        </>
      )}

      {recent.length > 0 && (
        <section className="stack">
          <div className="section-title">
            <h2>Corridas de este escenario</h2>
            {recent.length > 5 && (
              <button
                type="button"
                className="btn small"
                aria-expanded={showAllRecent}
                onClick={() => setShowAllRecent((value) => !value)}
              >
                {showAllRecent ? "Mostrar recientes" : `Ver las ${recent.length} corridas`}
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Ver</th>
                  <th scope="col" className="num">
                    Semilla
                  </th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="num">
                    Generaciones
                  </th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Creada</th>
                </tr>
              </thead>
              <tbody>
                {recentToShow.map((item) => (
                  <tr key={item.run_id} className={item.run_id === runId ? "emph" : undefined}>
                    <td>
                      <input
                        type="radio"
                        name="run"
                        aria-label={`Ver corrida con semilla ${item.seed} creada ${dateTime(item.created_at)}`}
                        checked={item.run_id === runId}
                        onChange={() => setRunId(item.run_id)}
                        style={{ width: "1.2rem", height: "1.2rem", accentColor: "var(--accent)" }}
                      />
                    </td>
                    <td className="num">{item.seed}</td>
                    <td>
                      <StatusChip status={item.status} />
                    </td>
                    <td className="num">{item.progress.generation}</td>
                    <td>{item.experiment_id ? "Cuatro corridas" : "Individual"}</td>
                    <td>{dateTime(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
