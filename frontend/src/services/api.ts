import type {
  AuthUser,
  BaselineResult,
  Center,
  DemandRule,
  Experiment,
  GAParams,
  GenerationPoint,
  ImportPreview,
  ImportReport,
  Issue,
  MatrixImport,
  Meta,
  Provenance,
  RunState,
  ScenarioDetail,
  ScenarioPayload,
  ScenarioSummary,
  Solution,
  ValidationReport,
} from "../types";
import { clearToken, getToken, setToken } from "./session";

// VITE_API_URL solo se define al publicar el frontend aparte de la API (Amplify); vacío = mismo origen.
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const BASE = `${API_ORIGIN}/api/v1`;

export const UNAUTHORIZED_EVENT = "nutriruta:unauthorized";

export class ApiError extends Error {
  status: number;
  code: string;
  field: string | null;
  details: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    field: string | null,
    details: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const headers = new Headers(init?.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "No se pudo conectar con el servidor. Compruebe que los contenedores estén en ejecución.",
      null,
      null,
    );
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (response.status === 401 && !path.includes("/auth/")) {
    clearToken();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!response.ok) {
    const error = (body ?? {}) as Partial<{
      code: string;
      message: string;
      field: string | null;
      details: unknown;
    }>;
    throw new ApiError(
      response.status,
      error.code ?? "HTTP_ERROR",
      error.message ?? `El servidor respondió con el estado ${response.status}.`,
      error.field ?? null,
      error.details ?? null,
    );
  }
  return body as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function upload<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return request<T>(path, { method: "POST", body: form });
}

const id = encodeURIComponent;

export interface CreatedScenario {
  id: string;
  hash: string;
  created: boolean;
  provenance: Provenance;
  warnings: Issue[];
}

export const api = {
  meta: () => request<Meta>(`${BASE}/meta`),

  me: () => request<{ user: AuthUser }>(`${BASE}/auth/me`),
  login: async (username: string, password: string) => {
    const result = await post<{ user: AuthUser; token?: string }>(`${BASE}/auth/login`, {
      username,
      password,
    });
    if (result.token) setToken(result.token);
    return { user: result.user };
  },
  logout: async () => {
    try {
      await request<void>(`${BASE}/auth/logout`, { method: "POST" });
    } finally {
      clearToken();
    }
  },

  demoScenario: (n_centers = 18, fixture_seed = 2026) =>
    post<ScenarioPayload>(`${BASE}/scenarios/demo`, { n_centers, fixture_seed }),
  validateScenario: (scenario: ScenarioPayload) =>
    post<ValidationReport>(`${BASE}/scenarios/validate`, scenario),
  createScenario: (scenario: ScenarioPayload) =>
    post<CreatedScenario>(`${BASE}/scenarios`, scenario),
  listScenarios: () => request<ScenarioSummary[]>(`${BASE}/scenarios`),
  getScenario: (scenarioId: string) =>
    request<ScenarioDetail>(`${BASE}/scenarios/${id(scenarioId)}`),
  deleteScenario: (scenarioId: string) =>
    request<void>(`${BASE}/scenarios/${id(scenarioId)}`, { method: "DELETE" }),

  previewPadron: (file: File) => upload<ImportPreview>(`${BASE}/imports/padron/preview`, file),
  normalizePadron: (file: File, mapping: Record<string, string>, rule: DemandRule | null) =>
    upload<{ centers: Center[]; report: ImportReport }>(`${BASE}/imports/padron/normalize`, file, {
      mapping: JSON.stringify(mapping),
      ...(rule ? { demand_rule: JSON.stringify(rule) } : {}),
    }),
  importMatrix: (file: File) => upload<MatrixImport>(`${BASE}/imports/matrix`, file),

  baseline: (scenarioId: string, weights?: Pick<GAParams, "w_u" | "w_r" | "w_h">) =>
    post<BaselineResult & { scenario_id: string; scenario_hash: string }>(`${BASE}/baselines`, {
      scenario_id: scenarioId,
      ...(weights ? { weights } : {}),
    }),

  startRun: (scenarioId: string, seed: number, parameters: GAParams) =>
    post<{ run_id: string; status: string }>(`${BASE}/runs`, {
      scenario_id: scenarioId,
      seed,
      parameters,
    }),
  listRuns: (scenarioId: string) =>
    request<RunState[]>(`${BASE}/runs?scenario_id=${id(scenarioId)}&limit=30`),
  getRun: (runId: string) => request<RunState>(`${BASE}/runs/${id(runId)}`),
  cancelRun: (runId: string) => post<RunState>(`${BASE}/runs/${id(runId)}/cancel`),
  getSolution: (runId: string) => request<Solution>(`${BASE}/runs/${id(runId)}/solution`),
  getHistory: (runId: string, since = 0) =>
    request<{ generations: GenerationPoint[] }>(`${BASE}/runs/${id(runId)}/history?since=${since}`),
  runExportUrl: (runId: string, format: "csv" | "json") =>
    `${BASE}/runs/${id(runId)}/export?format=${format}`,

  startFourRuns: (scenarioId: string) =>
    post<{ experiment_id: string }>(`${BASE}/experiments/four-runs`, { scenario_id: scenarioId }),
  listExperiments: (scenarioId: string) =>
    request<{ experiment_id: string; created_at: string; statuses: string[] }[]>(
      `${BASE}/experiments?scenario_id=${id(scenarioId)}`,
    ),
  getExperiment: (experimentId: string) =>
    request<Experiment>(`${BASE}/experiments/${id(experimentId)}`),
  experimentExportUrl: (experimentId: string, format: "csv" | "json") =>
    `${BASE}/experiments/${id(experimentId)}/export?format=${format}`,
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}
