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
    /* sin sessionStorage */
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

export function demandFromUsers(users: number, perUser: number, perLot: number): number {
  return Math.ceil((users * perUser) / perLot);
}

export interface StepStatus {
  done: boolean;
  missing: string | null;
}

export function stepStatus(
  draft: ScenarioPayload,
  validated: boolean,
  minCenters = 5,
): StepStatus[] {
  const geo = draft.distance_mode === "haversine_demo";
  const centers = draft.centers;
  const first: string[] = [];
  if (centers.length < minCenters) {
    first.push(
      centers.length === 0 ? "aún no hay centros" : `faltan ${minCenters - centers.length} centros`,
    );
  }
  const noDemand = centers.filter((c) => c.demand_lots == null).length;
  if (noDemand) first.push(`${noDemand} sin demanda`);
  if (geo) {
    const noCoords = centers.filter((c) => c.lat == null || c.lon == null).length;
    if (noCoords) first.push(`${noCoords} sin coordenadas`);
  }

  const second: string[] = [];
  if (geo && (draft.depot.lat == null || draft.depot.lon == null)) {
    second.push("coordenadas del depósito");
  }
  if (draft.vehicles.length === 0) second.push("ningún vehículo");
  else {
    const noCapacity = draft.vehicles.filter(
      (v) => !v.capacity_lots || v.capacity_lots <= 0,
    ).length;
    if (noCapacity) second.push(`${noCapacity} vehículos sin capacidad`);
  }

  const third: string[] = [];
  if (!draft.inventory_lots || draft.inventory_lots <= 0) third.push("el inventario");

  const fourth: string[] = [];
  if (!draft.label.trim()) fourth.push("el nombre");
  if (!validated) fourth.push("validar");

  return [first, second, third, fourth].map((missing) => ({
    done: missing.length === 0,
    missing: missing.length ? missing.join(", ") : null,
  }));
}
