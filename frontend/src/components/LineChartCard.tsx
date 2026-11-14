import type { ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { num } from "../utils/format";

export interface SeriesDef {
  key: string;
  label: string;
  /** Color de la serie como variable CSS, p. ej. `var(--series-1)`. */
  color: string;
  dash?: string;
}

export type ChartRow = { x: number } & Record<string, number | null>;

interface Props {
  title: string;
  subtitle?: string;
  data: ChartRow[];
  series: SeriesDef[];
  xLabel: string;
  digits?: number;
  height?: number;
  /** Valor máximo del eje X (para que el gráfico no «salte» mientras llegan generaciones). */
  xMax?: number;
  reference?: { y: number; label: string };
  actions?: ReactNode;
  /** Etiqueta directa al final de cada serie (solo con ≤ 4 series). */
  endLabels?: boolean;
}

interface TooltipShape {
  active?: boolean;
  label?: number | string;
  payload?: { dataKey?: string | number; value?: number | null }[];
}

function ChartTooltip({
  tip,
  series,
  xLabel,
  digits,
}: {
  tip: TooltipShape;
  series: SeriesDef[];
  xLabel: string;
  digits: number;
}) {
  if (!tip.active || !tip.payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tt-title">
        {xLabel} {tip.label}
      </div>
      {series.map((s) => {
        const item = tip.payload?.find((p) => p.dataKey === s.key);
        if (item?.value == null) return null;
        return (
          <div className="tt-row" key={s.key}>
            <span className="tt-key">
              <span
                className={`swatch line ${s.dash ? "dash" : ""}`}
                style={{ borderTopColor: s.color }}
              />
              {s.label}
            </span>
            <span>{num(item.value, digits)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Filas para la vista de tabla: como máximo ~24, siempre con la primera y la última. */
function sample(rows: ChartRow[]): ChartRow[] {
  if (rows.length <= 24) return rows;
  const step = Math.ceil(rows.length / 22);
  const picked = rows.filter((_, index) => index % step === 0);
  const last = rows[rows.length - 1];
  return picked[picked.length - 1] === last ? picked : [...picked, last];
}

export function LineChartCard({
  title,
  subtitle,
  data,
  series,
  xLabel,
  digits = 4,
  height = 290,
  xMax,
  reference,
  actions,
  endLabels = false,
}: Props) {
  const lastIndex: Record<string, number> = {};
  for (const s of series) {
    for (let i = data.length - 1; i >= 0; i -= 1) {
      if (data[i][s.key] != null) {
        lastIndex[s.key] = i;
        break;
      }
    }
  }
  const showEndLabels = endLabels && series.length <= 4;

  return (
    <section className="card chart-card">
      <div className="card-title">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="card-note">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {series.length > 1 && (
        <ul className="legend" aria-label="Series del gráfico">
          {series.map((s) => (
            <li key={s.key}>
              <span
                className={`swatch line ${s.dash ? "dash" : ""}`}
                style={{ borderTopColor: s.color }}
              />
              {s.label}
            </li>
          ))}
          {reference && (
            <li>
              <span className="swatch line" style={{ borderTopColor: "var(--baseline)" }} />
              {reference.label}
            </li>
          )}
        </ul>
      )}
      {data.length === 0 ? (
        <p className="muted" style={{ minHeight: height, display: "grid", placeItems: "center" }}>
          Aún no hay generaciones registradas.
        </p>
      ) : (
        <div className="chart-box" role="img" aria-label={`${title}. ${subtitle ?? ""}`}>
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} margin={{ top: 12, right: 18, bottom: 22, left: 4 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis
                dataKey="x"
                type="number"
                domain={[0, xMax ?? "dataMax"]}
                allowDecimals={false}
                tickLine={false}
                axisLine={{ stroke: "var(--axis)" }}
                label={{ value: xLabel, position: "insideBottom", offset: -14 }}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickLine={false}
                axisLine={false}
                width={62}
                tickFormatter={(value: number) => num(value, Math.min(digits, 3))}
              />
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
                content={(tip: unknown) => (
                  <ChartTooltip
                    tip={tip as TooltipShape}
                    series={series}
                    xLabel={xLabel}
                    digits={digits}
                  />
                )}
              />
              {reference && (
                <ReferenceLine y={reference.y} stroke="var(--baseline)" strokeWidth={2} />
              )}
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type="linear"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dash}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{ r: 4.5, stroke: "var(--surface)", strokeWidth: 2 }}
                  isAnimationActive={false}
                  connectNulls={false}
                  label={
                    showEndLabels
                      ? (point: { x?: number | string; y?: number | string; index?: number }) => {
                          const px = Number(point.x);
                          const py = Number(point.y);
                          if (
                            point.index !== lastIndex[s.key] ||
                            !Number.isFinite(px) ||
                            !Number.isFinite(py)
                          ) {
                            return <g key={`skip-${s.key}-${point.index}`} />;
                          }
                          return (
                            <g key={`end-${s.key}`}>
                              <circle
                                cx={px}
                                cy={py}
                                r={4}
                                fill={s.color}
                                stroke="var(--surface)"
                                strokeWidth={2}
                              />
                            </g>
                          );
                        }
                      : undefined
                  }
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {data.length > 0 && (
        <details className="table-twin">
          <summary>Ver los datos del gráfico en tabla</summary>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="num">{xLabel}</th>
                  {series.map((s) => (
                    <th className="num" key={s.key}>
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample(data).map((row) => (
                  <tr key={row.x}>
                    <td className="num">{row.x}</td>
                    {series.map((s) => (
                      <td className="num" key={s.key}>
                        {num(row[s.key], digits + 1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {data.length > 24 && (
                <caption>
                  Muestra de {sample(data).length} de {data.length} generaciones; el export JSON
                  contiene todas.
                </caption>
              )}
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
