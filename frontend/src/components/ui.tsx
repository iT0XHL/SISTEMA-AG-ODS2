import { useId, type ReactNode } from "react";
import type { DataOrigin, Issue, RunStatus } from "../types";
import { ORIGIN_LABEL, STATUS_LABEL } from "../utils/format";

/* ------------------------------------------------------------------ iconos */
type IconName =
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
  | "replay";

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

/* ---------------------------------------------------------------- insignias */
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

/** Insignia visible de procedencia: «Simulación» o «Datos declarados / por verificar». */
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
      <Icon name={icon} /> {STATUS_LABEL[status] ?? status}
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

/* ------------------------------------------------------------------ avisos */
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
      <div className="stack" style={{ "--gap": "0.25rem" } as React.CSSProperties}>
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

/* -------------------------------------------------------------- formulario */
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

/* --------------------------------------------------------------------- KPI */
export function Kpi({
  label,
  value,
  unit,
  definition,
  delta,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  definition: string;
  delta?: ReactNode;
}) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">
        {value}
        {unit && <span className="kpi-unit">{unit}</span>}
      </span>
      {delta && <span className="kpi-delta">{delta}</span>}
      <span className="kpi-def">{definition}</span>
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

export function Spinner({ label = "Cargando…" }: { label?: string }) {
  return (
    <span className="row" role="status" style={{ "--gap": "0.5rem" } as React.CSSProperties}>
      <span className="spinner" aria-hidden="true" />
      <span className="muted">{label}</span>
    </span>
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
  return (
    <header className="page-head">
      <span className="eyebrow">{step}</span>
      <div className="row spread">
        <h1>{title}</h1>
        {actions && <div className="row no-print">{actions}</div>}
      </div>
      {children && <p className="prose">{children}</p>}
    </header>
  );
}
