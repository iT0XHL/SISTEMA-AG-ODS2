import { describe, expect, it } from "vitest";
import type { Solution } from "../types";
import { explainSolution } from "../utils/explain";

function solution(overrides: Record<string, unknown> = {}): Solution {
  const base = {
    parameters: {
      w_u: 0.75,
      w_r: 0.2,
      w_h: 0.05,
      stagnation_generations: 35,
      max_generations: 200,
    },
    metrics: {
      lots_delivered: 130,
      lots_demanded: 181,
      inventory_lots: 135,
      inventory_remaining: 5,
      centers_served: 2,
      centers_with_demand: 3,
      vehicles_used: 1,
      total_km: 58.04,
      weighted_coverage: 0.8424,
      high_priority_unserved: 0,
      generations_run: 123,
      stop_reason: "stagnation",
    },
    baseline: {
      metrics: {
        total_km: 80.29,
        lots_delivered: 135,
        weighted_coverage: 0.8606,
        high_priority_unserved: 0,
      },
    },
    routes: [{ vehicle_id: "V01", load_lots: 50, capacity_lots: 50 }],
    assignments: [
      {
        center_id: "C01",
        priority_weight: 3,
        demand_lots: 10,
        assigned_lots: 10,
        pending_lots: 0,
        vehicle_id: "V01",
        partial_only: false,
      },
      {
        center_id: "C02",
        priority_weight: 2,
        demand_lots: 9,
        assigned_lots: 8,
        pending_lots: 1,
        vehicle_id: "V01",
        partial_only: false,
      },
      {
        center_id: "C03",
        priority_weight: 1,
        demand_lots: 10,
        assigned_lots: 0,
        pending_lots: 10,
        vehicle_id: null,
        partial_only: false,
      },
    ],
  };
  return { ...base, ...overrides } as unknown as Solution;
}

describe("explainSolution", () => {
  it("resume lo entregado y la escasez", () => {
    const result = explainSolution(solution());
    expect(result.headline).toContain("130 de los 135 lotes");
    expect(result.facts[0]).toContain("faltan al menos 46");
    expect(result.facts.join(" ")).toContain("5 lotes sin repartir");
  });

  it("separa lo que gana y lo que pierde frente a la línea base", () => {
    const result = explainSolution(solution());
    expect(result.gains.some((text) => text.includes("22,25 km menos"))).toBe(true);
    expect(result.losses.some((text) => text.includes("5 lotes menos"))).toBe(true);
    expect(result.losses.some((text) => text.includes("1,8 puntos menos de cobertura"))).toBe(true);
  });

  it("agrupa por prioridad y explica los centros incompletos", () => {
    const result = explainSolution(solution());
    expect(result.priorities.map((row) => row.priority)).toEqual([3, 2, 1]);
    expect(result.prioritySentence).toContain("prioridad alta recibieron su demanda completa");
    const partial = result.notes.find((note) => note.id === "C02");
    expect(partial?.text).toContain("vehículo V01 va lleno (50/50)");
    const none = result.notes.find((note) => note.id === "C03");
    expect(none?.text).toContain("prioridad baja");
  });

  it("avisa que no garantiza el óptimo", () => {
    const result = explainSolution(solution());
    expect(result.reliability).toContain("123 generaciones");
    expect(result.reliability).toContain("No se puede asegurar");
  });
});
