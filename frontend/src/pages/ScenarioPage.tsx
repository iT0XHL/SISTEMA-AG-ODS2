import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RouteMap } from "../components/RouteMap";
import {
  Badge,
  Callout,
  Field,
  Icon,
  IssueList,
  Meter,
  OriginBadge,
  PageHead,
  Spinner,
} from "../components/ui";
import {
  EMPTY_DRAFT,
  demandFromUsers,
  issuesByCenterRow,
  loadDraft,
  nextId,
  pickScenario,
  saveDraft,
} from "../features/draft";
import { useStore } from "../features/store";
import { ApiError, api, errorMessage } from "../services/api";
import type {
  Center,
  DataOrigin,
  Issue,
  ScenarioPayload,
  ScenarioSummary,
  ValidationReport,
} from "../types";
import { dateTime, num, shortHash } from "../utils/format";
import { CentersTable } from "./scenario/CentersTable";
import { PadronImport } from "./scenario/PadronImport";

const STEPS = [
  "Centros",
  "Depósito y vehículos",
  "Inventario y prioridades",
  "Distancias y validación",
];

function toNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function fieldError(issues: Issue[], field: string): string | null {
  return issues.find((issue) => issue.field === field)?.message ?? null;
}

export function ScenarioPage() {
  const { meta, scenario, scenarioId, selectScenario, reloadScenario } = useStore();
  const [saved, setSaved] = useState<ScenarioSummary[] | null>(null);
  const [draft, setDraft] = useState<ScenarioPayload>(loadDraft);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [demoSize, setDemoSize] = useState(18);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [ruleUsers, setRuleUsers] = useState("1");
  const [ruleLot, setRuleLot] = useState("10");

  const limits = meta?.limits;

  const refreshSaved = useCallback(() => {
    api
      .listScenarios()
      .then(setSaved)
      .catch(() => setSaved([]));
  }, []);

  useEffect(refreshSaved, [refreshSaved]);
  useEffect(() => saveDraft(draft), [draft]);

  /** Cualquier edición invalida el informe anterior: hay que volver a validar. */
  const update = useCallback((changes: Partial<ScenarioPayload>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setReport(null);
    setNotice(null);
  }, []);

  const errors = useMemo(() => report?.errors ?? [], [report]);
  const rowIssues = useMemo(() => issuesByCenterRow(errors), [errors]);

  const totals = useMemo(() => {
    const demand = draft.centers.reduce((sum, c) => sum + (c.demand_lots ?? 0), 0);
    const fleet = draft.vehicles.reduce((sum, v) => sum + (v.capacity_lots ?? 0), 0);
    return { demand, fleet };
  }, [draft.centers, draft.vehicles]);

  async function run<T>(label: string, task: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setError(null);
    try {
      return await task();
    } catch (reason) {
      const details =
        reason instanceof ApiError && reason.code === "SCENARIO_INVALID"
          ? (reason.details as { errors?: Issue[] } | null)?.errors
          : null;
      if (details) {
        setReport((current) => ({
          ...(current ??
            ({
              warnings: [],
              flags: { structural_scarcity: null, partial_only_centers: [] },
              summary: {},
              hash: null,
            } as unknown as ValidationReport)),
          valid: false,
          errors: details,
        }));
      }
      setError(errorMessage(reason));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function loadDemo() {
    const demo = await run("demo", () => api.demoScenario(demoSize));
    if (!demo) return;
    setDraft({ ...EMPTY_DRAFT, ...demo });
    setReport(null);
    setEditing(true);
    setNotice(
      `Escenario demo de ${demo.centers.length} centros ficticios cargado en el borrador (semilla de fixture ${demo.fixture_seed}).`,
    );
  }

  function loadJson(file: File | null) {
    if (!file) return;
    file
      .text()
      .then((text) => {
        const loaded = pickScenario(JSON.parse(text));
        setDraft(loaded);
        setReport(null);
        setEditing(true);
        setError(null);
        setNotice(
          `Archivo «${file.name}» cargado en el borrador: ${loaded.centers.length} centros.`,
        );
      })
      .catch((reason: unknown) =>
        setError(
          `No se pudo leer «${file.name}»: ${reason instanceof Error ? reason.message : "JSON inválido"}`,
        ),
      );
  }

  async function duplicateActive() {
    if (!scenarioId) return;
    const detail = await run("duplicar", () => api.getScenario(scenarioId));
    if (!detail) return;
    const copy = pickScenario(detail.scenario);
    setDraft({ ...copy, scenario_id: null, label: `${copy.label} (copia)` });
    setReport(null);
    setEditing(true);
    setStep(0);
    setNotice(
      copy.distance_mode === "road_matrix"
        ? "Copia cargada en el borrador. Vuelva a subir la matriz vial en el paso 4."
        : "Copia cargada en el borrador. Los escenarios guardados no se modifican: guarde la copia con otro nombre.",
    );
  }

  function changeCenter(index: number, changes: Partial<Center>) {
    update({ centers: draft.centers.map((c, i) => (i === index ? { ...c, ...changes } : c)) });
  }

  function addCenter() {
    const center: Center = {
      id: nextId(
        "C",
        draft.centers.map((c) => c.id),
      ),
      name: "",
      district: null,
      address: null,
      lat: null,
      lon: null,
      demand_lots: null,
      priority_weight: 1,
      source: "declared",
      demand_origin: "declared",
      users_aggregate: null,
    };
    update({ centers: [...draft.centers, center] });
  }

  function applyDemandRule() {
    const perUser = toNumber(ruleUsers.replace(",", "."));
    const perLot = toNumber(ruleLot.replace(",", "."));
    if (!perUser || !perLot || perUser <= 0 || perLot <= 0) {
      setError("La regla necesita raciones por usuario y raciones por lote mayores que 0.");
      return;
    }
    let applied = 0;
    const centers = draft.centers.map((center) => {
      if (center.users_aggregate == null) return center;
      applied += 1;
      return {
        ...center,
        demand_lots: demandFromUsers(center.users_aggregate, perUser, perLot),
        demand_origin: "inferred" as const,
      };
    });
    update({ centers, demand_rule: { rations_per_user: perUser, rations_per_lot: perLot } });
    setNotice(
      `Regla aplicada a ${applied} centro(s) con cifra agregada de usuarios. Su demanda queda rotulada «inferida».`,
    );
  }

  async function uploadMatrix(file: File | null) {
    if (!file) return;
    const parsed = await run("matriz", () => api.importMatrix(file));
    if (!parsed) return;
    update({ distances: parsed.entries, distance_source: `road_csv:${file.name}`.slice(0, 120) });
    setNotice(
      `Matriz «${file.name}» leída: ${parsed.count} distancias (${parsed.format === "long" ? "formato largo" : "formato cuadrado"}). Valide el escenario para comprobar que está completa.`,
    );
  }

  async function validate() {
    const result = await run("validar", () => api.validateScenario(draft));
    if (result) setReport(result);
  }

  async function save() {
    const created = await run("guardar", () => api.createScenario(draft));
    if (!created) return;
    selectScenario(created.id);
    reloadScenario();
    refreshSaved();
    setEditing(false);
    setReport(null);
    setDraft(EMPTY_DRAFT);
    setStep(0);
    setNotice(
      created.created
        ? `Escenario «${created.id}» guardado y activado. Hash ${shortHash(created.hash)}.`
        : `El escenario «${created.id}» ya existía con el mismo contenido; se activó sin duplicarlo.`,
    );
  }

  async function remove(id: string) {
    await run("eliminar", () => api.deleteScenario(id));
    setConfirmDelete(null);
    if (id === scenarioId) selectScenario(null);
    refreshSaved();
  }

  const coordsRequired = draft.distance_mode === "haversine_demo";
  const depotIssues = errors.filter((issue) => issue.field?.startsWith("depot"));
  const fleetIssues = errors.filter((issue) => issue.field?.startsWith("vehicles"));
  const otherIssues = errors.filter((issue) => !/^centers\[/.test(issue.field ?? ""));

  return (
    <>
      <PageHead
        step="Paso 2 de 6"
        title="Escenario"
        actions={
          !editing && (
            <button type="button" className="btn primary" onClick={() => setEditing(true)}>
              <Icon name="plus" /> Nuevo escenario
            </button>
          )
        }
      >
        Un escenario reúne centros, depósito, flota, inventario y distancias. Se guarda solo si
        supera la validación, y una vez guardado no cambia: así todas las corridas comparan
        exactamente la misma instancia.
      </PageHead>

      {notice && <Callout tone="good">{notice}</Callout>}
      {error && (
        <Callout tone="error" title="Revise lo siguiente">
          {error}
        </Callout>
      )}

      {!editing && (
        <>
          <section className="stack">
            <div className="section-title">
              <h2>Escenarios guardados</h2>
              <span className="muted small">
                {saved ? `${saved.length} en la base de datos` : ""}
              </span>
            </div>
            {saved === null ? (
              <Spinner />
            ) : saved.length === 0 ? (
              <div className="card flat">
                <p className="muted">
                  No hay escenarios todavía. Pulse «Nuevo escenario» y cargue la demo sintética para
                  empezar.
                </p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Activo</th>
                      <th scope="col">Escenario</th>
                      <th scope="col">Origen</th>
                      <th scope="col" className="num">
                        Centros
                      </th>
                      <th scope="col" className="num">
                        Demanda / inventario
                      </th>
                      <th scope="col" className="num">
                        Corridas
                      </th>
                      <th scope="col">Creado</th>
                      <th scope="col">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {saved.map((item) => (
                      <tr
                        key={item.scenario_id}
                        className={item.scenario_id === scenarioId ? "emph" : undefined}
                      >
                        <td>
                          <input
                            type="radio"
                            name="active-scenario"
                            aria-label={`Activar ${item.label}`}
                            checked={item.scenario_id === scenarioId}
                            onChange={() => selectScenario(item.scenario_id)}
                            style={{
                              width: "1.2rem",
                              height: "1.2rem",
                              accentColor: "var(--accent)",
                            }}
                          />
                        </td>
                        <td className="wrap">
                          <strong>{item.label}</strong>
                          <br />
                          <span className="mono small muted">
                            {item.scenario_id} · #{shortHash(item.hash, 10)}
                          </span>
                        </td>
                        <td>
                          <OriginBadge origin={item.data_origin} />
                        </td>
                        <td className="num">{item.n_centers}</td>
                        <td className="num">
                          {item.total_demand} / {item.inventory_lots} lotes
                        </td>
                        <td className="num">{item.runs}</td>
                        <td>{dateTime(item.created_at)}</td>
                        <td>
                          {confirmDelete === item.scenario_id ? (
                            <span className="row" style={{ gap: "0.4rem" }}>
                              <button
                                type="button"
                                className="btn small danger"
                                onClick={() => remove(item.scenario_id)}
                              >
                                Eliminar con sus {item.runs} corridas
                              </button>
                              <button
                                type="button"
                                className="btn small"
                                onClick={() => setConfirmDelete(null)}
                              >
                                Cancelar
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn small ghost"
                              aria-label={`Eliminar ${item.label}`}
                              onClick={() => setConfirmDelete(item.scenario_id)}
                            >
                              <Icon name="trash" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {scenario && (
            <section className="stack">
              <div className="section-title">
                <h2>Escenario activo: {scenario.label}</h2>
                <div className="row no-print">
                  <button type="button" className="btn small" onClick={duplicateActive}>
                    Duplicar como borrador
                  </button>
                  <Link className="btn small primary" to="/configuracion">
                    Configurar el AG <Icon name="arrow" />
                  </Link>
                </div>
              </div>
              <div className="split">
                <div className="stack">
                  <div className="card">
                    <h3>Entradas y restricciones</h3>
                    <dl className="io-list">
                      <dt>n</dt>
                      <dd>{scenario.n_centers} centros</dd>
                      <dt>Σ dᵢ</dt>
                      <dd>{scenario.total_demand} lotes demandados</dd>
                      <dt>B</dt>
                      <dd>{scenario.inventory_lots} lotes en inventario</dd>
                      <dt>m, Cᵥ</dt>
                      <dd>
                        {scenario.scenario.vehicles
                          .map((v) => `${v.id}: ${v.capacity_lots}`)
                          .join(" · ")}{" "}
                        lotes
                      </dd>
                      <dt>D</dt>
                      <dd>{scenario.validation_summary.distance_mode_label}</dd>
                      <dt>Prioridades</dt>
                      <dd>{scenario.provenance.priority_criterion ?? "Sin criterio registrado"}</dd>
                      {scenario.provenance.fixture_seed != null && (
                        <>
                          <dt>Fixture</dt>
                          <dd>
                            Semilla del generador {scenario.provenance.fixture_seed} (independiente
                            de la semilla evolutiva)
                          </dd>
                        </>
                      )}
                      <dt>Licencia</dt>
                      <dd>{scenario.provenance.data_license ?? "No registrada"}</dd>
                    </dl>
                  </div>
                  {scenario.flags.structural_scarcity && (
                    <div className="card">
                      <h3>Demanda frente a lo entregable</h3>
                      <Meter
                        label="Máximo entregable sobre demanda total"
                        value={scenario.flags.structural_scarcity.max_deliverable}
                        max={scenario.flags.structural_scarcity.total_demand}
                        unit="lotes"
                      />
                      <p className="small muted">
                        Inventario {scenario.flags.structural_scarcity.inventory_lots} · capacidad
                        de flota {scenario.flags.structural_scarcity.fleet_capacity} lotes.
                      </p>
                    </div>
                  )}
                  <IssueList issues={scenario.warnings} tone="warn" />
                </div>
                <RouteMap
                  title="Ubicación de centros y depósito"
                  depot={scenario.scenario.depot}
                  centers={scenario.scenario.centers}
                  distanceMode={scenario.distance_mode}
                />
              </div>
            </section>
          )}
        </>
      )}

      {editing && (
        <section className="stack" aria-label="Asistente de escenario">
          <div className="section-title">
            <h2>Nuevo escenario</h2>
            <div className="row">
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setDraft(EMPTY_DRAFT);
                  setReport(null);
                  setStep(0);
                }}
              >
                Vaciar borrador
              </button>
              <button type="button" className="btn small" onClick={() => setEditing(false)}>
                Cerrar asistente
              </button>
            </div>
          </div>
          <ol className="stepper">
            {STEPS.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  aria-current={step === index ? "step" : undefined}
                  onClick={() => setStep(index)}
                >
                  <span className="step-n">{index + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <div className="stack">
              <div className="card">
                <h3>¿De dónde vienen los centros?</h3>
                <div className="row" style={{ alignItems: "flex-end" }}>
                  <Field label="Centros de la demo" hint="Entre 15 y 20, todos ficticios">
                    {(props) => (
                      <select
                        {...props}
                        className="select"
                        style={{ width: "7rem" }}
                        value={demoSize}
                        onChange={(e) => setDemoSize(Number(e.target.value))}
                      >
                        {[15, 16, 17, 18, 19, 20].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={loadDemo}
                    disabled={busy !== null}
                  >
                    <Icon name="flask" /> Cargar demo sintética
                  </button>
                  <button type="button" className="btn" onClick={() => setShowImport((v) => !v)}>
                    <Icon name="upload" /> Importar padrón (CSV/XLSX)
                  </button>
                  <label className="btn">
                    <Icon name="upload" /> Abrir escenario JSON
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="sr-only"
                      onChange={(e) => loadJson(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button type="button" className="btn" onClick={addCenter}>
                    <Icon name="plus" /> Agregar centro
                  </button>
                </div>
                <p className="small muted">
                  El MVP admite entre {limits?.min_centers ?? 5} y {limits?.max_centers ?? 50}{" "}
                  centros. La demo usa nombres «Centro ficticio NN»: no combina nombres reales con
                  coordenadas inventadas.
                </p>
              </div>
              {showImport && (
                <PadronImport
                  maxUploadMb={limits?.max_upload_mb ?? 5}
                  onImported={(centers, rule) => {
                    update({
                      centers,
                      data_origin: "mixed",
                      demand_rule: rule,
                      label: draft.label || "Padrón importado",
                    });
                    setShowImport(false);
                    setNotice(
                      `${centers.length} centros importados. Complete demanda, coordenadas o matriz vial, flota e inventario antes de validar.`,
                    );
                  }}
                />
              )}
              <CentersTable
                centers={draft.centers}
                rowIssues={rowIssues}
                validated={report !== null}
                coordsRequired={coordsRequired}
                onChange={changeCenter}
                onRemove={(index) =>
                  update({ centers: draft.centers.filter((_, i) => i !== index) })
                }
                onKeepOnly={(indices) => {
                  const keep = new Set(indices);
                  update({ centers: draft.centers.filter((_, i) => keep.has(i)) });
                }}
              />
            </div>
          )}

          {step === 1 && (
            <div className="cols">
              <div className="card">
                <h3>Depósito</h3>
                <p className="small muted">Origen y fin común de todas las rutas.</p>
                <div className="form-grid">
                  <Field label="ID del depósito" error={fieldError(depotIssues, "depot.id")}>
                    {(props) => (
                      <input
                        {...props}
                        className="input mono"
                        value={draft.depot.id}
                        onChange={(e) => update({ depot: { ...draft.depot, id: e.target.value } })}
                      />
                    )}
                  </Field>
                  <Field label="Nombre (opcional)">
                    {(props) => (
                      <input
                        {...props}
                        className="input"
                        value={draft.depot.name ?? ""}
                        onChange={(e) =>
                          update({ depot: { ...draft.depot, name: e.target.value || null } })
                        }
                      />
                    )}
                  </Field>
                  <Field
                    label="Latitud"
                    hint={
                      coordsRequired
                        ? "Obligatoria en modalidad Haversine"
                        : "Opcional con matriz vial"
                    }
                    error={fieldError(depotIssues, "depot.lat") ?? fieldError(depotIssues, "depot")}
                  >
                    {(props) => (
                      <input
                        {...props}
                        className="input mono"
                        type="number"
                        step="any"
                        value={draft.depot.lat ?? ""}
                        onChange={(e) =>
                          update({ depot: { ...draft.depot, lat: toNumber(e.target.value) } })
                        }
                      />
                    )}
                  </Field>
                  <Field label="Longitud" error={fieldError(depotIssues, "depot.lon")}>
                    {(props) => (
                      <input
                        {...props}
                        className="input mono"
                        type="number"
                        step="any"
                        value={draft.depot.lon ?? ""}
                        onChange={(e) =>
                          update({ depot: { ...draft.depot, lon: toNumber(e.target.value) } })
                        }
                      />
                    )}
                  </Field>
                </div>
              </div>
              <div className="card">
                <div className="card-title">
                  <h3>Vehículos</h3>
                  <span className="card-note">Capacidad total: {totals.fleet} lotes</span>
                </div>
                <p className="small muted">
                  Cada vehículo hace como máximo un recorrido. Un centro cuya demanda supere al
                  vehículo más grande solo recibe entrega parcial.
                </p>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th scope="col">ID</th>
                        <th scope="col" className="num">
                          Capacidad (lotes)
                        </th>
                        <th scope="col">
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.vehicles.map((vehicle, index) => {
                        const bad = fleetIssues.find(
                          (issue) => issue.field === `vehicles[${index}].capacity_lots`,
                        );
                        return (
                          <tr key={index} className={bad ? "row-error" : undefined}>
                            <td>
                              <input
                                className="cell-input mono"
                                aria-label={`ID del vehículo ${index + 1}`}
                                value={vehicle.id}
                                onChange={(e) =>
                                  update({
                                    vehicles: draft.vehicles.map((v, i) =>
                                      i === index ? { ...v, id: e.target.value } : v,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="cell-input num"
                                type="number"
                                min={1}
                                step={1}
                                aria-label={`Capacidad en lotes de ${vehicle.id || `vehículo ${index + 1}`}`}
                                aria-invalid={bad ? true : undefined}
                                value={vehicle.capacity_lots ?? ""}
                                onChange={(e) =>
                                  update({
                                    vehicles: draft.vehicles.map((v, i) =>
                                      i === index
                                        ? { ...v, capacity_lots: toNumber(e.target.value) }
                                        : v,
                                    ),
                                  })
                                }
                              />
                              {bad && (
                                <span className="field">
                                  <span className="error">{bad.message}</span>
                                </span>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn small ghost"
                                aria-label={`Quitar ${vehicle.id}`}
                                onClick={() =>
                                  update({ vehicles: draft.vehicles.filter((_, i) => i !== index) })
                                }
                              >
                                <Icon name="trash" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn small"
                    onClick={() =>
                      update({
                        vehicles: [
                          ...draft.vehicles,
                          {
                            id: nextId(
                              "V",
                              draft.vehicles.map((v) => v.id),
                            ),
                            capacity_lots: draft.vehicles.at(-1)?.capacity_lots ?? null,
                          },
                        ],
                      })
                    }
                  >
                    <Icon name="plus" /> Agregar vehículo
                  </button>
                </div>
                <IssueList
                  issues={fleetIssues.filter((i) => !/capacity_lots$/.test(i.field ?? ""))}
                  tone="error"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="cols">
              <div className="card">
                <h3>Inventario</h3>
                <Field
                  label="Inventario total B (lotes)"
                  hint="Lotes homogéneos de alimentos no perecibles disponibles en el depósito."
                  error={fieldError(errors, "inventory_lots")}
                >
                  {(props) => (
                    <input
                      {...props}
                      className="input mono"
                      type="number"
                      min={0}
                      step={1}
                      value={draft.inventory_lots ?? ""}
                      onChange={(e) => update({ inventory_lots: toNumber(e.target.value) })}
                    />
                  )}
                </Field>
                <Meter
                  label="Inventario sobre demanda total"
                  value={Math.min(draft.inventory_lots ?? 0, totals.demand)}
                  max={totals.demand}
                  unit="lotes"
                />
                <p className="small muted">
                  Demanda total {totals.demand} · inventario {draft.inventory_lots ?? "—"} ·
                  capacidad de flota {totals.fleet} lotes.
                  {totals.demand > Math.min(draft.inventory_lots ?? 0, totals.fleet) &&
                    " Habrá escasez estructural: parte de la demanda quedará sin cubrir."}
                </p>
              </div>
              <div className="card">
                <h3>Prioridades</h3>
                <p className="small muted">
                  La prioridad pᵢ (1–3) pertenece al centro, no a personas. Debe venir de un
                  criterio institucional documentado; si no existe, use prioridad uniforme.
                </p>
                <Field
                  label="Criterio de prioridad"
                  hint="Describa la regla auditable que justifica las prioridades 2 y 3."
                >
                  {(props) => (
                    <textarea
                      {...props}
                      className="input"
                      rows={3}
                      value={draft.priority_criterion ?? ""}
                      onChange={(e) => update({ priority_criterion: e.target.value || null })}
                    />
                  )}
                </Field>
                <div className="row">
                  <button
                    type="button"
                    className="btn small"
                    onClick={() =>
                      update({ centers: draft.centers.map((c) => ({ ...c, priority_weight: 1 })) })
                    }
                  >
                    Aplicar prioridad uniforme p = 1
                  </button>
                  <span className="small muted">
                    p=1: {draft.centers.filter((c) => c.priority_weight === 1).length} · p=2:{" "}
                    {draft.centers.filter((c) => c.priority_weight === 2).length} · p=3:{" "}
                    {draft.centers.filter((c) => c.priority_weight === 3).length}
                  </span>
                </div>
              </div>
              <div className="card">
                <h3>Regla declarada de demanda</h3>
                <p className="small muted">
                  Solo para centros con cifra agregada de usuarios. demanda = ⌈usuarios × raciones
                  por usuario / raciones por lote⌉. Toda demanda así obtenida se rotula «inferida».
                </p>
                <div className="form-grid">
                  <Field label="Raciones por usuario">
                    {(props) => (
                      <input
                        {...props}
                        className="input mono"
                        inputMode="decimal"
                        value={ruleUsers}
                        onChange={(e) => setRuleUsers(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Raciones por lote">
                    {(props) => (
                      <input
                        {...props}
                        className="input mono"
                        inputMode="decimal"
                        value={ruleLot}
                        onChange={(e) => setRuleLot(e.target.value)}
                      />
                    )}
                  </Field>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn small"
                    disabled={!draft.centers.some((c) => c.users_aggregate != null)}
                    onClick={applyDemandRule}
                  >
                    Aplicar a {draft.centers.filter((c) => c.users_aggregate != null).length}{" "}
                    centros con usuarios
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="stack">
              <div className="cols">
                <div className="card">
                  <h3>Modalidad de distancia</h3>
                  <p className="small muted">
                    Una sola modalidad por corrida: nunca se suman km viales con km en línea recta.
                  </p>
                  <label
                    className={`choice ${draft.distance_mode === "road_matrix" ? "selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="mode"
                      checked={draft.distance_mode === "road_matrix"}
                      onChange={() => update({ distance_mode: "road_matrix" })}
                    />
                    <span>
                      <strong>A · Matriz vial verificada (CSV)</strong>
                      <br />
                      <span className="small">
                        Km de carretera para todos los pares depósito/centro. Admite matrices
                        asimétricas.
                      </span>
                    </span>
                  </label>
                  <label className="choice disabled">
                    <input type="radio" name="mode" disabled />
                    <span>
                      <strong>B · Motor local de rutas</strong>
                      <br />
                      <span className="small">No instalado en este despliegue.</span>
                    </span>
                  </label>
                  <label
                    className={`choice ${draft.distance_mode === "haversine_demo" ? "selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="mode"
                      checked={draft.distance_mode === "haversine_demo"}
                      onChange={() =>
                        update({
                          distance_mode: "haversine_demo",
                          distances: [],
                          distance_source: null,
                        })
                      }
                    />
                    <span>
                      <strong>C · Línea recta (Haversine), solo simulación</strong>
                      <br />
                      <span className="small">
                        Km en línea recta calculados desde coordenadas; no aptos para planificación
                        de reparto.
                      </span>
                    </span>
                  </label>
                  {draft.distance_mode === "road_matrix" && (
                    <>
                      <Field
                        label="Archivo de matriz (CSV)"
                        hint="Formato largo «from_id,to_id,km» o matriz cuadrada con IDs en la primera fila y columna."
                        error={fieldError(errors, "distances")}
                      >
                        {(props) => (
                          <input
                            {...props}
                            className="input"
                            type="file"
                            accept=".csv,.txt"
                            onChange={(e) => uploadMatrix(e.target.files?.[0] ?? null)}
                          />
                        )}
                      </Field>
                      <p className="small mono">
                        {draft.distances.length > 0
                          ? `${draft.distances.length} distancias cargadas · ${draft.distance_source ?? ""}`
                          : "Sin matriz cargada"}
                      </p>
                    </>
                  )}
                </div>
                <div className="card">
                  <h3>Identificación y procedencia</h3>
                  <Field label="Nombre del escenario" error={fieldError(errors, "label")}>
                    {(props) => (
                      <input
                        {...props}
                        className="input"
                        value={draft.label}
                        onChange={(e) => update({ label: e.target.value })}
                      />
                    )}
                  </Field>
                  <div className="form-grid">
                    <Field
                      label="Identificador (opcional)"
                      hint="Letras, números, guiones y puntos"
                    >
                      {(props) => (
                        <input
                          {...props}
                          className="input mono"
                          value={draft.scenario_id ?? ""}
                          onChange={(e) => update({ scenario_id: e.target.value || null })}
                        />
                      )}
                    </Field>
                    <Field label="Origen de los datos">
                      {(props) => (
                        <select
                          {...props}
                          className="select"
                          value={draft.data_origin}
                          onChange={(e) => update({ data_origin: e.target.value as DataOrigin })}
                        >
                          <option value="synthetic">Sintético (simulación)</option>
                          <option value="declared">Declarado por el usuario</option>
                          <option value="official">Oficial</option>
                          <option value="mixed">Mixto</option>
                        </select>
                      )}
                    </Field>
                  </div>
                  <Field
                    label="Licencia y fecha de la fuente"
                    hint="Verifíquelas en la página oficial del conjunto de datos."
                  >
                    {(props) => (
                      <input
                        {...props}
                        className="input"
                        value={draft.data_license ?? ""}
                        onChange={(e) => update({ data_license: e.target.value || null })}
                      />
                    )}
                  </Field>
                  <Field label="Notas">
                    {(props) => (
                      <textarea
                        {...props}
                        className="input"
                        rows={2}
                        value={draft.notes ?? ""}
                        onChange={(e) => update({ notes: e.target.value || null })}
                      />
                    )}
                  </Field>
                </div>
              </div>

              <div className="card">
                <div className="card-title">
                  <h3>Validación</h3>
                  <div className="row">
                    <button
                      type="button"
                      className="btn"
                      onClick={validate}
                      disabled={busy !== null}
                    >
                      {busy === "validar" ? "Validando…" : "Validar escenario"}
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={save}
                      disabled={!report?.valid || busy !== null}
                    >
                      {busy === "guardar" ? "Guardando…" : "Guardar y activar"}
                    </button>
                  </div>
                </div>
                {!report && (
                  <p className="muted">
                    Valide el escenario para comprobar centros, flota, inventario y matriz. No se
                    puede ejecutar el AG sobre un escenario incompleto.
                  </p>
                )}
                {report && report.valid && (
                  <Callout tone="good" title="Escenario válido">
                    {report.summary.n_centers} centros · {report.summary.n_vehicles} vehículos ·{" "}
                    {report.summary.total_demand} lotes demandados · inventario{" "}
                    {report.summary.inventory_lots} · {report.summary.distance_mode_label}
                    {report.summary.matrix.symmetric === false && " · matriz asimétrica"}. Hash{" "}
                    <span className="mono">{shortHash(report.hash)}</span>.
                  </Callout>
                )}
                {report && !report.valid && (
                  <Callout
                    tone="error"
                    title={`${report.errors.length} error(es) bloquean el guardado`}
                  >
                    {rowIssues.size > 0 &&
                      `${rowIssues.size} fila(s) de centros tienen errores (paso 1). `}
                    Corrija y vuelva a validar.
                  </Callout>
                )}
                {report && <IssueList issues={otherIssues} tone="error" />}
                {report && rowIssues.size > 0 && (
                  <details className="table-twin">
                    <summary>
                      Ver errores por centro ({[...rowIssues.values()].flat().length})
                    </summary>
                    <IssueList issues={[...rowIssues.values()].flat()} tone="error" />
                  </details>
                )}
                {report && report.warnings.length > 0 && (
                  <>
                    <h4>Advertencias (no bloquean)</h4>
                    <IssueList issues={report.warnings} tone="warn" />
                  </>
                )}
                {report?.flags.structural_scarcity?.active && (
                  <Badge tone="sim">
                    <Icon name="warn" /> Escasez estructural: al menos{" "}
                    {num(report.flags.structural_scarcity.min_unmet_lots)} lotes sin cubrir
                  </Badge>
                )}
              </div>
            </div>
          )}

          <div className="row spread no-print">
            <button
              type="button"
              className="btn"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              Anterior
            </button>
            {step < STEPS.length - 1 && (
              <button type="button" className="btn primary" onClick={() => setStep(step + 1)}>
                Siguiente: {STEPS[step + 1]} <Icon name="arrow" />
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
