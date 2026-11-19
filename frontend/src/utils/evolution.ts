import type { GenerationPoint } from "../types";

export function lastImprovement(history: GenerationPoint[], tolerance: number) {
  let reference = Number.NEGATIVE_INFINITY;
  let at = 0;
  for (const point of history) {
    if (point.best_fitness - reference >= tolerance) {
      reference = point.best_fitness;
      at = point.number;
    }
  }
  const last = history[history.length - 1]?.number ?? 0;
  return { at, since: Math.max(0, last - at) };
}
