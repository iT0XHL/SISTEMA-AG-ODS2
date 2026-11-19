import type { CSSProperties } from "react";
import type { Assignment, Chromosome, GAParams, Metrics, Route } from "../types";
import { km, num } from "../utils/format";
import { DASH_PATTERNS } from "./RouteMap";
import { Meter } from "./ui";

export function ChromosomeView({
  chromosome,
  assignments,
  routes,
  active,
}: {
  chromosome: Chromosome;
  assignments: Assignment[];
  routes: Route[];
  active?: string | null;
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
              const dim = active != null && vehicle !== active;
              return (
                <div
                  key={id}
                  className={`gene ${q === 0 ? "zero" : ""} ${dim ? "dim" : ""} ${index >= 0 ? `veh-${index % 8}` : ""}`}
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
              const vehicle = byId.get(id)?.vehicle_id ?? null;
              const dim = active != null && vehicle !== active;
              return (
                <div
                  key={id}
                  className={`gene ${q === 0 ? "zero" : ""} ${dim ? "dim" : ""}`}
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
              <span className="mono">{route.vehicle_id}</span>
              <span className="mono muted">{route.path.join(" → ")}</span>
            </li>
          );
        })}
        <li>
          <span
            className="swatch"
            style={{ background: "transparent", boxShadow: "inset 0 0 0 1px var(--line-strong)" }}
          />
          q = 0: sin ruta
        </li>
      </ul>
    </div>
  );
}

export function RouteManifests({
  routes,
  active,
  onSelect,
}: {
  routes: Route[];
  active?: string | null;
  onSelect?: (vehicleId: string | null) => void;
}) {
  return (
    <div className="manifests">
      {routes.map((route, index) => {
        const selected = active === route.vehicle_id;
        const dim = active != null && !selected;
        return (
          <article
            key={route.vehicle_id}
            className={`manifest veh-${index % 8} ${route.used ? "" : "unused"} ${selected ? "active" : ""} ${dim ? "dim" : ""}`}
            aria-label={`Hoja de ruta del vehículo ${route.vehicle_id}`}
          >
            <div className="manifest-head">
              <button
                type="button"
                className="btn small ghost"
                style={{ paddingInline: "0.3rem", color: "inherit" }}
                aria-pressed={selected}
                disabled={!route.used || !onSelect}
                onClick={() => onSelect?.(selected ? null : route.vehicle_id)}
                title={route.used ? "Resaltar esta ruta en el mapa y en el cromosoma" : undefined}
              >
                <svg width="30" height="10" aria-hidden="true">
                  <line
                    x1="1"
                    y1="5"
                    x2="29"
                    y2="5"
                    className="route-line"
                    style={{
                      animation: "none",
                      ...(route.used ? {} : { stroke: "var(--line-strong)" }),
                    }}
                    strokeDasharray={
                      route.used ? DASH_PATTERNS[index % DASH_PATTERNS.length] : undefined
                    }
                  />
                </svg>
                <span className="veh-id">{route.vehicle_id}</span>
              </button>
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
              <p className="small">Vehículo sin uso en esta solución.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

const COMPONENTS: {
  key: "U" | "R" | "H";
  weight: "w_u" | "w_r" | "w_h";
  label: string;
  cls: string;
}[] = [
  { key: "U", weight: "w_u", label: "Demanda no cubierta (w·U)", cls: "veh-0" },
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
    <div className="stack" style={{ "--gap": "0.7rem" } as CSSProperties}>
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
    </div>
  );
}

export function CompareBars({
  rows,
  format,
  caption,
  axisMax,
}: {
  rows: { label: string; value: number; base?: boolean }[];
  format: (value: number) => string;
  caption: string;
  axisMax?: number;
}) {
  const top = axisMax ?? Math.max(...rows.map((row) => row.value), 1e-9) * 1.08;
  return (
    <div className="bars" role="img" aria-label={caption}>
      {rows.map((row) => (
        <div className={`bar-row ${row.base ? "is-base" : ""}`} key={row.label}>
          <span className="bar-label">{row.label}</span>
          <div className="bar-track" title={`${row.label}: ${format(row.value)}`}>
            <span className="bar-fill" style={{ width: `${(row.value / top) * 100}%` }} />
          </div>
          <span className="bar-val">{format(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function CoverageCell({
  assigned,
  demand,
  vehicleIndex,
}: {
  assigned: number;
  demand: number;
  vehicleIndex: number;
}) {
  const fraction = demand > 0 ? Math.min(1, assigned / demand) : 0;
  return (
    <div className={`cover ${vehicleIndex >= 0 ? `veh-${vehicleIndex % 8}` : ""}`}>
      <span className="cover-track" aria-hidden="true">
        <span
          className={`cover-fill ${assigned === 0 ? "none" : ""}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </span>
      <span className="mono small">
        {assigned}/{demand}
      </span>
    </div>
  );
}

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
  const pad = (hi - lo || 0.01) * 0.14;
  const min = lo - pad;
  const max = hi + pad;
  const width = 520;
  const left = 92;
  const right = 70;
  const top = 36;
  const rowHeight = 38;
  const axisY = top + points.length * rowHeight + 4;
  const height = axisY + 48;
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
          <line x1={x(tick)} y1={top - 8} x2={x(tick)} y2={axisY} stroke="var(--grid)" />
          <text x={x(tick)} y={axisY + 18} textAnchor="middle">
            {num(tick, 3)}
          </text>
        </g>
      ))}
      <line x1={left} y1={axisY} x2={width - right} y2={axisY} stroke="var(--axis)" />
      <line
        x1={baseX}
        y1={top - 14}
        x2={baseX}
        y2={axisY}
        stroke="var(--baseline)"
        strokeWidth={2}
      />
      <text x={baseX} y={14} textAnchor="end">
        Línea base {num(baseline, 5)}
      </text>
      {points.map((point, index) => {
        const cy = top + index * rowHeight + rowHeight / 2 - 2;
        return (
          <g key={point.seed}>
            <text className="row-label" x={0} y={cy + 4}>
              Semilla {point.seed}
            </text>
            <line x1={left} y1={cy} x2={x(point.J)} y2={cy} stroke="var(--grid)" strokeWidth={2} />
            <circle
              cx={x(point.J)}
              cy={cy}
              r={7}
              fill="var(--series-1)"
              stroke="var(--surface)"
              strokeWidth={2}
            >
              <title>{`Semilla ${point.seed}: J = ${num(point.J, 5)}`}</title>
            </circle>
            <text x={x(point.J) + 14} y={cy + 4}>
              {num(point.J, 5)}
            </text>
          </g>
        );
      })}
      <text x={width - right} y={height - 8} textAnchor="end" style={{ fill: "var(--ink-3)" }}>
        J (menor es mejor)
      </text>
    </svg>
  );
}
