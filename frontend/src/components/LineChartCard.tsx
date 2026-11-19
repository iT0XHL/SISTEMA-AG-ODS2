import type { ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
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
  xMax?: number;
  reference?: { y: number; label: string };
  shade?: { from: number; label: string };
  actions?: ReactNode;
  animate?: boolean;
  syncId?: string;
  percent?: boolean;
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
  percent,
}: {
  tip: TooltipShape;
  series: SeriesDef[];
  xLabel: string;
  digits: number;
  percent: boolean;
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
            <span>{percent ? `${num(item.value * 100, 0)} %` : num(item.value, digits)}</span>
          </div>
        );
      })}
    </div>
  );
}

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
  shade,
  actions,
  animate = false,
  syncId,
  percent = false,
}: Props) {
  const ends = series
    .map((s) => {
      for (let i = data.length - 1; i >= 0; i -= 1) {
        const value = data[i][s.key];
        if (value != null) return { key: s.key, color: s.color, x: data[i].x, y: value };
      }
      return null;
    })
    .filter((item): item is { key: string; color: string; x: number; y: number } => item !== null);

  const sampled = sample(data);
  const tick = (value: number) =>
    percent ? `${num(value * 100, 0)} %` : num(value, Math.min(digits, 3));

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
        <div
          className={`chart-box ${animate ? "reveal" : ""}`}
          role="img"
          aria-label={`${title}. ${subtitle ?? ""}`}
        >
          <ResponsiveContainer width="100%" height={height}>
            <LineChart
              data={data}
              syncId={syncId}
              margin={{ top: 14, right: 20, bottom: 22, left: 4 }}
            >
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
                domain={percent ? [0, 1] : ["auto", "auto"]}
                tickLine={false}
                axisLine={false}
                width={percent ? 48 : 62}
                tickFormatter={tick}
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
                    percent={percent}
                  />
                )}
              />
              {shade && (
                <ReferenceArea
                  x1={shade.from}
                  x2={xMax ?? data[data.length - 1].x}
                  fill="var(--surface-3)"
                  fillOpacity={0.55}
                  stroke="none"
                  ifOverflow="hidden"
                  label={{ value: shade.label, position: "insideTop" }}
                />
              )}
              {reference && (
                <ReferenceLine
                  y={reference.y}
                  stroke="var(--baseline)"
                  strokeWidth={2}
                  ifOverflow="extendDomain"
                />
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
                />
              ))}
              {ends.map((end) => (
                <ReferenceDot
                  key={end.key}
                  x={end.x}
                  y={end.y}
                  r={4.5}
                  fill={end.color}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  ifOverflow="visible"
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
                {sampled.map((row) => (
                  <tr key={row.x}>
                    <td className="num">{row.x}</td>
                    {series.map((s) => (
                      <td className="num" key={s.key}>
                        {percent
                          ? row[s.key] == null
                            ? "—"
                            : `${num((row[s.key] as number) * 100, 1)} %`
                          : num(row[s.key], digits + 1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {data.length > 24 && (
                <caption>
                  Muestra de {sampled.length} de {data.length} generaciones; el JSON exportado
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
