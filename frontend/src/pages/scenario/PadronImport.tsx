import { useEffect, useState } from "react";
import { Badge, Callout, Field, Icon, Spinner } from "../../components/ui";
import { api, errorMessage } from "../../services/api";
import type { Center, DemandRule, ImportPreview, ImportReport } from "../../types";

interface Props {
  maxUploadMb: number;
  initialFile?: File | null;
  onImported: (centers: Center[], rule: DemandRule | null) => void;
}

export function PadronImport({ maxUploadMb, initialFile, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [useRule, setUseRule] = useState(false);
  const [perUser, setPerUser] = useState("1");
  const [perLot, setPerLot] = useState("10");
  const [result, setResult] = useState<{ centers: Center[]; report: ImportReport } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(selected: File | null) {
    setFile(selected);
    setPreview(null);
    setResult(null);
    setError(null);
    if (!selected) return;
    if (selected.size > maxUploadMb * 1024 * 1024) {
      setError(`El archivo supera el máximo de ${maxUploadMb} MB.`);
      return;
    }
    setBusy(true);
    try {
      const data = await api.previewPadron(selected);
      setPreview(data);
      const suggested: Record<string, string> = {};
      for (const column of data.columns) {
        if (column.suggested_field) suggested[column.name] = column.suggested_field;
      }
      setMapping(suggested);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialFile) void choose(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  function rule(): DemandRule | null {
    if (!useRule) return null;
    return {
      rations_per_user: Number(perUser.replace(",", ".")),
      rations_per_lot: Number(perLot.replace(",", ".")),
    };
  }

  async function normalize() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const byField: Record<string, string> = {};
      for (const [column, field] of Object.entries(mapping)) if (field) byField[field] = column;
      setResult(await api.normalizePadron(file, byField, rule()));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const usedFields = new Set(Object.values(mapping).filter(Boolean));
  const hasName = usedFields.has("name");

  return (
    <section className="card" aria-labelledby="padron-title">
      <div className="card-title">
        <h3 id="padron-title">Importar padrón de centros</h3>
        <span className="card-note">
          CSV o XLSX · máximo {maxUploadMb} MB · no se guarda en el servidor
        </span>
      </div>
      <p className="prose small">
        Descargue el recurso oficial desde su página, revise fecha y licencia, y suba una copia
        local. Solo se leen las columnas institucionales que usted asigne; las columnas con datos
        personales se descartan siempre y nunca salen del archivo.
      </p>
      <Field label="Archivo del padrón" hint="La primera fila debe contener los encabezados.">
        {(props) => (
          <input
            {...props}
            className="input"
            type="file"
            accept=".csv,.xlsx,.xlsm,.txt,.tsv"
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
          />
        )}
      </Field>
      {busy && <Spinner label="Procesando el archivo…" />}
      {error && (
        <Callout tone="error" title="No se pudo procesar el archivo">
          {error}
        </Callout>
      )}

      {preview && !result && (
        <>
          <div className="table-wrap">
            <table className="data">
              <caption>
                {preview.row_count} filas · {preview.columns.length} columnas. Las columnas sin
                asignar no se importan.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Columna del archivo</th>
                  <th scope="col">Tratamiento</th>
                  <th scope="col">Asignar al campo</th>
                </tr>
              </thead>
              <tbody>
                {preview.columns.map((column) => (
                  <tr key={column.name}>
                    <th scope="row" className="id" style={{ fontWeight: 500 }}>
                      {column.name}
                    </th>
                    <td>
                      {column.pii ? (
                        <Badge tone="bad">
                          <Icon name="error" /> Dato personal ({column.pii_category}) · se descarta
                        </Badge>
                      ) : mapping[column.name] ? (
                        <Badge tone="good">
                          <Icon name="check" /> Se importa
                        </Badge>
                      ) : (
                        <Badge>Se descarta</Badge>
                      )}
                    </td>
                    <td>
                      {column.pii ? (
                        <span className="muted small">No disponible para datos personales</span>
                      ) : (
                        <select
                          className="select"
                          aria-label={`Campo para la columna ${column.name}`}
                          value={mapping[column.name] ?? ""}
                          onChange={(event) =>
                            setMapping((current) => ({
                              ...current,
                              [column.name]: event.target.value,
                            }))
                          }
                        >
                          <option value="">— Descartar —</option>
                          {Object.entries(preview.allowed_fields).map(([field, label]) => (
                            <option
                              key={field}
                              value={field}
                              disabled={usedFields.has(field) && mapping[column.name] !== field}
                            >
                              {label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className={`choice ${useRule ? "selected" : ""}`}>
            <input
              type="checkbox"
              checked={useRule}
              onChange={(e) => setUseRule(e.target.checked)}
            />
            <span className="stack" style={{ gap: "0.5rem" }}>
              <span>
                <strong>Derivar la demanda con una regla declarada</strong> (opcional). La cantidad
                de usuarios no equivale por sí sola a demanda: la regla queda registrada y la
                demanda se rotula «inferida».
              </span>
              {useRule && (
                <span className="form-grid">
                  <Field label="Raciones por usuario (por período)">
                    {(props) => (
                      <input
                        {...props}
                        className="input mono"
                        inputMode="decimal"
                        value={perUser}
                        onChange={(e) => setPerUser(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Raciones por lote">
                    {(props) => (
                      <input
                        {...props}
                        className="input mono"
                        inputMode="decimal"
                        value={perLot}
                        onChange={(e) => setPerLot(e.target.value)}
                      />
                    )}
                  </Field>
                  <span className="small muted" style={{ alignSelf: "end" }}>
                    demanda = ⌈usuarios × raciones_por_usuario / raciones_por_lote⌉
                  </span>
                </span>
              )}
            </span>
          </label>

          {!hasName && (
            <Callout tone="warn">
              Asigne la columna que contiene el nombre institucional del centro.
            </Callout>
          )}
          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={!hasName || busy}
              onClick={normalize}
            >
              Depurar e importar
            </button>
          </div>
        </>
      )}

      {result && (
        <>
          <Callout
            tone="good"
            title={`${result.report.accepted} centros aceptados de ${result.report.rows_total} filas`}
          >
            {result.report.duplicates} duplicadas por código · {result.report.inactive_ignored}{" "}
            inactivas ignoradas · {result.report.rejected.length} rechazadas ·{" "}
            {result.report.discarded_columns.length} columnas descartadas.
          </Callout>
          {result.report.pii_removed.length > 0 && (
            <Callout tone="info" title="Campos personales removidos antes de procesar">
              <span className="mono">{result.report.pii_removed.join(", ")}</span>
            </Callout>
          )}
          {result.report.rejected.length > 0 && (
            <details className="table-twin">
              <summary>Ver filas rechazadas ({result.report.rejected.length})</summary>
              <ul className="plain small">
                {result.report.rejected.map((row) => (
                  <li key={row.row}>
                    Fila {row.row}: {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {result.report.row_warnings.length > 0 && (
            <details className="table-twin">
              <summary>Ver avisos por fila ({result.report.row_warnings.length})</summary>
              <ul className="plain small">
                {result.report.row_warnings.map((row) => (
                  <li key={row.row}>
                    Fila {row.row} ({row.center_id}): {row.warning}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="small muted">
            {result.report.source_nature} {result.report.priority_note}
          </p>
          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={result.centers.length === 0}
              onClick={() => onImported(result.centers, result.report.demand_rule)}
            >
              Usar estos {result.centers.length} centros
            </button>
            <button type="button" className="btn" onClick={() => setResult(null)}>
              Volver al mapeo
            </button>
          </div>
        </>
      )}
    </section>
  );
}
