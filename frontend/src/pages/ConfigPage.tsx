import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { OperatorExample, type OperatorKind } from "../components/Explainers";
import { Callout, Field, Icon, PageHead } from "../components/ui";
import { useStore } from "../features/store";
import { api, errorMessage } from "../services/api";
import type { BaselineResult, GAParams } from "../types";
import { km, num, pct } from "../utils/format";

type Key = keyof GAParams;

interface FieldDef {
  key: Key;
  label: string;
  hint: string;
  step: number;
  min: number;
  max?: number;
}

interface Stage {
  title: string;
  concept: string;
  kind: OperatorKind;
  text: string;
  fields: FieldDef[];
}

const STAGES: Stage[] = [
  {
    title: "Población inicial",
    concept: "P(0)",
    kind: "poblacion",
    text: "Aleatorios, sesgados por prioridad y derivados de la heurística. Todos se reparan antes de evaluarse.",
    fields: [
      {
        key: "population_size",
        label: "Tamaño de población",
        hint: "Individuos por generación",
        step: 1,
        min: 4,
      },
      {
        key: "init_random_frac",
        label: "Fracción aleatoria",
        hint: "π al azar, qᵢ entre 0 y el tope",
        step: 0.05,
        min: 0,
        max: 1,
      },
      {
        key: "init_priority_frac",
        label: "Fracción sesgada por prioridad",
        hint: "Piso mayor de qᵢ si p = 2 o 3",
        step: 0.05,
        min: 0,
        max: 1,
      },
      {
        key: "init_heuristic_frac",
        label: "Fracción heurística perturbada",
        hint: "Parte de la línea base",
        step: 0.05,
        min: 0,
        max: 1,
      },
    ],
  },
  {
    title: "Selección por torneo",
    concept: "k",
    kind: "torneo",
    text: "Entre k individuos al azar gana el de mayor fitness.",
    fields: [
      {
        key: "tournament_k",
        label: "Tamaño del torneo k",
        hint: "Mayor k, más presión selectiva",
        step: 1,
        min: 2,
        max: 20,
      },
    ],
  },
  {
    title: "Cruce OX y uniforme",
    concept: "p_c",
    kind: "cruce",
    text: "π se recombina con OX y q con cruce uniforme, en el mismo evento.",
    fields: [
      {
        key: "crossover_prob",
        label: "Probabilidad de cruce p_c",
        hint: "Por pareja de padres",
        step: 0.01,
        min: 0,
        max: 1,
      },
    ],
  },
  {
    title: "Mutación",
    concept: "p_π · p_q",
    kind: "mutacion",
    text: "π: intercambio o inversión. q: ±1 a ±paso lotes por gen.",
    fields: [
      {
        key: "perm_mutation_prob",
        label: "Mutación de π (por individuo)",
        hint: "Intercambio o inversión",
        step: 0.01,
        min: 0,
        max: 1,
      },
      {
        key: "qty_mutation_prob",
        label: "Mutación de q (por gen)",
        hint: "Probabilidad por centro",
        step: 0.01,
        min: 0,
        max: 1,
      },
      {
        key: "qty_mutation_max_step",
        label: "Paso máximo de q (lotes)",
        hint: "±1 … ±paso",
        step: 1,
        min: 1,
        max: 10,
      },
    ],
  },
  {
    title: "Reemplazo con elitismo",
    concept: "élite",
    kind: "elite",
    text: "Las mejores soluciones pasan intactas a la siguiente generación.",
    fields: [
      {
        key: "elite",
        label: "Individuos élite",
        hint: "Copias exactas por generación",
        step: 1,
        min: 0,
      },
    ],
  },
  {
    title: "Criterio de parada",
    concept: "G_max",
    kind: "parada",
    text: "Termina en el máximo de generaciones o tras varias sin mejora relevante.",
    fields: [
      {
        key: "max_generations",
        label: "Generaciones máximas",
        hint: "Límite superior",
        step: 1,
        min: 1,
      },
      {
        key: "stagnation_generations",
        label: "Estancamiento (generaciones)",
        hint: "Sin mejora ≥ tolerancia",
        step: 1,
        min: 1,
      },
      {
        key: "improvement_tolerance",
        label: "Tolerancia de mejora",
        hint: "En unidades de fitness",
        step: 0.000001,
        min: 0,
      },
    ],
  },
  {
    title: "Pesos de la función objetivo",
    concept: "J",
    kind: "pesos",
    text: "J = w_U·U + w_R·R + w_H·H. Deben sumar 1.",
    fields: [
      {
        key: "w_u",
        label: "w_U · demanda no cubierta",
        hint: "Peso de U",
        step: 0.05,
        min: 0,
        max: 1,
      },
      {
        key: "w_r",
        label: "w_R · distancia relativa",
        hint: "Peso de R",
        step: 0.05,
        min: 0,
        max: 1,
      },
      {
        key: "w_h",
        label: "w_H · prioridad alta sin entrega",
        hint: "Peso de H",
        step: 0.05,
        min: 0,
        max: 1,
      },
    ],
  },
];

function validate(
  params: GAParams,
  limits: { max_generations: number; max_population: number } | undefined,
): string[] {
  const problems: string[] = [];
  const fracs = params.init_random_frac + params.init_priority_frac + params.init_heuristic_frac;
  if (Math.abs(fracs - 1) > 1e-9)
    problems.push(`Las fracciones de población inicial suman ${num(fracs, 2)}; deben sumar 1.`);
  const weights = params.w_u + params.w_r + params.w_h;
  if (Math.abs(weights - 1) > 1e-9)
    problems.push(`Los pesos suman ${num(weights, 2)}; deben sumar 1.`);
  if (params.elite >= params.population_size)
    problems.push("El elitismo debe ser menor que el tamaño de la población.");
  if (params.tournament_k > params.population_size)
    problems.push("El torneo no puede ser mayor que la población.");
  if (limits && params.max_generations > limits.max_generations)
    problems.push(`El máximo permitido es ${limits.max_generations} generaciones.`);
  if (limits && params.population_size > limits.max_population)
    problems.push(`El máximo permitido es una población de ${limits.max_population}.`);
  for (const value of Object.values(params)) {
    if (!Number.isFinite(value)) {
      problems.push("Hay campos vacíos o no numéricos.");
      break;
    }
  }
  return problems;
}

export function ConfigPage() {
  const store = useStore();
  const { scenario, preset, effectiveParams, params, standard, seed, meta } = store;
  const navigate = useNavigate();
  const [baseline, setBaseline] = useState<BaselineResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = preset === "standard";
  const problems = validate(effectiveParams, meta?.limits);
  const seeds = meta?.official_seeds ?? [11, 22, 33, 44];

  const scenarioId = scenario?.scenario_id;
  const { w_u, w_r, w_h } = effectiveParams;
  useEffect(() => {
    setBaseline(null);
    if (!scenarioId || Math.abs(w_u + w_r + w_h - 1) > 1e-9) return;
    let cancelled = false;
    api
      .baseline(scenarioId, { w_u, w_r, w_h })
      .then((result) => {
        if (!cancelled) setBaseline(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [scenarioId, w_u, w_r, w_h]);

  async function start() {
    if (!scenario) return;
    setBusy(true);
    setError(null);
    try {
      const run = await api.startRun(scenario.scenario_id, seed, effectiveParams);
      store.setRunId(run.run_id);
      navigate("/ejecucion");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const p = effectiveParams;
  const canRun = !!scenario && !busy && problems.length === 0 && Number.isFinite(seed);

  return (
    <>
      <PageHead step="Paso 3 de 6" title="Configuración del algoritmo genético">
        Cada bloque corresponde a una etapa del AG. El preset estándar fija los valores del informe
        y es el que usan las cuatro corridas oficiales.
      </PageHead>

      {!scenario && (
        <Callout tone="warn" title="Primero active un escenario">
          El AG necesita inventario, demandas, flota, depósito y distancias validados.{" "}
          <Link to="/escenario">Ir a Escenario</Link>
        </Callout>
      )}

      <div className="config-layout">
        <div className="stack" style={{ "--gap": "1.25rem" } as React.CSSProperties}>
          <section className="card">
            <h2>Elija una semilla y ejecute</h2>
            <p className="small muted">
              La semilla fija el azar del algoritmo: con la misma semilla se obtiene siempre la
              misma corrida. Se usan los valores del informe (preset estándar); puede cambiarlos en
              los ajustes avanzados.
            </p>
            <div
              className="row"
              role="group"
              aria-label="Semillas oficiales"
              style={{ gap: "0.5rem" }}
            >
              {seeds.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`btn ${seed === value ? "primary" : ""}`}
                  aria-pressed={seed === value}
                  onClick={() => store.setSeed(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </section>

          <details className="advanced">
            <summary>
              Ajustes avanzados <span>{locked ? "Preset estándar" : "Modo experimental"}</span>
            </summary>
            <div
              className="advanced-body stack"
              style={{ "--gap": "1.25rem" } as React.CSSProperties}
            >
              <div className="card-title">
                <h3>Preset</h3>
                <div className="segmented" role="group" aria-label="Preset de parámetros">
                  <button
                    type="button"
                    aria-pressed={locked}
                    onClick={() => store.setPreset("standard")}
                  >
                    Estándar (bloqueado)
                  </button>
                  <button
                    type="button"
                    aria-pressed={!locked}
                    onClick={() => {
                      if (preset === "standard") store.setParams({ ...standard });
                      store.setPreset("experimental");
                    }}
                  >
                    Experimental
                  </button>
                </div>
              </div>
              <p className="small muted">
                {locked
                  ? "Valores bloqueados para que las cuatro corridas sean comparables."
                  : "Modo experimental: estas corridas no forman parte del experimento oficial."}
              </p>
              <Field label="Semilla evolutiva" hint="Cualquier número entero desde 0">
                {(props) => (
                  <input
                    {...props}
                    className="input mono"
                    style={{ width: "9rem" }}
                    type="number"
                    min={0}
                    step={1}
                    value={Number.isFinite(seed) ? seed : ""}
                    onChange={(e) =>
                      store.setSeed(
                        e.target.value === ""
                          ? Number.NaN
                          : Math.max(0, Math.floor(Number(e.target.value))),
                      )
                    }
                  />
                )}
              </Field>
              <ol className="stages">
                {STAGES.map((stage, index) => (
                  <li className="stage" key={stage.title}>
                    <span className="stage-n" aria-hidden="true">
                      {index + 1}
                    </span>
                    <section className="card">
                      <div className="card-title">
                        <h3>{stage.title}</h3>
                        <span className="mono muted small">{stage.concept}</span>
                      </div>
                      <p className="small muted">{stage.text}</p>
                      <OperatorExample kind={stage.kind} />
                      <div className="form-grid">
                        {stage.fields.map((field) => (
                          <Field key={field.key} label={field.label} hint={field.hint}>
                            {(props) => (
                              <input
                                {...props}
                                className="input mono"
                                type="number"
                                step={field.step}
                                min={field.min}
                                max={field.max}
                                disabled={locked}
                                value={Number.isFinite(p[field.key]) ? p[field.key] : ""}
                                onChange={(e) =>
                                  store.setParams({
                                    ...params,
                                    [field.key]:
                                      e.target.value === "" ? Number.NaN : Number(e.target.value),
                                  })
                                }
                              />
                            )}
                          </Field>
                        ))}
                      </div>
                    </section>
                  </li>
                ))}
              </ol>
            </div>
          </details>
        </div>

        <aside className="aside-sticky no-print" aria-label="Resumen de la corrida">
          <section className="card">
            <div className="card-title">
              <h2>Su corrida</h2>
              <span className="badge">{locked ? "Estándar" : "Experimental"}</span>
            </div>
            <dl className="summary-list">
              <dt>Semilla</dt>
              <dd>{Number.isFinite(seed) ? seed : "—"}</dd>
              <dt>Población</dt>
              <dd>{Number.isFinite(p.population_size) ? p.population_size : "—"}</dd>
              <dt>Generaciones</dt>
              <dd>≤ {Number.isFinite(p.max_generations) ? p.max_generations : "—"}</dd>
            </dl>
          </section>

          {baseline && scenario && (
            <section className="card">
              <div className="card-title">
                <h3>Línea base</h3>
                <span className="card-note">Define D_ref</span>
              </div>
              <dl className="summary-list">
                <dt>D_ref</dt>
                <dd>{km(baseline.d_ref_km)}</dd>
                <dt>J base</dt>
                <dd>{num(baseline.metrics.J, 5)}</dd>
                <dt>Entrega</dt>
                <dd>
                  {baseline.metrics.lots_delivered} / {baseline.metrics.lots_demanded} lotes
                </dd>
                <dt>Cobertura pond.</dt>
                <dd>{pct(baseline.metrics.weighted_coverage)}</dd>
              </dl>
              {baseline.d_ref_is_convention && (
                <p className="small muted">
                  D_ref es una convención: la línea base no tiene viajes.
                </p>
              )}
            </section>
          )}

          {problems.length > 0 && (
            <Callout tone="error" title="Parámetros inválidos">
              <ul className="plain">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Callout>
          )}
          {error && (
            <Callout tone="error" title="No se pudo iniciar la corrida">
              {error}
            </Callout>
          )}

          <div className="stack" style={{ "--gap": "0.6rem" } as React.CSSProperties}>
            <button type="button" className="btn primary" disabled={!canRun} onClick={start}>
              <Icon name="play" />{" "}
              {busy
                ? "Encolando…"
                : `Ejecutar AG con semilla ${Number.isFinite(seed) ? seed : "—"}`}
            </button>
            <Link className="btn" to="/cuatro-corridas">
              Ir a las cuatro corridas oficiales
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
