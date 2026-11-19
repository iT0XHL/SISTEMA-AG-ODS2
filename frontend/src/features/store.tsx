import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, api } from "../services/api";
import type { GAParams, Meta, ScenarioDetail } from "../types";

export type Preset = "standard" | "experimental";
export type Theme = "system" | "light" | "dark";

export const STANDARD_FALLBACK: GAParams = {
  population_size: 100,
  max_generations: 200,
  tournament_k: 3,
  crossover_prob: 0.9,
  perm_mutation_prob: 0.15,
  qty_mutation_prob: 0.08,
  qty_mutation_max_step: 3,
  elite: 2,
  stagnation_generations: 35,
  improvement_tolerance: 1e-6,
  init_random_frac: 0.7,
  init_priority_frac: 0.2,
  init_heuristic_frac: 0.1,
  w_u: 0.75,
  w_r: 0.2,
  w_h: 0.05,
};

interface Persisted {
  scenarioId: string | null;
  runId: string | null;
  experimentId: string | null;
  preset: Preset;
  params: GAParams;
  seed: number;
  theme: Theme;
}

const STORAGE_KEY = "nutriruta-ag.v1";

const DEFAULTS: Persisted = {
  scenarioId: null,
  runId: null,
  experimentId: null,
  preset: "standard",
  params: STANDARD_FALLBACK,
  seed: 11,
  theme: "system",
};

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<Persisted>;
    const preset: Preset = saved.preset === "experimental" ? "experimental" : "standard";
    return { ...DEFAULTS, ...saved, preset };
  } catch {
    return DEFAULTS;
  }
}

interface Store extends Persisted {
  meta: Meta | null;
  metaError: string | null;
  standard: GAParams;
  scenario: ScenarioDetail | null;
  scenarioLoading: boolean;
  effectiveParams: GAParams;
  selectScenario: (id: string | null) => void;
  reloadScenario: () => void;
  setRunId: (id: string | null) => void;
  setExperimentId: (id: string | null) => void;
  setPreset: (preset: Preset) => void;
  setParams: (params: GAParams) => void;
  setSeed: (seed: number) => void;
  setTheme: (theme: Theme) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ScenarioDetail | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const patch = useCallback((changes: Partial<Persisted>) => {
    setState((previous) => ({ ...previous, ...changes }));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* sin localStorage */
    }
  }, [state]);

  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", state.theme);
  }, [state.theme]);

  useEffect(() => {
    api
      .meta()
      .then((value) => {
        setMeta(value);
        setMetaError(null);
      })
      .catch((error: unknown) =>
        setMetaError(error instanceof Error ? error.message : "Servidor no disponible"),
      );
  }, []);

  useEffect(() => {
    if (!state.scenarioId) {
      setScenario(null);
      return;
    }
    let cancelled = false;
    setScenarioLoading(true);
    api
      .getScenario(state.scenarioId)
      .then((detail) => {
        if (!cancelled) setScenario(detail);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setScenario(null);
        if (error instanceof ApiError && error.status === 404) {
          patch({ scenarioId: null, runId: null, experimentId: null });
        }
      })
      .finally(() => {
        if (!cancelled) setScenarioLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.scenarioId, reloadToken, patch]);

  const value = useMemo<Store>(() => {
    const standard = meta?.standard_preset ?? STANDARD_FALLBACK;
    return {
      ...state,
      meta,
      metaError,
      standard,
      scenario,
      scenarioLoading,
      effectiveParams: state.preset === "standard" ? standard : state.params,
      selectScenario: (id) =>
        setState((previous) =>
          previous.scenarioId === id
            ? previous
            : { ...previous, scenarioId: id, runId: null, experimentId: null },
        ),
      reloadScenario: () => setReloadToken((token) => token + 1),
      setRunId: (id) => patch({ runId: id }),
      setExperimentId: (id) => patch({ experimentId: id }),
      setPreset: (preset) => patch({ preset }),
      setParams: (params) => patch({ params }),
      setSeed: (seed) => patch({ seed }),
      setTheme: (theme) => patch({ theme }),
    };
  }, [state, meta, metaError, scenario, scenarioLoading, patch]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore debe usarse dentro de <StoreProvider>");
  return store;
}
