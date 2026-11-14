import type { Center, Issue, ScenarioPayload } from "../types";

export const EMPTY_DRAFT: ScenarioPayload = {
  scenario_id: null,
  label: "",
  data_origin: "declared",
  distance_mode: "haversine_demo",
  distance_source: null,
  depot: { id: "DEPOT", name: null, lat: null, lon: null },
  inventory_lots: null,
  vehicles: [{ id: "V01", capacity_lots: null }],
  centers: [],
  distances: [],
  data_license: null,
  notes: null,
  priority_criterion: null,
  demand_rule: null,
  fixture_seed: null,
};

const DRAFT_KEY = "nutriruta-ag.draft.v1";

export function loadDraft(): ScenarioPayload {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as ScenarioPayload) } : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveDraft(draft: ScenarioPayload): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* el borrador vive en memoria si no hay almacenamiento */
  }
}

const CENTER_KEYS: (keyof Center)[] = [
  "id",
  "name",
  "district",
  "address",
  "lat",
  "lon",
  "demand_lots",
  "priority_weight",
  "source",
  "demand_origin",
  "users_aggregate",
];

/** Conserva solo los campos del contrato: cualquier otro (p. ej. datos personales) se descarta. */
export function pickScenario(input: unknown): ScenarioPayload {
  const wrapper = (input ?? {}) as Record<string, unknown>;
  const raw = (
    wrapper.scenario && typeof wrapper.scenario === "object" ? wrapper.scenario : wrapper
  ) as Partial<ScenarioPayload>;
  if (!Array.isArray(raw.centers)) {
    throw new Error(
      "El archivo no parece un escenario de NutriRuta AG (falta la lista «centers»).",
    );
  }
  const centers = raw.centers.map((item) => {
    const source = item as unknown as Record<string, unknown>;
    const center: Record<string, unknown> = {};
    for (const key of CENTER_KEYS) if (key in source) center[key] = source[key];
    return {
      name: "",
      lat: null,
      lon: null,
      demand_lots: null,
      priority_weight: 1,
      source: "declared",
      ...center,
    } as Center;
  });
  return {
    ...EMPTY_DRAFT,
    scenario_id: raw.scenario_id ?? null,
    label: raw.label ?? "",
    data_origin: raw.data_origin ?? "declared",
    distance_mode: raw.distance_mode ?? "haversine_demo",
    distance_source: raw.distance_source ?? null,
    depot: { ...EMPTY_DRAFT.depot, ...(raw.depot ?? {}) },
    inventory_lots: raw.inventory_lots ?? null,
    vehicles: (raw.vehicles ?? []).map((v) => ({ id: v.id, capacity_lots: v.capacity_lots })),
    centers,
    distances: (raw.distances ?? []).map((d) => ({ from_id: d.from_id, to_id: d.to_id, km: d.km })),
    data_license: raw.data_license ?? null,
    notes: raw.notes ?? null,
    priority_criterion: raw.priority_criterion ?? null,
    demand_rule: raw.demand_rule ?? null,
    fixture_seed: raw.fixture_seed ?? null,
  };
}

/** Agrupa los errores por fila de centro a partir del campo `centers[k].…`. */
export function issuesByCenterRow(issues: Issue[]): Map<number, Issue[]> {
  const rows = new Map<number, Issue[]>();
  for (const issue of issues) {
    const match = /^centers\[(\d+)\]/.exec(issue.field ?? "");
    if (!match) continue;
    const index = Number(match[1]);
    rows.set(index, [...(rows.get(index) ?? []), issue]);
  }
  return rows;
}

export function nextId(prefix: string, existing: string[]): string {
  let n = existing.length + 1;
  const taken = new Set(existing);
  while (taken.has(`${prefix}${String(n).padStart(2, "0")}`)) n += 1;
  return `${prefix}${String(n).padStart(2, "0")}`;
}

/** Regla declarada de demanda: ceil(usuarios × raciones_por_usuario / raciones_por_lote). */
export function demandFromUsers(users: number, perUser: number, perLot: number): number {
  return Math.ceil((users * perUser) / perLot);
}
