// Formato de interfaz: coma decimal (como en el informe); la API usa punto decimal.

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(min: number, max: number): Intl.NumberFormat {
  const key = `${min}-${max}`;
  let found = formatters.get(key);
  if (!found) {
    found = new Intl.NumberFormat("es", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      useGrouping: true,
    });
    formatters.set(key, found);
  }
  return found;
}

const DASH = "—";

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Número con `digits` decimales fijos y coma decimal. */
export function num(value: unknown, digits = 0): string {
  return isNumber(value) ? formatter(digits, digits).format(value) : DASH;
}

export function km(value: unknown): string {
  return isNumber(value) ? `${num(value, 2)} km` : DASH;
}

export function pct(fraction: unknown, digits = 1): string {
  return isNumber(fraction) ? `${num(fraction * 100, digits)} %` : DASH;
}

/** Diferencia con signo explícito (−/+), para comparar AG vs. línea base. */
export function signed(value: unknown, digits = 2): string {
  if (!isNumber(value)) return DASH;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return num(0, digits);
  return `${rounded > 0 ? "+" : "−"}${num(Math.abs(rounded), digits)}`;
}

export function seconds(value: unknown): string {
  return isNumber(value) ? `${num(value, 2)} s` : DASH;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "medium" }).format(date);
}

export function shortHash(hash: string | null | undefined, length = 12): string {
  return hash ? `${hash.slice(0, length)}…` : DASH;
}

/** Convierte lo tecleado en un campo numérico: admite coma o punto; vacío → null. */
export function parseInput(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : Number.NaN;
}

export const STATUS_LABEL: Record<string, string> = {
  queued: "En cola",
  running: "En ejecución",
  completed: "Completada",
  failed: "Fallida",
  cancelled: "Cancelada",
};

export const STOP_LABEL: Record<string, string> = {
  max_generations: "Máximo de generaciones",
  stagnation: "Estancamiento (sin mejora)",
  cancelled: "Cancelada",
};

export const ORIGIN_LABEL: Record<string, string> = {
  synthetic: "Sintético",
  official: "Oficial",
  declared: "Declarado",
  mixed: "Mixto",
  inferred: "Inferido por regla",
};

export const REPAIR_LABEL: Record<string, string> = {
  dominio: "Recorte al dominio [0, min(dᵢ, máx Cᵥ)]",
  inventario: "Exceso sobre el inventario B",
  capacidad_flota: "Exceso sobre la capacidad de la flota",
  empaquetado: "No cabía en ningún vehículo",
};
