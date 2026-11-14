import type { CSSProperties } from "react";
import type { Assignment, Chromosome, GAParams, Metrics, Route } from "../types";
import { km, num } from "../utils/format";
import { DASH_PATTERNS } from "./RouteMap";
import { Meter } from "./ui";

/* ------------------------------------------------------- cromosoma (π, q) */
export function ChromosomeView({
  chromosome,
  assignments,
  routes,
}: {
  chromosome: Chromosome;
  assignments: Assignment[];
  routes: Route[];
}) {
  const vehicleIndex = new Map(routes.map((route, index) => [route.vehicle_id, index]));
  const byId = new Map(assignments.map((a) => [a.center_id, a]));
  const ids = Object.keys(chromosome.q).sort();
  const used = routes.filter((route) => route.used);

  return (
    <div className="chromosome">
      <div className="gene-axis">
        <span className="axis-label">
          π · orden
          <br />
          de visita
        </span>
        <div
          className="gene-scroll"
          tabIndex={0}
          role="group"
          aria-label="Genotipo π: orden global de visita"
        >
          <div className="gene-row">
            {chromosome.pi.map((id, position) => {
              const assignment = byId.get(id);
              const vehicle = assignment?.vehicle_id ?? null;
              const index = vehicle ? (vehicleIndex.get(vehicle) ?? 0) : -1;
              const q = chromosome.q[id] ?? 0;
              return (
                <div
                  key={id}
                  className={`gene ${q === 0 ? "zero" : ""} ${index >= 0 ? `veh-${index % 8}` : ""}`}
                  title={
                    q === 0
                      ? `${id}: posición ${position + 1} en π, q = 0 (no entra en ninguna ruta)`
                      : `${id}: posición ${position + 1} en π, ${q} lotes, vehículo ${vehicle}, parada ${assignment?.stop_order}`
                  }
                >
                  <span className="gene-id">{id}</span>
                  <span className={`veh-mark ${index >= 0 ? "on" : ""}`} />
                  <span className="gene-sub">{vehicle ?? "—"}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="gene-axis">
        <span className="axis-label">
          q · lotes
          <br />
          por centro
        </span>
        <div
          className="gene-scroll"
          tabIndex={0}
          role="group"
          aria-label="Genotipo q: lotes por centro, indexado por ID"
        >
          <div className="gene-row">
            {ids.map((id) => {
              const q = chromosome.q[id];
              const demand = byId.get(id)?.demand_lots;
              return (
                <div
                  key={id}
                  className={`gene ${q === 0 ? "zero" : ""}`}
                  title={`${id}: ${q} de ${demand} lotes`}
                >
                  <span className="gene-id">{q}</span>
                  <span className="gene-sub">{id}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <ul className="legend">
        {used.map((route) => {
          const index = vehicleIndex.get(route.vehicle_id) ?? 0;
          return (
            <li key={route.vehicle_id} className={`veh-${index % 8}`}>
              <span className="swatch" />
              <span className="mono">{route.vehicle_id}</span>:{" "}
              <span className="mono">{route.path.join(" → ")}</span>
            </li>
          );
        })}
        <li>
          <span
            className="swatch"
            style={{ background: "transparent", boxShadow: "inset 0 0 0 1px var(--line-strong)" }}
          />
          q = 0: permanece en π, sin ruta
        </li>
      </ul>
      <p className="small muted">
        π se lee de izquierda a derecha y q está indexado por ID de centro (no por posición en π).
        Decodificación: se reparan las cantidades, se empaquetan por capacidad (mayor entrega
        primero, desempate por posición en π) y cada vehículo visita sus centros en el orden
        relativo de π, saliendo del depósito y volviendo a él.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ hojas de ruta */
export function RouteManifests({ routes }: { routes: Route[] }) {
  return (
    <div className="manifests">
      {routes.map((route, index) => (
        <article
          key={route.vehicle_id}
          className={`manifest veh-${index % 8} ${route.used ? "" : "unused"}`}
          aria-label={`Hoja de ruta del vehículo ${route.vehicle_id}`}
        >
          <div className="manifest-head">
            <span className="row" style={{ gap: "0.5rem" }}>
              <svg width="30" height="10" aria-hidden="true">
                <line
                  x1="1"
                  y1="5"
                  x2="29"
                  y2="5"
                  className="route-line"
                  strokeDasharray={
                    route.used ? DASH_PATTERNS[index % DASH_PATTERNS.length] : undefined
                  }
                  style={route.used ? undefined : { stroke: "var(--line-strong)" }}
                />
              </svg>
              <span className="veh-id">{route.vehicle_id}</span>
            </span>
            <span className="mono small">{route.used ? km(route.km) : "sin ruta"}</span>
          </div>
          <Meter label="Carga" value={route.load_lots} max={route.capacity_lots} unit="lotes" />
          {route.used ? (
            <ol className="stops">
              <li className="depot">
                <span className="stop-n">—</span>
                <span>{route.path[0]} (salida)</span>
                <span />
              </li>
              {route.stops.map((stop) => (
                <li key={stop.center_id}>
                  <span className="stop-n">{stop.order}</span>
                  <span>{stop.center_id}</span>
                  <span>{stop.lots} lotes</span>
                </li>
              ))}
              <li className="depot">
                <span className="stop-n">—</span>
                <span>{route.path[route.path.length - 1]} (retorno)</span>
                <span />
              </li>
            </ol>
          ) : (
            <p className="small">Este vehículo no se utiliza en la solución.</p>
          )}
        </article>
      ))}
    </div>
  );
}

/* -------------------------------------------- descomposición de J (AG vs base) */
const COMPONENTS: {
  key: "U" | "R" | "H";
  weight: "w_u" | "w_r" | "w_h";
  label: string;
  cls: string;
}[] = [
  { key: "U", weight: "w_u", label: "Demanda ponderada no cubierta (w·U)", cls: "veh-0" },
  { key: "R", weight: "w_r", label: "Distancia relativa (w·R)", cls: "veh-1" },
  { key: "H", weight: "w_h", label: "Prioridad alta sin entrega (w·H)", cls: "veh-2" },
];

export function JBreakdown({
  rows,
  params,
}: {
  rows: { label: string; metrics: Pick<Metrics, "J" | "U" | "R" | "H"> }[];
  params: Pick<GAParams, "w_u" | "w_r" | "w_h">;
}) {
  const max = Math.max(...rows.map((row) => row.metrics.J), 1e-9);
  return (
    <div className="stack" style={{ "--gap": "0.6rem" } as CSSProperties}>
      <ul className="legend">
        {COMPONENTS.map((component) => (
          <li key={component.key} className={component.cls}>
            <span className="swatch" />
            {component.label}
          </li>
        ))}
      </ul>
      {rows.map((row) => (
        <div className="jbar" key={row.label}>
          <span>{row.label}</span>
          <div
            className="jbar-track"
            role="img"
            aria-label={`${row.label}: J = ${num(row.metrics.J, 4)}; ${COMPONENTS.map(
              (c) => `${c.key} aporta ${num(params[c.weight] * row.metrics[c.key], 4)}`,
            ).join(", ")}`}
          >
            {COMPONENTS.map((component) => {
              const part = params[component.weight] * row.metrics[component.key];
              if (part <= 0) return null;
              return (
                <span
                  key={component.key}
                  className={`jbar-seg ${component.cls}`}
                  style={{ width: `${(part / max) * 100}%` }}
                  title={`${component.label}: ${num(part, 4)}`}
                />
              );
            })}
          </div>
          <span className="jbar-value">{num(row.metrics.J, 4)}</span>
        </div>
      ))}
      <p className="small muted">
        Longitud de cada barra = J (menor es mejor). Cada tramo es el aporte de un componente:{" "}
        {num(params.w_u, 2)}·U + {num(params.w_r, 2)}·R + {num(params.w_h, 2)}·H.
      </p>
    </div>
  );
}

/* ------------------------------------------- distribución de J por semilla */
/** Gráfico de puntos: una fila por semilla sobre un eje J común, con la línea base como regla. */
export function SeedStripPlot({
  points,
  baseline,
}: {
  points: { seed: number; J: number }[];
  baseline: number;
}) {
  const values = [...points.map((p) => p.J), baseline];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo || 0.01) * 0.12;
  const min = lo - pad;
  const max = hi + pad;
  const width = 620;
  const left = 96;
  const right = 78;
  const top = 30;
  const rowHeight = 30;
  const axisY = top + points.length * rowHeight + 6;
  const height = axisY + 44;
  const x = (value: number) => left + ((value - min) / (max - min)) * (width - left - right);
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  const baseX = x(baseline);

  return (
    <svg
      className="dot-plot"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`J por semilla: ${points
        .map((p) => `semilla ${p.seed} = ${num(p.J, 5)}`)
        .join(", ")}. Línea base = ${num(baseline, 5)}.`}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={x(tick)} y1={top - 6} x2={x(tick)} y2={axisY} stroke="var(--grid)" />
          <text x={x(tick)} y={axisY + 17} textAnchor="middle">
            {num(tick, 3)}
          </text>
        </g>
      ))}
      <line x1={left} y1={axisY} x2={width - right} y2={axisY} stroke="var(--axis)" />
      <line
        x1={baseX}
        y1={top - 12}
        x2={baseX}
        y2={axisY}
        stroke="var(--baseline)"
        strokeWidth={2}
      />
      <text x={baseX} y={12} textAnchor="end">
        Línea base {num(baseline, 5)}
      </text>
      {points.map((point, index) => {
        const cy = top + index * rowHeight + rowHeight / 2 - 3;
        return (
          <g key={point.seed}>
            <text className="row-label" x={0} y={cy + 4}>
              Semilla {point.seed}
            </text>
            <line x1={left} y1={cy} x2={x(point.J)} y2={cy} stroke="var(--grid)" strokeWidth={2} />
            <circle
              cx={x(point.J)}
              cy={cy}
              r={6}
              fill="var(--series-1)"
              stroke="var(--surface)"
              strokeWidth={2}
            >
              <title>{`Semilla ${point.seed}: J = ${num(point.J, 5)}`}</title>
            </circle>
            <text x={x(point.J) + 12} y={cy + 4}>
              {num(point.J, 5)}
            </text>
          </g>
        );
      })}
      <text x={width - right} y={height - 6} textAnchor="end" style={{ fill: "var(--ink-3)" }}>
        J, sin unidades (menor es mejor)
      </text>
    </svg>
  );
}
