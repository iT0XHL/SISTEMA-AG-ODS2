import type { Assignment, Experiment, Solution } from "../types";
import { num, pct } from "./format";

export interface PriorityRow {
  priority: 1 | 2 | 3;
  label: string;
  centers: number;
  complete: number;
  partial: number;
  none: number;
  delivered: number;
  demanded: number;
}

export interface CenterNote {
  id: string;
  priority: number;
  tone: "none" | "partial";
  text: string;
}

export interface Explanation {
  headline: string;
  facts: string[];
  priorities: PriorityRow[];
  prioritySentence: string;
  gains: string[];
  losses: string[];
  weights: string;
  notes: CenterNote[];
  reliability: string;
}

const PRIORITY_LABEL: Record<number, string> = { 3: "Alta (3)", 2: "Media (2)", 1: "Baja (1)" };

function status(row: Assignment): "none" | "partial" | "complete" {
  if (row.assigned_lots === 0) return "none";
  return row.pending_lots === 0 ? "complete" : "partial";
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function explainSolution(solution: Solution): Explanation {
  const m = solution.metrics;
  const b = solution.baseline.metrics;
  const params = solution.parameters;
  const routes = new Map(solution.routes.map((route) => [route.vehicle_id, route]));

  const headline = `Entregó ${m.lots_delivered} de los ${m.inventory_lots} lotes disponibles a ${m.centers_served} de ${m.centers_with_demand} centros, con ${plural(m.vehicles_used, "vehículo", "vehículos")}.`;

  const facts: string[] = [];
  if (m.lots_demanded > m.inventory_lots) {
    facts.push(
      `Los centros piden ${m.lots_demanded} lotes y el depósito tiene ${m.inventory_lots}: faltan al menos ${m.lots_demanded - m.inventory_lots} aunque se reparta todo.`,
    );
  }
  facts.push(
    "Cada vehículo sale del depósito, visita sus centros en un solo recorrido y vuelve al depósito.",
  );
  if (m.inventory_remaining > 0) {
    facts.push(`Quedaron ${m.inventory_remaining} lotes sin repartir en el depósito.`);
  }

  const priorities: PriorityRow[] = ([3, 2, 1] as const)
    .map((priority) => {
      const rows = solution.assignments.filter((row) => row.priority_weight === priority);
      return {
        priority,
        label: PRIORITY_LABEL[priority],
        centers: rows.length,
        complete: rows.filter((row) => status(row) === "complete").length,
        partial: rows.filter((row) => status(row) === "partial").length,
        none: rows.filter((row) => status(row) === "none").length,
        delivered: rows.reduce((sum, row) => sum + row.assigned_lots, 0),
        demanded: rows.reduce((sum, row) => sum + row.demand_lots, 0),
      };
    })
    .filter((row) => row.centers > 0);

  const high = priorities.find((row) => row.priority === 3);
  let prioritySentence = "";
  if (high) {
    prioritySentence =
      high.complete === high.centers
        ? `Los ${plural(high.centers, "centro", "centros")} de prioridad alta recibieron su demanda completa.`
        : `De ${plural(high.centers, "centro", "centros")} de prioridad alta, ${high.complete} recibieron su demanda completa, ${high.partial} parcial y ${high.none} nada.`;
  }

  const gains: string[] = [];
  const losses: string[] = [];
  const kmDiff = m.total_km - b.total_km;
  if (Math.abs(kmDiff) >= 0.005 && b.total_km > 0) {
    const text = `${num(Math.abs(kmDiff), 2)} km ${kmDiff < 0 ? "menos" : "más"} de recorrido (${num(Math.abs(kmDiff / b.total_km) * 100, 1)} %)`;
    (kmDiff < 0 ? gains : losses).push(text);
  }
  const lotsDiff = m.lots_delivered - b.lots_delivered;
  if (lotsDiff !== 0) {
    const text = `${Math.abs(lotsDiff)} ${Math.abs(lotsDiff) === 1 ? "lote" : "lotes"} ${lotsDiff > 0 ? "más" : "menos"} entregados`;
    (lotsDiff > 0 ? gains : losses).push(text);
  }
  const coverageDiff = (m.weighted_coverage - b.weighted_coverage) * 100;
  if (Math.abs(coverageDiff) >= 0.05) {
    const text = `${num(Math.abs(coverageDiff), 1)} puntos ${coverageDiff > 0 ? "más" : "menos"} de cobertura ponderada (${pct(m.weighted_coverage)} frente a ${pct(b.weighted_coverage)})`;
    (coverageDiff > 0 ? gains : losses).push(text);
  }
  const highDiff = m.high_priority_unserved - b.high_priority_unserved;
  if (highDiff !== 0) {
    const text = `${Math.abs(highDiff)} ${Math.abs(highDiff) === 1 ? "centro" : "centros"} de prioridad alta ${highDiff < 0 ? "menos" : "más"} sin entrega`;
    (highDiff < 0 ? gains : losses).push(text);
  }

  const weights = `La evaluación pesa ${num(params.w_u * 100, 0)} % la demanda sin cubrir, ${num(params.w_r * 100, 0)} % la distancia y ${num(params.w_h * 100, 0)} % los centros de prioridad alta sin entrega. Con otros pesos el resultado cambiaría.`;

  const shortage = m.lots_demanded > m.inventory_lots;
  const notes: CenterNote[] = solution.assignments
    .filter((row) => row.pending_lots > 0)
    .sort(
      (a, b2) => b2.priority_weight - a.priority_weight || a.center_id.localeCompare(b2.center_id),
    )
    .map((row) => {
      if (status(row) === "none") {
        const why =
          row.priority_weight === 1 && shortage
            ? "Tiene prioridad baja y el inventario no alcanza para todos."
            : shortage
              ? "El inventario y los vehículos se destinaron a otros centros."
              : "No entró en ninguna ruta.";
        return {
          id: row.center_id,
          priority: row.priority_weight,
          tone: "none" as const,
          text: `Sin entrega (pedía ${row.demand_lots}). ${why}`,
        };
      }
      const route = row.vehicle_id ? routes.get(row.vehicle_id) : undefined;
      const full = route && route.load_lots >= route.capacity_lots;
      const cause = row.partial_only
        ? "su demanda supera la capacidad de un vehículo"
        : full
          ? `el vehículo ${route?.vehicle_id} va lleno (${route?.load_lots}/${route?.capacity_lots})`
          : "se prefirió repartir el inventario entre más centros";
      return {
        id: row.center_id,
        priority: row.priority_weight,
        tone: "partial" as const,
        text: `Entrega parcial: ${row.assigned_lots} de ${row.demand_lots} lotes, porque ${cause}.`,
      };
    });

  const generations = m.generations_run ?? 0;
  const reliability =
    m.stop_reason === "stagnation"
      ? `El algoritmo se detuvo tras ${generations} generaciones porque las últimas ${params.stagnation_generations} no mejoraron el resultado. No se puede asegurar que sea la mejor solución posible: otra semilla puede dar un reparto distinto.`
      : `El algoritmo llegó al máximo de ${params.max_generations} generaciones. No se puede asegurar que sea la mejor solución posible: otra semilla puede dar un reparto distinto.`;

  return {
    headline,
    facts,
    priorities,
    prioritySentence,
    gains,
    losses,
    weights,
    notes,
    reliability,
  };
}

export function explainExperiment(experiment: Experiment): string[] {
  const done = experiment.runs.filter((run) => run.metrics);
  const base = experiment.baseline.metrics;
  const summary = experiment.summary;
  if (done.length === 0 || !summary) return [];
  const lines: string[] = [];

  const better = summary.runs_better_than_baseline;
  lines.push(
    `${better} de ${done.length} corridas obtuvieron un puntaje J menor que la línea base (${num(summary.J.mean, 5)} de media frente a ${num(base.J, 5)}).`,
  );

  const best = [...done].sort((a, b) => a.metrics!.J - b.metrics!.J)[0];
  lines.push(
    `La mejor es la semilla ${best.seed} (J = ${num(best.metrics!.J, 5)}). Las demás quedan muy cerca: la desviación estándar de J es ${num(summary.J.std, 5)}, así que el método es estable en este escenario.`,
  );

  const kms = done.map((run) => run.metrics!.total_km);
  const kmLow = Math.min(...kms);
  const kmHigh = Math.max(...kms);
  const covLow = Math.min(...done.map((run) => run.metrics!.weighted_coverage));
  const covHigh = Math.max(...done.map((run) => run.metrics!.weighted_coverage));
  lines.push(
    `Todas recorren entre ${num(kmLow, 2)} y ${num(kmHigh, 2)} km frente a ${num(base.total_km, 2)} km de la línea base, y su cobertura ponderada va de ${pct(covLow)} a ${pct(covHigh)} (la línea base cubre ${pct(base.weighted_coverage)}): ahorran distancia a cambio de dejar un poco más de demanda sin cubrir.`,
  );

  if (summary.all_feasible) {
    lines.push("Las soluciones cumplen inventario, capacidad de los vehículos y visitas únicas.");
  } else {
    lines.push("Atención: alguna solución no superó la validación de restricciones.");
  }
  lines.push(
    "Cuatro semillas sobre un único escenario describen el comportamiento del método; no bastan para asegurar que ocurra lo mismo con otros datos.",
  );
  return lines;
}
