import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { DataOrigin, Issue, RunStatus } from "../types";
import { ORIGIN_LABEL, STATUS_LABEL } from "../utils/format";

export type IconName =
  | "check"
  | "warn"
  | "error"
  | "info"
  | "play"
  | "pause"
  | "stop"
  | "download"
  | "print"
  | "upload"
  | "plus"
  | "trash"
  | "arrow"
  | "flask"
  | "menu"
  | "replay"
  | "home"
  | "map"
  | "chart"
  | "list"
  | "sliders"
  | "layers"
  | "truck"
  | "box"
  | "clock"
  | "target"
  | "shield"
  | "book"
  | "external"
  | "down"
  | "up";

const PATHS: Record<IconName, string> = {
  check: "M4 10.5l4 4 8-9",
  warn: "M10 3l8 14H2L10 3zm0 5v4.5m0 2.5v.01",
  error: "M10 2a8 8 0 100 16 8 8 0 000-16zM7 7l6 6m0-6l-6 6",
  info: "M10 2a8 8 0 100 16 8 8 0 000-16zm0 7v5m0-8v.01",
  play: "M6 4l10 6-10 6V4z",
  pause: "M6 4v12M14 4v12",
  stop: "M5 5h10v10H5z",
  download: "M10 3v10m0 0l-4-4m4 4l4-4M4 17h12",
  print: "M6 7V3h8v4M6 14H4V8h12v6h-2M6 12h8v5H6z",
  upload: "M10 14V4m0 0L6 8m4-4l4 4M4 17h12",
  plus: "M10 4v12M4 10h12",
  trash: "M4 6h12M8 6V4h4v2m-6 0l1 11h6l1-11",
  arrow: "M4 10h12m0 0l-5-5m5 5l-5 5",
  flask: "M8 3h4M9 3v5l-5 8h12l-5-8V3",
  menu: "M3 6h14M3 10h14M3 14h14",
  replay: "M4 10a6 6 0 106-6H6m0 0l3-3M6 4l3 3",
  home: "M3 9l7-6 7 6v8H3V9zm5 8v-5h4v5",
  map: "M3 5l5-2 4 2 5-2v12l-5 2-4-2-5 2V5zm5-2v12m4-10v12",
  chart: "M3 17V3m0 14h14M6 13l3-4 3 2 4-6",
  list: "M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01",
  sliders: "M3 6h8m4 0h2M3 14h2m4 0h8M13 4v4M7 12v4",
  layers: "M10 3l7 4-7 4-7-4 7-4zm-7 7l7 4 7-4M3 13l7 4 7-4",
  truck: "M2 5h10v8H2V5zm10 3h4l2 3v2h-6V8zM5 15.5v.01M14 15.5v.01",
  box: "M3 6l7-3 7 3v8l-7 3-7-3V6zm0 0l7 3m0 0l7-3m-7 3v8",
  clock: "M10 3a7 7 0 100 14 7 7 0 000-14zm0 3v4l3 2",
  target: "M10 3a7 7 0 100 14 7 7 0 000-14zm0 4a3 3 0 100 6 3 3 0 000-6z",
  shield: "M10 2l6 2v5c0 4-3 7-6 9-3-2-6-5-6-9V4l6-2zm-2.5 8l2 2 3-4",
  book: "M4 3h9a3 3 0 013 3v11H7a3 3 0 01-3-3V3zm0 11a3 3 0 013-3h9",
  external: "M8 4H4v12h12v-4m-4-8h4v4m0-4L9 11",
  down: "M5 8l5 5 5-5",
  up: "M5 12l5-5 5 5",
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduced(query.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export function Count({
  value,
  format,
  duration = 800,
}: {
  value: number | null | undefined;
  format: (value: number) => string;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<number>(reduced && value != null ? value : 0);
  const current = useRef(shown);

  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return;
    if (reduced) {
      current.current = value;
      setShown(value);
      return;
    }
    const from = current.current;
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      current.current = from + (value - from) * eased;
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced, duration]);

  if (value == null || !Number.isFinite(value)) return <>—</>;
  return <>{format(shown)}</>;
}

export function Badge({
  tone = "neutral",
  children,
  title,
}: {
  tone?: "neutral" | "sim" | "ods" | "good" | "bad" | "info";
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`badge ${tone === "neutral" ? "" : tone}`} title={title}>
      {children}
    </span>
  );
}

export function OriginBadge({ origin }: { origin: DataOrigin }) {
  if (origin === "synthetic") {
    return (
      <Badge tone="sim" title="Todos los centros, coordenadas y demandas son ficticios.">
        <Icon name="flask" /> Simulación · datos sintéticos
      </Badge>
    );
  }
  return (
    <Badge tone="info" title="Datos cargados por el usuario; requieren verificación institucional.">
      <Icon name="info" /> Datos {ORIGIN_LABEL[origin]?.toLowerCase() ?? origin} · por verificar
    </Badge>
  );
}

export function StatusChip({ status }: { status: RunStatus | "running" | "completed" | "failed" }) {
  const tone = status === "completed" ? "good" : status === "failed" ? "bad" : "info";
  const icon =
    status === "completed"
      ? "check"
      : status === "failed"
        ? "error"
        : status === "cancelled"
          ? "stop"
          : "info";
  return (
    <Badge tone={status === "cancelled" || status === "queued" ? "neutral" : tone}>
      {status === "running" ? (
        <span className="live-dot" aria-hidden="true" />
      ) : (
        <Icon name={icon} />
      )}{" "}
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function Feasible({ ok }: { ok: boolean | null | undefined }) {
  if (ok == null) return <span className="muted">—</span>;
  return ok ? (
    <Badge tone="good">
      <Icon name="check" /> Factible
    </Badge>
  ) : (
    <Badge tone="bad">
      <Icon name="error" /> No factible
    </Badge>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "error" | "good";
  title?: string;
  children?: ReactNode;
}) {
  const icon =
    tone === "warn" ? "warn" : tone === "error" ? "error" : tone === "good" ? "check" : "info";
  return (
    <div className={`callout ${tone}`} role={tone === "error" ? "alert" : "note"}>
      <Icon name={icon} />
      <div className="stack" style={{ "--gap": "0.25rem" } as CSSProperties}>
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

export function IssueList({ issues, tone }: { issues: Issue[]; tone: "error" | "warn" }) {
  if (issues.length === 0) return null;
  return (
    <ul className="issue-list">
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`}>
          <span style={{ color: tone === "error" ? "var(--critical-ink)" : "var(--warn-ink)" }}>
            <Icon name={tone === "error" ? "error" : "warn"} />
          </span>
          <span>
            {issue.message}
            <span className="field-path">
              {issue.code}
              {issue.field ? ` · ${issue.field}` : ""}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => ReactNode;
}) {
  const id = useId();
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        "aria-describedby": described || undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {hint && (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function Kpi({
  label,
  value,
  unit,
  definition,
  delta,
  deltaTone = "neutral",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  definition?: string;
  delta?: ReactNode;
  deltaTone?: "good" | "bad" | "neutral";
}) {
  return (
    <div className="kpi" title={definition}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">
        {value}
        {unit && <span className="kpi-unit">{unit}</span>}
      </span>
      {delta && <span className={`kpi-delta ${deltaTone}`}>{delta}</span>}
    </div>
  );
}

export function Meter({
  label,
  value,
  max,
  unit,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
}) {
  const fraction = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="meter">
      <div className="meter-row">
        <span>{label}</span>
        <span className="mono">
          {value} / {max} {unit}
        </span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div
          className="meter-fill"
          style={{ width: `${fraction * 100}%`, background: "var(--veh, var(--series-1))" }}
        />
      </div>
    </div>
  );
}

export interface StackPart {
  key: string;
  label: string;
  value: number;
  color: string;
  text?: string;
}

export function StackBar({ parts, caption }: { parts: StackPart[]; caption: string }) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  return (
    <div className="stackbar">
      <div className="stackbar-track" role="img" aria-label={caption}>
        {parts.map((part) =>
          part.value > 0 && total > 0 ? (
            <span
              key={part.key}
              className="stackbar-part"
              style={{ flexGrow: part.value, background: part.color }}
              title={`${part.label}: ${part.text ?? part.value}`}
            />
          ) : null,
        )}
      </div>
      <ul className="stackbar-legend">
        {parts.map((part) => (
          <li key={part.key}>
            <span className="swatch" style={{ background: part.color }} />
            <span>{part.label}</span>
            <span className="mono">{part.text ?? part.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Spinner({ label = "Cargando…" }: { label?: string }) {
  return (
    <span className="row" role="status" style={{ "--gap": "0.5rem" } as CSSProperties}>
      <span className="spinner" aria-hidden="true" />
      <span className="muted">{label}</span>
    </span>
  );
}

export function Skeleton({ height = 120, label }: { height?: number; label?: string }) {
  return (
    <div className="skeleton" style={{ height }} role="status" aria-label={label ?? "Cargando"} />
  );
}

export interface TabDef {
  id: string;
  label: string;
  badge?: string | number;
}

export function Tabs({
  prefix,
  tabs,
  value,
  onChange,
  label,
}: {
  prefix: string;
  tabs: TabDef[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function move(event: KeyboardEvent, index: number) {
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="button"
          role="tab"
          id={`${prefix}-tab-${tab.id}`}
          aria-selected={value === tab.id}
          aria-controls={`${prefix}-panel-${tab.id}`}
          tabIndex={value === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => move(event, index)}
        >
          {tab.label}
          {tab.badge != null && <span className="tab-badge">{tab.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({
  prefix,
  id,
  active,
  children,
}: {
  prefix: string;
  id: string;
  active: string;
  children: ReactNode;
}) {
  if (active !== id) return null;
  return (
    <div
      className="tab-panel stack"
      role="tabpanel"
      id={`${prefix}-panel-${id}`}
      aria-labelledby={`${prefix}-tab-${id}`}
      style={{ "--gap": "1.25rem" } as CSSProperties}
    >
      {children}
    </div>
  );
}

export function PageHead({
  step,
  title,
  children,
  actions,
}: {
  step: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const match = /^Paso (\d+) de (\d+)$/.exec(step);
  const current = match ? Number(match[1]) : null;
  const total = match ? Number(match[2]) : null;
  return (
    <header className="page-head">
      <div className="eyebrow-row">
        <span className="eyebrow">{step}</span>
        {current != null && total != null && (
          <span className="step-track" aria-hidden="true">
            {Array.from({ length: total }, (_, index) => (
              <span
                key={index}
                className={index + 1 < current ? "done" : index + 1 === current ? "now" : ""}
              />
            ))}
          </span>
        )}
      </div>
      <div className="row spread">
        <h1>{title}</h1>
        {actions && <div className="row no-print">{actions}</div>}
      </div>
      {children && <p className="prose">{children}</p>}
    </header>
  );
}
