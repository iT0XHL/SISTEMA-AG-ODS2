import { useMemo, useState } from "react";
import { Badge, Icon } from "../../components/ui";
import type { Center, Issue } from "../../types";
import { ORIGIN_LABEL } from "../../utils/format";

type SortKey = "id" | "name" | "district" | "demand_lots" | "priority_weight";
const PAGE_SIZE = 10;

interface Props {
  centers: Center[];
  rowIssues: Map<number, Issue[]>;
  validated: boolean;
  coordsRequired: boolean;
  onChange: (index: number, changes: Partial<Center>) => void;
  onRemove: (index: number) => void;
  onKeepOnly: (indices: number[]) => void;
}

function toNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Tabla editable de centros con búsqueda, filtros, ordenación, paginación y estado por fila. */
export function CentersTable({
  centers,
  rowIssues,
  validated,
  coordsRequired,
  onChange,
  onRemove,
  onKeepOnly,
}: Props) {
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "id", dir: 1 });
  const [page, setPage] = useState(0);

  const districts = useMemo(
    () => [...new Set(centers.map((c) => c.district).filter((d): d is string => !!d))].sort(),
    [centers],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = centers
      .map((center, index) => ({ center, index }))
      .filter(({ center, index }) => {
        if (district && center.district !== district) return false;
        if (onlyErrors && !rowIssues.has(index)) return false;
        if (!needle) return true;
        return [center.id, center.name, center.district ?? ""].some((text) =>
          text.toLowerCase().includes(needle),
        );
      });
    return filtered.sort((a, b) => {
      const x = a.center[sort.key];
      const y = b.center[sort.key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (
        (typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "es", { numeric: true })) * sort.dir
      );
    });
  }, [centers, search, district, onlyErrors, sort, rowIssues]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const filtering = !!search || !!district || onlyErrors;

  function header(key: SortKey, label: string, numeric = false) {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        className={numeric ? "num" : undefined}
        aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          className="sort"
          onClick={() => setSort({ key, dir: active && sort.dir === 1 ? -1 : 1 })}
        >
          {label}
          <span aria-hidden="true">{active ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  }

  function fieldInvalid(index: number, field: string): boolean {
    return (rowIssues.get(index) ?? []).some((issue) => issue.field?.endsWith(`.${field}`));
  }

  if (centers.length === 0) {
    return (
      <div className="card flat">
        <p className="muted">
          Aún no hay centros. Cargue el escenario demo, importe un padrón, abra un archivo JSON o
          agregue centros manualmente.
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: "0.7rem" }}>
      <div className="table-tools">
        <div className="row grow">
          <input
            className="input"
            style={{ maxWidth: "18rem" }}
            type="search"
            placeholder="Buscar por ID, nombre o distrito"
            aria-label="Buscar centros"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
          {districts.length > 1 && (
            <select
              className="select"
              style={{ maxWidth: "14rem" }}
              aria-label="Filtrar por distrito"
              value={district}
              onChange={(event) => {
                setDistrict(event.target.value);
                setPage(0);
              }}
            >
              <option value="">Todos los distritos</option>
              {districts.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          )}
          {validated && rowIssues.size > 0 && (
            <label className="row small" style={{ gap: "0.4rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={onlyErrors}
                onChange={(event) => {
                  setOnlyErrors(event.target.checked);
                  setPage(0);
                }}
                style={{ width: "1.1rem", height: "1.1rem", accentColor: "var(--accent)" }}
              />
              Solo filas con errores ({rowIssues.size})
            </label>
          )}
        </div>
        {filtering && rows.length > 0 && rows.length < centers.length && (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              onKeepOnly(rows.map((row) => row.index));
              setSearch("");
              setDistrict("");
              setOnlyErrors(false);
            }}
          >
            Conservar solo estos {rows.length}
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table className="data">
          <caption>
            Tabla de centros: {rows.length} de {centers.length} mostrados. Columnas: estado de
            validación, identificador, nombre institucional, distrito, coordenadas
            {coordsRequired
              ? " (obligatorias en modalidad Haversine)"
              : " (opcionales con matriz vial)"}
            , demanda en lotes, prioridad 1–3, usuarios (cifra agregada) y origen del dato.
          </caption>
          <thead>
            <tr>
              <th scope="col">Estado</th>
              {header("id", "ID")}
              {header("name", "Nombre institucional")}
              {header("district", "Distrito")}
              <th scope="col" className="num">
                Latitud
              </th>
              <th scope="col" className="num">
                Longitud
              </th>
              {header("demand_lots", "Demanda (lotes)", true)}
              {header("priority_weight", "Prioridad", true)}
              <th scope="col" className="num">
                Usuarios
              </th>
              <th scope="col">Origen</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ center, index }) => {
              const issues = rowIssues.get(index) ?? [];
              const label = center.id || `fila ${index + 1}`;
              return (
                <tr key={index} className={issues.length ? "row-error" : undefined}>
                  <td>
                    {!validated ? (
                      <span className="muted small">Sin validar</span>
                    ) : issues.length ? (
                      <Badge tone="bad" title={issues.map((i) => i.message).join("\n")}>
                        <Icon name="error" /> {issues.length} error{issues.length > 1 ? "es" : ""}
                      </Badge>
                    ) : (
                      <Badge tone="good">
                        <Icon name="check" /> Válido
                      </Badge>
                    )}
                    {issues.length > 0 && (
                      <span className="sr-only">{issues.map((i) => i.message).join(". ")}</span>
                    )}
                  </td>
                  <td>
                    <input
                      className="cell-input mono"
                      style={{ width: "6rem" }}
                      aria-label={`ID del centro, fila ${index + 1}`}
                      aria-invalid={fieldInvalid(index, "id") || undefined}
                      value={center.id}
                      onChange={(e) => onChange(index, { id: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      style={{ minWidth: "13rem" }}
                      aria-label={`Nombre de ${label}`}
                      aria-invalid={fieldInvalid(index, "name") || undefined}
                      value={center.name}
                      onChange={(e) => onChange(index, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      style={{ minWidth: "12.5rem" }}
                      aria-label={`Distrito de ${label}`}
                      value={center.district ?? ""}
                      onChange={(e) => onChange(index, { district: e.target.value || null })}
                    />
                  </td>
                  {(["lat", "lon"] as const).map((key) => (
                    <td key={key}>
                      <input
                        className="cell-input num"
                        style={{ width: "7.6rem" }}
                        type="number"
                        step="any"
                        aria-label={`${key === "lat" ? "Latitud" : "Longitud"} de ${label}`}
                        aria-invalid={fieldInvalid(index, key) || undefined}
                        value={center[key] ?? ""}
                        onChange={(e) => onChange(index, { [key]: toNumber(e.target.value) })}
                      />
                    </td>
                  ))}
                  <td>
                    <input
                      className="cell-input num"
                      style={{ width: "5rem" }}
                      type="number"
                      min={0}
                      step={1}
                      aria-label={`Demanda en lotes de ${label}`}
                      aria-invalid={fieldInvalid(index, "demand_lots") || undefined}
                      value={center.demand_lots ?? ""}
                      onChange={(e) =>
                        onChange(index, {
                          demand_lots: toNumber(e.target.value),
                          demand_origin: center.source === "synthetic" ? "synthetic" : "declared",
                        })
                      }
                    />
                  </td>
                  <td>
                    <select
                      className="cell-input num"
                      style={{ width: "4rem" }}
                      aria-label={`Prioridad de ${label}`}
                      aria-invalid={fieldInvalid(index, "priority_weight") || undefined}
                      value={center.priority_weight ?? ""}
                      onChange={(e) => onChange(index, { priority_weight: Number(e.target.value) })}
                    >
                      {![1, 2, 3].includes(center.priority_weight ?? 0) && (
                        <option value={center.priority_weight ?? ""}>
                          {center.priority_weight ?? "—"}
                        </option>
                      )}
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </td>
                  <td className="num">{center.users_aggregate ?? "—"}</td>
                  <td>
                    <Badge tone={center.source === "synthetic" ? "sim" : "neutral"}>
                      {ORIGIN_LABEL[center.source]}
                    </Badge>
                    {center.demand_origin === "inferred" && (
                      <>
                        {" "}
                        <Badge title="Demanda derivada de una regla declarada, no medida.">
                          Demanda inferida
                        </Badge>
                      </>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn small ghost"
                      aria-label={`Quitar ${label}`}
                      onClick={() => onRemove(index)}
                    >
                      <Icon name="trash" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={11} className="muted">
                  Ningún centro coincide con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="pager">
          <button
            type="button"
            className="btn small"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Anterior
          </button>
          <span aria-live="polite">
            Página {current + 1} de {pages}
          </span>
          <button
            type="button"
            className="btn small"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
