import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { LineChartCard, type ChartRow } from "../components/LineChartCard";
import { Callout, Icon, Kpi, PageHead, Spinner, StatusChip } from "../components/ui";
import { useStore } from "../features/store";
import { useRun } from "../features/useRun";
import { api, errorMessage } from "../services/api";
import type { RunState } from "../types";
import { STATUS_LABEL, STOP_LABEL, dateTime, num, pct } from "../utils/format";

const FITNESS_SERIES = [
  { key: "best", label: "Mejor fitness", color: "var(--series-1)" },
  { key: "mean", label: "Fitness promedio", color: "var(--series-2)" },
];
const DIVERSITY_SERIES = [{ key: "diversity", label: "Diversidad", color: "var(--series-3)" }];

export function RunPage() {
  const { scenario, runId, setRunId } = useStore();
  const { run, history, error } = useRun(runId);
  const [recent, setRecent] = useState<RunState[]>([]);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const scenarioId = scenario?.scenario_id;
  const finished = run ? !["queued", "running"].includes(run.status) : false;

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

  // Reproducción de la evolución: avanza generación a generación y se puede pausar.
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
    }, 70);
    return () => window.clearInterval(timer.current);
  }, [playing, history.length]);

  const visible = replay == null ? history : history.slice(0, replay + 1);
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
  const xMax = finished ? history[history.length - 1]?.number : run?.progress.max_generations;
  const recentToShow = showAllRecent ? recent : recent.slice(0, 5);

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
        El servidor encola la corrida y un proceso aparte (worker) ejecuta el algoritmo. Aquí se ve
        el avance por generaciones: el mejor fitness nunca baja porque el elitismo conserva las dos
        mejores soluciones.
      </PageHead>

      {!runId && (
        <Callout tone="info" title="Aún no hay una corrida seleccionada">
          Vaya a <Link to="/configuracion">Configuración AG</Link> y pulse «Ejecutar AG», o elija
          una corrida anterior de la lista.
        </Callout>
      )}
      {error && (
        <Callout tone="error" title="No se pudo leer la corrida">
          {error}
        </Callout>
      )}
      {runId && !run && !error && <Spinner label="Consultando la corrida…" />}

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
              <div className="meter-row">
                <span>
                  Generación {run.progress.generation} de {run.progress.max_generations} como máximo
                </span>
                <span className="mono">{pct(run.progress.fraction, 0)}</span>
              </div>
              <div
                className="progress"
                role="progressbar"
                aria-label="Avance de la corrida"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(run.progress.fraction * 100)}
              >
                <span style={{ width: `${run.progress.fraction * 100}%` }} />
              </div>
            </div>
            <p className="small muted" aria-live="polite">
              {STATUS_LABEL[run.status]}
              {run.stop_reason &&
                ` · criterio de parada: ${STOP_LABEL[run.stop_reason] ?? run.stop_reason}`}
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
                Se conserva el historial hasta la generación {run.progress.generation}, pero no se
                publica ninguna solución.
              </Callout>
            )}
            {run.status === "completed" && (
              <Callout tone="good" title="Solución validada">
                La mejor solución superó la comprobación de inventario, capacidades y visitas
                únicas.
              </Callout>
            )}
            {cancelError && <Callout tone="error">{cancelError}</Callout>}
          </section>

          <div className="kpis" style={{ "--kpi-cols": 5 } as CSSProperties}>
            <Kpi
              label="Generación"
              value={last ? last.number : "—"}
              definition="Última generación mostrada en los gráficos."
            />
            <Kpi
              label="Mejor fitness (sin unidades)"
              value={num(last?.best_fitness, 5)}
              definition="1 / (1 + J) del mejor individuo; mayor es mejor."
            />
            <Kpi
              label="Fitness promedio (sin unidades)"
              value={num(last?.mean_fitness, 5)}
              definition="Media de la población en esa generación."
            />
            <Kpi
              label="Mejor J (sin unidades)"
              value={num(last?.best_J, 5)}
              definition="0,75·U + 0,20·R + 0,05·H; menor es mejor."
            />
            <Kpi
              label="Diversidad"
              value={pct(last?.diversity, 0)}
              definition="Proporción de permutaciones π distintas en la población."
            />
          </div>

          {finished && history.length > 2 && (
            <section className="card no-print">
              <div className="card-title">
                <h3>Reproducir la evolución</h3>
                <span className="card-note">
                  Opcional · se puede pausar en cualquier generación
                </span>
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (!playing && (replay == null || replay >= history.length - 1)) setReplay(0);
                    setPlaying((value) => !value);
                  }}
                >
                  <Icon name={playing ? "pause" : "play"} /> {playing ? "Pausar" : "Reproducir"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setPlaying(false);
                    setReplay(null);
                  }}
                  disabled={replay == null}
                >
                  <Icon name="replay" /> Mostrar todo
                </button>
                <label className="row grow" style={{ gap: "0.6rem" }}>
                  <span className="small">Generación</span>
                  <input
                    className="grow"
                    type="range"
                    min={0}
                    max={history.length - 1}
                    value={replay ?? history.length - 1}
                    onChange={(event) => {
                      setPlaying(false);
                      setReplay(Number(event.target.value));
                    }}
                    style={{ accentColor: "var(--accent)", minHeight: "44px" }}
                  />
                  <span className="mono small">{replay ?? history.length - 1}</span>
                </label>
              </div>
            </section>
          )}

          <div className="split wide-left">
            <LineChartCard
              title="Fitness por generación"
              subtitle="Mejor individuo y promedio de la población (sin unidades, mayor es mejor)"
              data={rows}
              series={FITNESS_SERIES}
              xLabel="Generación"
              xMax={xMax}
              digits={4}
              endLabels={false}
            />
            <LineChartCard
              title="Diversidad de la población"
              subtitle="Proporción de permutaciones π distintas (0 a 1)"
              data={rows}
              series={DIVERSITY_SERIES}
              xLabel="Generación"
              xMax={xMax}
              digits={2}
            />
          </div>
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
