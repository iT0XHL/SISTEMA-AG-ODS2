import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
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

const CARDS: { title: string; concept: string; text: ReactNode; fields: FieldDef[] }[] = [
  {
    title: "Población inicial",
    concept: "P(0)",
    text: "Mezcla de individuos aleatorios, sesgados por prioridad y derivados de la heurística perturbada. Todos se reparan y decodifican antes de evaluarse.",
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
        hint: "π al azar y qᵢ ~ U{0…tope}",
        step: 0.05,
        min: 0,
        max: 1,
      },
      {
        key: "init_priority_frac",
        label: "Fracción sesgada por prioridad",
        hint: "Piso de qᵢ mayor para p = 2 y p = 3",
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
    text: "Se extraen k individuos distintos al azar y gana el de mayor fitness. Con k = 3 la presión selectiva es moderada.",
    fields: [
      {
        key: "tournament_k",
        label: "Tamaño del torneo k",
        hint: "Mayor k = más presión selectiva",
        step: 1,
        min: 2,
        max: 20,
      },
    ],
  },
  {
    title: "Cruce: OX + uniforme",
    concept: "p_c",
    text: "En un mismo evento, π se recombina con Order Crossover (sin duplicar centros) y q con cruce uniforme gen por gen, indexado por centro.",
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
    concept: "p_π, p_q",
    text: "π: intercambio de dos centros o inversión de una subcadena. q: cada gen varía ±1…±paso lotes, saturado al dominio.",
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
    text: "Las mejores soluciones pasan intactas a la siguiente generación. No garantiza el óptimo global: evita perder lo mejor hallado.",
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
    text: "La evolución termina al alcanzar el máximo de generaciones o tras varias generaciones seguidas sin mejora relevante.",
    fields: [
      {
        key: "max_generations",
        label: "Generaciones máximas",
        hint: "Límite superior de la corrida",
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
    text: "J = w_U·U + w_R·R + w_H·H. Deben sumar 1. Son parámetros experimentales: otras ponderaciones producen rutas y repartos distintos.",
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
  const { scenario, preset, effectiveParams, params, docente, seed, meta } = store;
  const navigate = useNavigate();
  const [baseline, setBaseline] = useState<BaselineResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = preset === "docente";
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

  return (
    <>
      <PageHead step="Paso 3 de 6" title="Configuración del algoritmo genético">
        Cada tarjeta corresponde a un componente del AG. El preset «Docente» fija los valores del
        informe y es el que usan las cuatro corridas oficiales.
      </PageHead>

      {!scenario && (
        <Callout tone="warn" title="Primero active un escenario">
          El AG no se ejecuta sin inventario, demandas, flota, depósito y matriz validados.{" "}
          <Link to="/escenario">Ir a Escenario</Link>
        </Callout>
      )}

      <section className="card">
        <div className="card-title">
          <h2>Preset</h2>
          <div className="segmented" role="group" aria-label="Preset de parámetros">
            <button type="button" aria-pressed={locked} onClick={() => store.setPreset("docente")}>
              Docente (bloqueado)
            </button>
            <button
              type="button"
              aria-pressed={!locked}
              onClick={() => {
                if (preset === "docente") store.setParams({ ...docente });
                store.setPreset("experimental");
              }}
            >
              Experimental
            </button>
          </div>
        </div>
        <p className="prose small">
          {locked
            ? "Valores bloqueados: población 100, 200 generaciones, torneo 3, p_c 0,90, p_π 0,15, p_q 0,08, élite 2, estancamiento 35. No se modifican entre las cuatro corridas."
            : "Modo experimental: puede variar parámetros y pesos para explorar. Estas corridas no forman parte del experimento oficial de cuatro semillas."}
        </p>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <Field
            label="Semilla evolutiva"
            hint="Misma semilla + mismo escenario + mismos parámetros = misma corrida"
          >
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
          <div
            className="row"
            role="group"
            aria-label="Semillas oficiales"
            style={{ gap: "0.4rem" }}
          >
            {seeds.map((value) => (
              <button
                key={value}
                type="button"
                className={`btn small ${seed === value ? "primary" : ""}`}
                aria-pressed={seed === value}
                onClick={() => store.setSeed(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="cols">
        {CARDS.map((card) => (
          <section className="card" key={card.title}>
            <div className="card-title">
              <h3>{card.title}</h3>
              <span className="mono muted small">{card.concept}</span>
            </div>
            <p className="small muted">{card.text}</p>
            <div className="form-grid">
              {card.fields.map((field) => (
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
                      value={
                        Number.isFinite(effectiveParams[field.key])
                          ? effectiveParams[field.key]
                          : ""
                      }
                      onChange={(e) =>
                        store.setParams({
                          ...params,
                          [field.key]: e.target.value === "" ? Number.NaN : Number(e.target.value),
                        })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
          </section>
        ))}
      </div>

      {baseline && scenario && (
        <section className="card">
          <div className="card-title">
            <h2>Línea base del escenario</h2>
            <span className="card-note">Referencia determinista para comparar; define D_ref</span>
          </div>
          <p className="small muted">{baseline.method}</p>
          <dl className="io-list">
            <dt>D_ref</dt>
            <dd>
              {km(baseline.d_ref_km)}
              {baseline.d_ref_is_convention &&
                " (convención de normalización: la línea base no tiene viajes)"}
            </dd>
            <dt>J base</dt>
            <dd className="mono">{num(baseline.metrics.J, 5)}</dd>
            <dt>Entrega</dt>
            <dd>
              {baseline.metrics.lots_delivered} de {baseline.metrics.lots_demanded} lotes ·
              cobertura ponderada {pct(baseline.metrics.weighted_coverage)}
            </dd>
          </dl>
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

      <div className="row no-print">
        <button
          type="button"
          className="btn primary"
          disabled={!scenario || busy || problems.length > 0 || !Number.isFinite(seed)}
          onClick={start}
        >
          <Icon name="play" />{" "}
          {busy ? "Encolando…" : `Ejecutar AG con semilla ${Number.isFinite(seed) ? seed : "—"}`}
        </button>
        <Link className="btn" to="/cuatro-corridas">
          Ir a las cuatro corridas oficiales
        </Link>
      </div>
    </>
  );
}
