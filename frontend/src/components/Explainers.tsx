import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { Assignment, Center, Chromosome, Depot, GAParams, Route } from "../types";
import { num } from "../utils/format";
import { DASH_PATTERNS } from "./RouteMap";
import { Icon } from "./ui";

function Tok({ children, tone }: { children: ReactNode; tone?: "on" | "win" | "off" | "mix" }) {
  return <span className={`tok ${tone ?? ""}`}>{children}</span>;
}

function TokRow({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="tok-row">
      {label && <span className="tok-label">{label}</span>}
      <div className="tok-items">{children}</div>
    </div>
  );
}

export function Explainer({
  title,
  children,
  open,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="explainer" open={open}>
      <summary>
        <Icon name="info" /> {title}
      </summary>
      <div className="explainer-body">{children}</div>
    </details>
  );
}

export type OperatorKind =
  "poblacion" | "torneo" | "cruce" | "mutacion" | "elite" | "parada" | "pesos";

export function OperatorExample({ kind }: { kind: OperatorKind }) {
  if (kind === "poblacion") {
    return (
      <Explainer title="Ver cómo funciona">
        <ul className="plain small">
          <li>
            <b>Aleatorios:</b> orden de visita al azar y cantidades al azar, sin pasar de lo que
            pide cada centro.
          </li>
          <li>
            <b>Por prioridad:</b> los centros de prioridad 3 y 2 reciben cantidades más altas desde
            el principio.
          </li>
          <li>
            <b>Heurística:</b> parten de la línea base y se alteran un poco para no ser copias.
          </li>
        </ul>
        <p className="exp-caption">
          Todos se reparan y decodifican igual antes de evaluarse, para que sean comparables.
        </p>
      </Explainer>
    );
  }
  if (kind === "torneo") {
    return (
      <Explainer title="Ver cómo funciona">
        <TokRow label="Se sacan 3 al azar">
          <Tok>fitness 0,74</Tok>
          <Tok tone="win">fitness 0,79</Tok>
          <Tok>fitness 0,76</Tok>
        </TokRow>
        <p className="exp-caption">
          Gana el de mayor fitness y pasa a ser progenitor. Con un torneo mayor, los mejores se
          eligen más seguido y la población se parece más rápido.
        </p>
      </Explainer>
    );
  }
  if (kind === "cruce") {
    return (
      <Explainer title="Ver cómo funciona">
        <p className="small">Orden de visita (OX): el hijo hereda un tramo del padre A.</p>
        <TokRow label="Padre A">
          <Tok>C01</Tok>
          <Tok>C02</Tok>
          <Tok tone="on">C03</Tok>
          <Tok tone="on">C04</Tok>
          <Tok tone="on">C05</Tok>
          <Tok>C06</Tok>
          <Tok>C07</Tok>
          <Tok>C08</Tok>
        </TokRow>
        <TokRow label="Padre B">
          <Tok>C04</Tok>
          <Tok>C07</Tok>
          <Tok>C05</Tok>
          <Tok>C01</Tok>
          <Tok>C08</Tok>
          <Tok>C02</Tok>
          <Tok>C06</Tok>
          <Tok>C03</Tok>
        </TokRow>
        <TokRow label="Hijo">
          <Tok tone="mix">C01</Tok>
          <Tok tone="mix">C08</Tok>
          <Tok tone="on">C03</Tok>
          <Tok tone="on">C04</Tok>
          <Tok tone="on">C05</Tok>
          <Tok tone="mix">C02</Tok>
          <Tok tone="mix">C06</Tok>
          <Tok tone="mix">C07</Tok>
        </TokRow>
        <p className="small">Cantidades (uniforme): cada centro hereda su cantidad de un padre.</p>
        <TokRow label="Padre A">
          <Tok tone="on">8</Tok>
          <Tok>0</Tok>
          <Tok tone="on">11</Tok>
          <Tok>5</Tok>
        </TokRow>
        <TokRow label="Padre B">
          <Tok>6</Tok>
          <Tok tone="mix">3</Tok>
          <Tok>9</Tok>
          <Tok tone="mix">4</Tok>
        </TokRow>
        <TokRow label="Hijo">
          <Tok tone="on">8</Tok>
          <Tok tone="mix">3</Tok>
          <Tok tone="on">11</Tok>
          <Tok tone="mix">4</Tok>
        </TokRow>
        <p className="exp-caption">
          Azul: heredado del padre A. Naranja: heredado del padre B. Nunca se repite un centro.
          Ejemplo ilustrativo.
        </p>
      </Explainer>
    );
  }
  if (kind === "mutacion") {
    return (
      <Explainer title="Ver cómo funciona">
        <TokRow label="Original">
          <Tok>C01</Tok>
          <Tok>C02</Tok>
          <Tok>C03</Tok>
          <Tok>C04</Tok>
          <Tok>C05</Tok>
          <Tok>C06</Tok>
        </TokRow>
        <TokRow label="Intercambio">
          <Tok>C01</Tok>
          <Tok tone="mix">C05</Tok>
          <Tok>C03</Tok>
          <Tok>C04</Tok>
          <Tok tone="mix">C02</Tok>
          <Tok>C06</Tok>
        </TokRow>
        <TokRow label="Inversión">
          <Tok>C01</Tok>
          <Tok tone="mix">C05</Tok>
          <Tok tone="mix">C04</Tok>
          <Tok tone="mix">C03</Tok>
          <Tok tone="mix">C02</Tok>
          <Tok>C06</Tok>
        </TokRow>
        <p className="exp-caption">
          En las cantidades, un centro puede subir o bajar entre 1 y el paso máximo de lotes. Mutar
          sirve para explorar zonas que el cruce no alcanzaría. Ejemplo ilustrativo.
        </p>
      </Explainer>
    );
  }
  if (kind === "elite") {
    return (
      <Explainer title="Ver cómo funciona">
        <div className="elite-bar" role="img" aria-label="Dos copias élite y 98 hijos nuevos">
          <span className="elite-part elite" style={{ flexGrow: 2 }}>
            2
          </span>
          <span className="elite-part kids" style={{ flexGrow: 98 }}>
            98 hijos nuevos
          </span>
        </div>
        <p className="exp-caption">
          Las mejores soluciones pasan intactas a la siguiente generación, así el mejor fitness
          nunca baja. Ejemplo con población de 100 y élite de 2.
        </p>
      </Explainer>
    );
  }
  if (kind === "parada") {
    const heights = [26, 34, 44, 52, 52, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60];
    return (
      <Explainer title="Ver cómo funciona">
        <div className="stall" role="img" aria-label="El mejor fitness sube y luego se estanca">
          {heights.map((height, index) => (
            <span
              key={index}
              className={index >= 5 ? "flat" : ""}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        <p className="exp-caption">
          Barras: mejor fitness por generación. Si pasan varias generaciones seguidas sin una mejora
          relevante, el algoritmo se detiene antes del máximo. Es un ejemplo ilustrativo.
        </p>
      </Explainer>
    );
  }
  return (
    <Explainer title="Ver cómo funciona">
      <ul className="plain small">
        <li>
          Subir el peso de la <b>demanda</b> empuja a repartir más lotes aunque las rutas se
          alarguen.
        </li>
        <li>
          Subir el peso de la <b>distancia</b> acorta rutas aunque quede más demanda sin cubrir.
        </li>
        <li>
          Subir el peso de <b>prioridad alta</b> evita dejar sin entrega a los centros más urgentes.
        </li>
      </ul>
      <p className="exp-caption">Los pesos deben sumar 1. Cambiarlos produce repartos distintos.</p>
    </Explainer>
  );
}

const LOOP = [
  { title: "Población", note: (p: GAParams) => `${p.population_size} soluciones` },
  { title: "Evaluar", note: () => "se calcula su fitness" },
  { title: "Seleccionar", note: (p: GAParams) => `torneo de ${p.tournament_k}` },
  { title: "Cruzar", note: (p: GAParams) => `${num(p.crossover_prob * 100, 0)} % de las parejas` },
  { title: "Mutar", note: () => "cambios pequeños al azar" },
  { title: "Élite", note: (p: GAParams) => `${p.elite} mejores pasan intactas` },
];

export function EvolutionLoop({ params }: { params: GAParams }) {
  return (
    <Explainer title="Cómo evoluciona la población">
      <ol className="loop">
        {LOOP.map((step, index) => (
          <li key={step.title} style={{ "--i": index } as CSSProperties}>
            <span className="loop-n">{index + 1}</span>
            <b>{step.title}</b>
            <span>{step.note(params)}</span>
          </li>
        ))}
      </ol>
      <p className="exp-caption">
        Los pasos se repiten generación tras generación hasta llegar al máximo de{" "}
        {params.max_generations} o hasta que pasen {params.stagnation_generations} sin mejora.
      </p>
    </Explainer>
  );
}

export function DecodeSteps({
  chromosome,
  assignments,
  routes,
}: {
  chromosome: Chromosome;
  assignments: Assignment[];
  routes: Route[];
}) {
  const [step, setStep] = useState(0);
  const used = routes.filter((route) => route.used);
  const byId = new Map(assignments.map((a) => [a.center_id, a]));
  const vehicleIndex = new Map(routes.map((route, index) => [route.vehicle_id, index]));
  const steps = ["Cromosoma", "Descartar q = 0", "Repartir por capacidad", "Ordenar la ruta"];

  return (
    <Explainer title="Cómo se pasa del cromosoma a las rutas">
      <div className="chips" role="group" aria-label="Pasos de la decodificación">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            className="chip"
            aria-pressed={step === index}
            onClick={() => setStep(index)}
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>
      {step === 0 && (
        <>
          <TokRow label="Orden π y cantidad q">
            {chromosome.pi.map((id) => (
              <Tok key={id}>
                {id} · {chromosome.q[id] ?? 0}
              </Tok>
            ))}
          </TokRow>
          <p className="exp-caption">
            El cromosoma dice en qué orden se visitarían los centros y cuántos lotes recibiría cada
            uno. Todavía no sabe nada de vehículos.
          </p>
        </>
      )}
      {step === 1 && (
        <>
          <TokRow label="Se quedan">
            {chromosome.pi
              .filter((id) => (chromosome.q[id] ?? 0) > 0)
              .map((id) => (
                <Tok key={id} tone="on">
                  {id} · {chromosome.q[id]}
                </Tok>
              ))}
          </TokRow>
          <TokRow label="Se descartan">
            {chromosome.pi
              .filter((id) => (chromosome.q[id] ?? 0) === 0)
              .map((id) => (
                <Tok key={id} tone="off">
                  {id}
                </Tok>
              ))}
          </TokRow>
          <p className="exp-caption">
            Un centro con q = 0 no entra en ninguna ruta. Si alguna cantidad excede el inventario o
            la capacidad, se reduce antes de seguir (reparación).
          </p>
        </>
      )}
      {step === 2 && (
        <>
          <div className="bins">
            {used.map((route) => {
              const index = vehicleIndex.get(route.vehicle_id) ?? 0;
              return (
                <div key={route.vehicle_id} className={`bin veh-${index % 8}`}>
                  <span className="mono small">{route.vehicle_id}</span>
                  <div
                    className="bin-track"
                    role="img"
                    aria-label={`${route.vehicle_id}: ${route.load_lots} de ${route.capacity_lots} lotes`}
                  >
                    {route.stops.map((stop) => (
                      <span
                        key={stop.center_id}
                        className="bin-seg"
                        style={{ flexGrow: stop.lots }}
                        title={`${stop.center_id}: ${stop.lots} lotes`}
                      >
                        {stop.lots >= 6 ? stop.center_id : ""}
                      </span>
                    ))}
                    {route.capacity_lots > route.load_lots && (
                      <span
                        className="bin-free"
                        style={{ flexGrow: route.capacity_lots - route.load_lots }}
                      />
                    )}
                  </div>
                  <span className="mono small">
                    {route.load_lots}/{route.capacity_lots}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="exp-caption">
            Las entregas más grandes se acomodan primero en el primer vehículo donde caben. La suma
            de capacidades no basta: cada entrega debe caber entera en un vehículo.
          </p>
        </>
      )}
      {step === 3 && (
        <>
          <div className="stack" style={{ "--gap": "0.6rem" } as CSSProperties}>
            {used.map((route) => {
              const index = vehicleIndex.get(route.vehicle_id) ?? 0;
              return (
                <TokRow key={route.vehicle_id} label={route.vehicle_id}>
                  <Tok tone="off">DEPOT</Tok>
                  {route.stops.map((stop) => (
                    <span key={stop.center_id} className={`veh-${index % 8} tok-wrap`}>
                      <span className="tok-arrow">→</span>
                      <Tok tone="win">
                        {stop.center_id}
                        {byId.get(stop.center_id)
                          ? ` · p${byId.get(stop.center_id)?.priority_weight}`
                          : ""}
                      </Tok>
                    </span>
                  ))}
                  <span className="tok-arrow">→</span>
                  <Tok tone="off">DEPOT</Tok>
                </TokRow>
              );
            })}
          </div>
          <p className="exp-caption">
            Dentro de cada vehículo, los centros se visitan en el mismo orden relativo que tenían en
            π. Cada ruta sale del depósito y vuelve a él.
          </p>
        </>
      )}
    </Explainer>
  );
}

interface Point {
  x: number;
  y: number;
}

const VIEW = { w: 640, h: 400, pad: 44 };

export function RouteReplay({
  depot,
  centers,
  routes,
  assignments,
}: {
  depot: Depot;
  centers: Center[];
  routes: Route[];
  assignments: Assignment[];
}) {
  const used = routes.filter((route) => route.used);
  const [vehicle, setVehicle] = useState(used[0]?.vehicle_id ?? "");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const located = useMemo(
    () =>
      [depot, ...centers].filter((p) => typeof p.lat === "number" && typeof p.lon === "number") as {
        id: string;
        lat: number;
        lon: number;
      }[],
    [depot, centers],
  );

  const points = useMemo(() => {
    if (located.length === 0) return new Map<string, Point>();
    const midLat = located.reduce((sum, p) => sum + p.lat, 0) / located.length;
    const scale = Math.cos((midLat * Math.PI) / 180);
    const xs = located.map((p) => p.lon * scale);
    const ys = located.map((p) => -p.lat);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const k = Math.min(
      (VIEW.w - 2 * VIEW.pad) / Math.max(maxX - minX, 1e-9),
      (VIEW.h - 2 * VIEW.pad) / Math.max(maxY - minY, 1e-9),
    );
    const offsetX = (VIEW.w - (maxX - minX) * k) / 2;
    const offsetY = (VIEW.h - (maxY - minY) * k) / 2;
    return new Map(
      located.map((p, i) => [
        p.id,
        { x: offsetX + (xs[i] - minX) * k, y: offsetY + (ys[i] - minY) * k },
      ]),
    );
  }, [located]);

  const route = used.find((r) => r.vehicle_id === vehicle) ?? used[0];
  const index = route ? routes.findIndex((r) => r.vehicle_id === route.vehicle_id) : 0;
  const total = route ? route.stops.length + 1 : 0;
  const depotPoint = points.get(depot.id);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current >= total) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 1300);
    return () => window.clearInterval(timer);
  }, [playing, total]);

  if (!route || !depotPoint || points.size < 2) {
    return (
      <Explainer title="Recorrido paso a paso">
        <p className="small muted">
          El escenario no tiene coordenadas, así que no se puede dibujar el recorrido.
        </p>
      </Explainer>
    );
  }

  const sequence: Point[] = [
    depotPoint,
    ...route.stops.map((stop) => points.get(stop.center_id) ?? depotPoint),
    depotPoint,
  ];
  const here = sequence[Math.min(step, sequence.length - 1)];
  const delivered = route.stops.slice(0, Math.min(step, route.stops.length));
  const load = delivered.reduce((sum, stop) => sum + stop.lots, 0);
  const onRoad = route.stops.reduce((sum, stop) => sum + stop.lots, 0);
  const current = step >= 1 && step <= route.stops.length ? route.stops[step - 1] : null;
  const pattern = DASH_PATTERNS[index % DASH_PATTERNS.length];
  const done = sequence.slice(0, Math.min(step, sequence.length - 1) + 1);
  const toPath = (list: Point[]) =>
    list.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");

  let message = `Sale del depósito con ${onRoad} lotes.`;
  if (current) {
    message = `Parada ${step} de ${route.stops.length}: ${current.center_id} recibe ${current.lots} lotes. Ya entregó ${load} de ${onRoad}.`;
  } else if (step > route.stops.length) {
    message = `Entregó ${onRoad} lotes y regresa al depósito.`;
  }

  return (
    <Explainer title="Recorrido paso a paso">
      <div className="chips" role="group" aria-label="Vehículo">
        {used.map((r) => (
          <button
            key={r.vehicle_id}
            type="button"
            className="chip"
            aria-pressed={r.vehicle_id === route.vehicle_id}
            onClick={() => {
              setVehicle(r.vehicle_id);
              setStep(0);
              setPlaying(false);
            }}
          >
            {r.vehicle_id}
          </button>
        ))}
      </div>
      <div className={`replay veh-${index % 8}`}>
        <svg
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          role="img"
          aria-label={`Recorrido del vehículo ${route.vehicle_id}`}
        >
          {used
            .filter((r) => r.vehicle_id !== route.vehicle_id)
            .map((r) => (
              <path
                key={r.vehicle_id}
                d={toPath([
                  depotPoint,
                  ...r.stops.map((s) => points.get(s.center_id) ?? depotPoint),
                  depotPoint,
                ])}
                className="replay-other"
              />
            ))}
          <path d={toPath(sequence)} className="replay-plan" strokeDasharray={pattern} />
          <path d={toPath(done)} className="replay-done" />
          {centers.map((c) => {
            const p = points.get(c.id);
            if (!p) return null;
            const order = route.stops.findIndex((s) => s.center_id === c.id);
            const served = assignments.some((a) => a.center_id === c.id && a.assigned_lots > 0);
            return (
              <g key={c.id} transform={`translate(${p.x} ${p.y})`}>
                <circle
                  r={order >= 0 ? 11 : 6}
                  className={
                    order >= 0
                      ? order < step
                        ? "replay-stop visited"
                        : "replay-stop"
                      : served
                        ? "replay-other-dot"
                        : "replay-idle"
                  }
                />
                {order >= 0 && (
                  <text className="replay-n" y="4" textAnchor="middle">
                    {order + 1}
                  </text>
                )}
                <text className="replay-id" y={order >= 0 ? -16 : -11} textAnchor="middle">
                  {c.id}
                </text>
              </g>
            );
          })}
          <g transform={`translate(${depotPoint.x - 11} ${depotPoint.y - 11})`}>
            <rect width="22" height="22" rx="4" className="replay-depot" />
            <text x="11" y="15.5" textAnchor="middle" className="replay-depot-t">
              D
            </text>
          </g>
          <g className="replay-truck" style={{ transform: `translate(${here.x}px, ${here.y}px)` }}>
            <circle r="9" />
            <text y="3.5" textAnchor="middle">
              {route.vehicle_id.replace(/\D/g, "") || "V"}
            </text>
          </g>
        </svg>
      </div>
      <p className="replay-msg" aria-live="polite">
        {message}
      </p>
      <div className="row no-print">
        <button
          type="button"
          className="btn small"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Anterior
        </button>
        <button
          type="button"
          className="btn small primary"
          onClick={() => {
            if (!playing && step >= total) setStep(0);
            setPlaying((value) => !value);
          }}
        >
          <Icon name={playing ? "pause" : "play"} /> {playing ? "Pausar" : "Reproducir"}
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => setStep((s) => Math.min(total, s + 1))}
          disabled={step >= total}
        >
          Siguiente
        </button>
        <span className="small muted">
          Esquema con coordenadas; las líneas no siguen las calles.
        </span>
      </div>
    </Explainer>
  );
}
