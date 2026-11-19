import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeroArt } from "../components/HeroArt";
import { Badge, Callout, Icon, StackBar, type IconName } from "../components/ui";
import { useStore } from "../features/store";
import { api, errorMessage } from "../services/api";

const SOURCES = [
  {
    name: "Naciones Unidas — ODS 2, meta 2.1",
    url: "https://sdgs.un.org/goals/goal2",
    yes: "La pertinencia del acceso a alimentos inocuos, nutritivos y suficientes.",
    no: "Que mejorar rutas mida una reducción del hambre.",
  },
  {
    name: "Programa Mundial de Alimentos — Perú",
    url: "https://es.wfp.org/paises/peru",
    yes: "El contexto nacional: 51,7 % de inseguridad alimentaria moderada o grave en 2024.",
    no: "La demanda de centros específicos de Cañete.",
  },
  {
    name: "Defensoría del Pueblo (2025) — Informe Defensorial 242",
    url: "https://www.defensoria.gob.pe/wp-content/uploads/2025/04/id_crisis_alimentaria-2-1.pdf",
    yes: "Problemas de gestión y abastecimiento de comedores y ollas comunes.",
    no: "Que una ruta concreta sea deficiente sin medición.",
  },
  {
    name: "Municipalidad Provincial de Cañete (2026) — padrón",
    url: "https://www.datosabiertos.gob.pe/dataset/comedores-populares-y-ollas-comunes-de-la-provincia-de-ca%C3%B1ete-mpc",
    yes: "Nombres y direcciones institucionales de centros registrados.",
    no: "Coordenadas verificadas, demanda por período, stock ni distancias viales.",
  },
];

const JOURNEY: { to: string; title: string; text: string }[] = [
  {
    to: "/escenario",
    title: "Escenario",
    text: "Centros, depósito, flota, inventario y distancias.",
  },
  {
    to: "/configuracion",
    title: "Configuración",
    text: "Preset estándar o parámetros propios del AG.",
  },
  {
    to: "/ejecucion",
    title: "Ejecución",
    text: "Evolución del fitness generación a generación.",
  },
  {
    to: "/resultados",
    title: "Resultados",
    text: "Asignación, rutas y comparación con la línea base.",
  },
  {
    to: "/cuatro-corridas",
    title: "Cuatro corridas",
    text: "Semillas 11, 22, 33 y 44 y exportación de evidencia.",
  },
];

const LIMITS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "box",
    title: "La unidad es el lote",
    text: "El programa no mide hambre ni personas alimentadas.",
  },
  {
    icon: "shield",
    title: "Sin datos personales",
    text: "DNI, nombres y sexo del padrón no se importan ni se usan.",
  },
  {
    icon: "map",
    title: "Km en línea recta",
    text: "Haversine es simulación; decidir exige una matriz vial verificada.",
  },
  {
    icon: "info",
    title: "Apoyo, no despacho oficial",
    text: "Cualquier uso real requiere validación institucional.",
  },
];

export function HomePage() {
  const { selectScenario, scenario } = useStore();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function quickDemo() {
    setBusy(true);
    setError(null);
    try {
      const demo = await api.demoScenario();
      const created = await api.createScenario(demo);
      selectScenario(created.id);
      navigate("/configuracion");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <div className="stack" style={{ "--gap": "1.1rem" } as React.CSSProperties}>
          <div className="row">
            <Badge tone="ods">ODS 2 · Meta 2.1</Badge>
            <Badge tone="sim">
              <Icon name="flask" /> Simulación académica
            </Badge>
          </div>
          <h1>¿Cuántos lotes lleva cada vehículo, a qué comedor y en qué orden?</h1>
          <p className="hero-lead">
            NutriRuta AG reparte un inventario limitado de alimentos entre comedores populares y
            ollas comunes, y ordena la ruta de cada vehículo con un algoritmo genético. Reduce a la
            vez la demanda sin cubrir y los kilómetros recorridos.
          </p>
          <div className="row">
            <Link className="btn primary" to="/escenario">
              Crear escenario <Icon name="arrow" />
            </Link>
            <button type="button" className="btn" onClick={quickDemo} disabled={busy}>
              <Icon name="flask" /> {busy ? "Preparando la demo…" : "Usar el escenario demo"}
            </button>
            {scenario && (
              <Link className="btn ghost" to="/configuracion">
                Continuar con «{scenario.label}»
              </Link>
            )}
          </div>
          {error && (
            <Callout tone="error" title="No se pudo preparar la demo">
              {error}
            </Callout>
          )}
        </div>
        <HeroArt />
      </section>

      <section className="stack" aria-label="Escenario de demostración">
        <div className="facts">
          <div className="fact">
            <b>18</b>
            <span>centros ficticios en Cañete</span>
          </div>
          <div className="fact">
            <b>3 × 50</b>
            <span>vehículos y su capacidad en lotes</span>
          </div>
          <div className="fact">
            <b>135</b>
            <span>lotes en inventario</span>
          </div>
          <div className="fact">
            <b>181</b>
            <span>lotes demandados: faltan 46</span>
          </div>
        </div>
      </section>

      <section className="stack">
        <div className="section-title">
          <h2>Recorrido de la demostración</h2>
        </div>
        <ol className="journey">
          {JOURNEY.map((item) => (
            <li key={item.to}>
              <Link to={item.to}>
                <span className="stop-dot" aria-hidden="true" />
                <strong>{item.title}</strong>
                <span className="j-text">{item.text}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="stack">
        <div className="section-title">
          <h2>Cómo funciona</h2>
          <Link to="/glosario">Glosario académico</Link>
        </div>
        <div className="pipeline">
          <div className="card pipe-col">
            <h3>
              <Icon name="box" /> Entradas
            </h3>
            <ul className="token-list">
              <li>
                <code>n, dᵢ</code>
                <span>Centros y su demanda en lotes</span>
              </li>
              <li>
                <code>pᵢ</code>
                <span>Prioridad de 1 a 3</span>
              </li>
              <li>
                <code>B</code>
                <span>Inventario total</span>
              </li>
              <li>
                <code>m, Cᵥ</code>
                <span>Vehículos y capacidad</span>
              </li>
              <li>
                <code>D</code>
                <span>Matriz de km, una sola modalidad</span>
              </li>
            </ul>
          </div>
          <div className="pipe-arrow" aria-hidden="true">
            <Icon name="arrow" />
          </div>
          <div className="card pipe-col">
            <h3>
              <Icon name="layers" /> Algoritmo genético
            </h3>
            <ul className="token-list">
              <li>
                <code>(π, q)</code>
                <span>Orden de visita y lotes por centro</span>
              </li>
              <li>
                <code>P(0)</code>
                <span>100 individuos con tres estrategias</span>
              </li>
              <li>
                <code>Torneo</code>
                <span>k = 3 para elegir progenitores</span>
              </li>
              <li>
                <code>OX + unif.</code>
                <span>Cruce de π y de q</span>
              </li>
              <li>
                <code>Élite</code>
                <span>Las 2 mejores pasan intactas</span>
              </li>
            </ul>
          </div>
          <div className="pipe-arrow" aria-hidden="true">
            <Icon name="arrow" />
          </div>
          <div className="card pipe-col">
            <h3>
              <Icon name="target" /> Salidas
            </h3>
            <ul className="token-list">
              <li>
                <code>qᵢ</code>
                <span>Lotes entregados a cada centro</span>
              </li>
              <li>
                <code>Rutas</code>
                <span>Depósito → centros → depósito</span>
              </li>
              <li>
                <code>J</code>
                <span>Calidad frente a la línea base</span>
              </li>
              <li>
                <code>Curvas</code>
                <span>Fitness y diversidad por generación</span>
              </li>
              <li>
                <code>Validación</code>
                <span>Restricciones comprobadas desde cero</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="split even">
        <div className="card">
          <div className="card-title">
            <h3>Cómo se decide qué reparto es mejor</h3>
          </div>
          <p className="small muted">
            El algoritmo busca el reparto con el menor puntaje J. Cuenta sobre todo los lotes sin
            cubrir, después los kilómetros y, por último, los centros de prioridad alta que se
            quedan sin entrega. Estos pesos son de demostración, no institucionales.
          </p>
          <StackBar
            caption="Pesos de J: 0,75 demanda no cubierta, 0,20 distancia, 0,05 prioridad alta sin entrega"
            parts={[
              {
                key: "u",
                label: "U · demanda",
                value: 0.75,
                color: "var(--series-1)",
                text: "0,75",
              },
              {
                key: "r",
                label: "R · distancia",
                value: 0.2,
                color: "var(--series-2)",
                text: "0,20",
              },
              {
                key: "h",
                label: "H · prioridad alta",
                value: 0.05,
                color: "var(--series-3)",
                text: "0,05",
              },
            ]}
          />
          <details className="explainer">
            <summary>
              <Icon name="info" /> Ver la fórmula
            </summary>
            <div className="explainer-body">
              <div
                className="formula"
                role="img"
                aria-label="J igual a 0,75 por U más 0,20 por R más 0,05 por H; fitness igual a 1 sobre 1 más J"
              >
                {
                  "U = Σ pᵢ·(dᵢ − qᵢ) / max(1, Σ pᵢ·dᵢ)\nR = km totales / D_ref\nH = centros p=3 sin entrega / centros p=3\n\nminimizar  J = 0,75·U + 0,20·R + 0,05·H\nmaximizar  fitness = 1 / (1 + J)"
                }
              </div>
            </div>
          </details>
        </div>
        <div className="stack">
          <div className="section-title">
            <h3>Alcance</h3>
          </div>
          <div className="limits">
            {LIMITS.map((item) => (
              <div className="limit" key={item.title}>
                <Icon name={item.icon} />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="stack">
        <div className="section-title">
          <h2>Qué sustenta cada fuente</h2>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Fuente</th>
                <th scope="col">Sí justifica</th>
                <th scope="col">No justifica</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((source) => (
                <tr key={source.url}>
                  <th scope="row" className="wrap" style={{ fontWeight: 500 }}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.name}
                    </a>
                  </th>
                  <td className="wrap">{source.yes}</td>
                  <td className="wrap">{source.no}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
