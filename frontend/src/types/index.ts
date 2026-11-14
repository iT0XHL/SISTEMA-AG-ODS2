// Contratos de la API de NutriRuta AG (ver docs/api.md).

export type DataOrigin = "synthetic" | "official" | "declared" | "mixed";
export type CenterSource = "synthetic" | "official" | "declared";
export type DemandOrigin = "synthetic" | "declared" | "inferred";
export type DistanceMode = "haversine_demo" | "road_matrix";
export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Depot {
  id: string;
  name?: string | null;
  lat: number | null;
  lon: number | null;
}

export interface Vehicle {
  id: string;
  capacity_lots: number | null;
}

export interface Center {
  id: string;
  name: string;
  district?: string | null;
  address?: string | null;
  lat: number | null;
  lon: number | null;
  demand_lots: number | null;
  priority_weight: number | null;
  source: CenterSource;
  demand_origin?: DemandOrigin | null;
  users_aggregate?: number | null;
}

export interface DistanceEntry {
  from_id: string;
  to_id: string;
  km: number | null;
}

export interface DemandRule {
  rations_per_user: number;
  rations_per_lot: number;
}

export interface ScenarioPayload {
  scenario_id?: string | null;
  label: string;
  data_origin: DataOrigin;
  distance_mode: DistanceMode;
  distance_source?: string | null;
  depot: Depot;
  inventory_lots: number | null;
  vehicles: Vehicle[];
  centers: Center[];
  distances: DistanceEntry[];
  data_license?: string | null;
  notes?: string | null;
  priority_criterion?: string | null;
  demand_rule?: DemandRule | null;
  fixture_seed?: number | null;
}

export interface Issue {
  code: string;
  message: string;
  field: string | null;
  details?: Record<string, unknown>;
}

export interface ScarcityFlag {
  active: boolean;
  total_demand: number;
  inventory_lots: number;
  fleet_capacity: number;
  max_deliverable: number;
  min_unmet_lots: number;
}

export interface ValidationReport {
  valid: boolean;
  errors: Issue[];
  warnings: Issue[];
  flags: { structural_scarcity: ScarcityFlag | null; partial_only_centers: string[] };
  summary: {
    n_centers: number;
    n_vehicles: number;
    distance_mode: DistanceMode;
    distance_mode_label: string | null;
    matrix: { entries: number; symmetric: boolean | null };
    total_demand?: number;
    weighted_demand?: number;
    inventory_lots?: number;
    fleet_capacity?: number;
    max_vehicle_capacity?: number;
  };
  hash: string | null;
}

export interface Provenance {
  data_origin: DataOrigin;
  badge: string;
  note: string | null;
  centers_by_source: Record<string, number>;
  centers_by_demand_origin: Record<string, number>;
  distance_mode: DistanceMode;
  distance_source: string | null;
  data_license: string | null;
  fixture_seed: number | null;
  priority_criterion: string | null;
  demand_rule: DemandRule | null;
}

export interface ScenarioSummary {
  scenario_id: string;
  label: string;
  data_origin: DataOrigin;
  distance_mode: DistanceMode;
  hash: string;
  version: string;
  created_at: string;
  n_centers: number;
  n_vehicles: number;
  inventory_lots: number;
  total_demand: number;
  runs: number;
}

export interface ScenarioDetail extends ScenarioSummary {
  scenario: ScenarioPayload;
  provenance: Provenance;
  warnings: Issue[];
  flags: ValidationReport["flags"];
  validation_summary: ValidationReport["summary"];
}

export interface GAParams {
  population_size: number;
  max_generations: number;
  tournament_k: number;
  crossover_prob: number;
  perm_mutation_prob: number;
  qty_mutation_prob: number;
  qty_mutation_max_step: number;
  elite: number;
  stagnation_generations: number;
  improvement_tolerance: number;
  init_random_frac: number;
  init_priority_frac: number;
  init_heuristic_frac: number;
  w_u: number;
  w_r: number;
  w_h: number;
}

export interface Meta {
  app: string;
  version: string;
  code_version: string;
  declaration: string;
  limits: {
    min_centers: number;
    max_centers: number;
    max_vehicles: number;
    max_generations: number;
    max_population: number;
    max_upload_mb: number;
    max_run_seconds: number;
  };
  docente_preset: GAParams;
  official_seeds: number[];
  distance_modes: Record<DistanceMode, string>;
  import_allowed_fields: Record<string, string>;
  routing_engine_installed: boolean;
}

export interface GenerationPoint {
  number: number;
  best_fitness: number;
  mean_fitness: number;
  best_J: number;
  diversity: number;
}

export interface RunState {
  run_id: string;
  scenario_id: string;
  experiment_id: string | null;
  seed: number;
  status: RunStatus;
  progress: { generation: number; max_generations: number; fraction: number };
  latest: (Omit<GenerationPoint, "number"> & { generation: number }) | null;
  parameters: GAParams;
  created_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  code_version: string;
  scenario_hash: string;
  stop_reason: string | null;
  cancel_requested: boolean;
  error: { code: string; message: string } | null;
}

export interface Metrics {
  J: number;
  fitness: number;
  U: number;
  R: number;
  H: number;
  lots_delivered: number;
  lots_demanded: number;
  lots_pending: number;
  inventory_lots: number;
  inventory_remaining: number;
  weighted_demand_total: number;
  weighted_demand_delivered: number;
  weighted_coverage: number;
  centers_total: number;
  centers_with_demand: number;
  centers_served: number;
  centers_fully_served: number;
  centers_served_pct: number;
  high_priority_total: number;
  high_priority_unserved: number;
  vehicles_used: number;
  vehicles_total: number;
  total_km: number;
  d_ref_km: number;
  distance_mode: DistanceMode;
  distance_mode_label: string;
  vehicle_loads: Record<string, number>;
  cpu_seconds?: number;
  wall_seconds?: number;
  generations_run?: number;
  evaluations?: number;
  stop_reason?: string;
  repair_totals_all_evaluations?: Record<string, number>;
  individuals_repaired?: number;
  initial_best_fitness?: number;
  final_diversity?: number;
}

export interface RouteStop {
  order: number;
  center_id: string;
  lots: number;
}

export interface Route {
  vehicle_id: string;
  capacity_lots: number;
  load_lots: number;
  km: number;
  used: boolean;
  path: string[];
  stops: RouteStop[];
}

export interface Assignment {
  center_id: string;
  priority_weight: number;
  demand_lots: number;
  assigned_lots: number;
  pending_lots: number;
  vehicle_id: string | null;
  stop_order: number | null;
  partial_only: boolean;
}

export interface Chromosome {
  pi: string[];
  q: Record<string, number>;
}

export interface ValidationCheck {
  id: string;
  description: string;
  ok: boolean;
  detail: string;
}

export interface SolutionValidation {
  feasible: boolean;
  checks: ValidationCheck[];
}

export interface RepairInfo {
  total_lots_removed: number;
  by_reason: Record<string, { center_id: string; lots: number }[]>;
}

export interface BaselineResult {
  method: string;
  d_ref_km: number;
  d_ref_is_convention: boolean;
  d_ref_note: string | null;
  metrics: Metrics;
  routes: Route[];
  assignments: Assignment[];
  chromosome: Chromosome;
  validation: SolutionValidation;
}

export interface Solution {
  run_id: string;
  seed: number;
  scenario_id: string;
  scenario_hash: string;
  code_version: string;
  label: string;
  parameters: GAParams;
  started_at: string | null;
  ended_at: string | null;
  chromosome: Chromosome;
  routes: Route[];
  assignments: Assignment[];
  metrics: Metrics;
  validation: SolutionValidation;
  repair: RepairInfo;
  baseline: BaselineResult;
  comparison: {
    same_instance: boolean;
    d_ref_km: number;
    delta_J: number;
    delta_km: number;
    delta_lots_delivered: number;
    delta_weighted_coverage: number;
    ga_better_than_baseline: boolean;
  };
}

export interface ExperimentRow {
  corrida: number;
  seed: number;
  run_id: string;
  status: RunStatus;
  progress_generation: number;
  stop_reason: string | null;
  started_at: string | null;
  ended_at: string | null;
  error: { code: string; message: string } | null;
  metrics:
    | (Pick<
        Metrics,
        | "J"
        | "fitness"
        | "U"
        | "R"
        | "H"
        | "lots_delivered"
        | "lots_demanded"
        | "weighted_coverage"
        | "total_km"
        | "vehicles_used"
        | "centers_served"
        | "high_priority_unserved"
        | "distance_mode"
        | "distance_mode_label"
      > & { cpu_seconds: number; generations_run: number })
    | null;
  feasible: boolean | null;
}

export interface MeanStd {
  mean: number | null;
  std: number | null;
}

export interface Experiment {
  experiment_id: string;
  scenario_id: string;
  scenario_label: string;
  scenario_hash: string;
  data_origin: DataOrigin;
  seeds: number[];
  parameters: GAParams;
  code_version: string;
  created_at: string;
  status: "running" | "completed" | "failed";
  runs: ExperimentRow[];
  baseline: {
    method: string;
    d_ref_km: number;
    d_ref_is_convention: boolean;
    metrics: Metrics;
    feasible: boolean;
  };
  summary:
    | (Record<
        | "J"
        | "fitness"
        | "U"
        | "R"
        | "H"
        | "weighted_coverage"
        | "total_km"
        | "lots_delivered"
        | "cpu_seconds"
        | "generations_run",
        MeanStd
      > & { std_note: string; runs_better_than_baseline: number; all_feasible: boolean })
    | null;
}

export interface ImportColumn {
  name: string;
  pii: boolean;
  pii_category: string | null;
  suggested_field: string | null;
  action: "map" | "discard" | "discard_pii";
}

export interface ImportPreview {
  filename: string;
  row_count: number;
  columns: ImportColumn[];
  allowed_fields: Record<string, string>;
  sample: Record<string, string>[];
  sample_note: string;
}

export interface ImportReport {
  rows_total: number;
  accepted: number;
  duplicates: number;
  inactive_ignored: number;
  rejected: { row: number; reason: string }[];
  row_warnings: { row: number; center_id: string; warning: string }[];
  mapped_columns: { field: string; label: string; column: string }[];
  discarded_columns: { name: string; pii: boolean; pii_category: string | null }[];
  pii_removed: string[];
  source_nature: string;
  priority_note: string;
  demand_rule: DemandRule | null;
}

export interface MatrixImport {
  filename: string;
  format: "long" | "square";
  ids: string[];
  entries: DistanceEntry[];
  count: number;
  note: string;
}
