import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Callout, Icon } from "../components/ui";
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
        <div className="stack">
          <div className="row">
            <Badge tone="ods">ODS 2 · Meta 2.1</Badge>
            <Badge tone="sim">
              <Icon name="flask" /> Simulación académica
            </Badge>
          </div>
          <h1>¿Cuántos lotes lleva cada vehículo, a qué comedor y en qué orden?</h1>
          <p className="hero-lead">
            NutriRuta AG usa un algoritmo genético para repartir un inventario limitado de lotes de
            alimentos entre comedores populares y ollas comunes, y para ordenar las entregas de cada
            vehículo. Busca reducir a la vez la demanda ponderada que queda sin cubrir y la
            distancia recorrida.
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
        <div className="stack">
          <span className="eyebrow">Función objetivo del modelo</span>
          <div
            className="formula"
            role="img"
            aria-label="J igual a 0,75 por U más 0,20 por R más 0,05 por H; fitness igual a 1 sobre 1 más J"
          >
            {
              "U = Σ pᵢ·(dᵢ − qᵢ) / max(1, Σ pᵢ·dᵢ)\nR = km totales / D_ref\nH = centros p=3 sin entrega / centros p=3\n\nminimizar  J = 0,75·U + 0,20·R + 0,05·H\nmaximizar  fitness = 1 / (1 + J)"
            }
          </div>
          <p className="small muted">
            Los pesos 0,75 / 0,20 / 0,05 son parámetros experimentales de demostración, no valores
            institucionales.
          </p>
        </div>
      </section>

      <div className="cols">
        <section className="card">
          <h2>Qué entra</h2>
          <dl className="io-list">
            <dt>n centros</dt>
            <dd>Comedores u ollas comunes, cada uno con un ID único.</dd>
            <dt>dᵢ</dt>
            <dd>Demanda de cada centro, en lotes por período.</dd>
            <dt>pᵢ</dt>
            <dd>Prioridad del centro (1 a 3), con criterio institucional documentado.</dd>
            <dt>B</dt>
            <dd>Inventario total de lotes homogéneos no perecibles.</dd>
            <dt>m, Cᵥ</dt>
            <dd>Vehículos y su capacidad en lotes.</dd>
            <dt>D</dt>
            <dd>Matriz de distancias en km, de una sola modalidad por corrida.</dd>
          </dl>
        </section>
        <section className="card">
          <h2>Qué sale</h2>
          <dl className="io-list">
            <dt>qᵢ</dt>
            <dd>Lotes asignados a cada centro (entrega parcial si el stock no alcanza).</dd>
            <dt>Rutas</dt>
            <dd>Por vehículo: depósito → centros en orden → depósito.</dd>
            <dt>J, fitness</dt>
            <dd>Calidad de la solución, comparada con una línea base heurística.</dd>
            <dt>Evolución</dt>
            <dd>Mejor fitness, fitness promedio y diversidad por generación.</dd>
            <dt>Validación</dt>
            <dd>Comprobación desde cero de inventario, capacidades y visitas únicas.</dd>
          </dl>
        </section>
        <section className="card">
          <h2>Demostración en 5 minutos</h2>
          <ol className="flow">
            <li>Cargar el escenario demo y revisar entradas y restricciones.</li>
            <li>Ejecutar el AG con la semilla 11 y observar la mejora del fitness.</li>
            <li>Inspeccionar el cromosoma y su decodificación en rutas.</li>
            <li>Comparar el AG con la regla heurística de línea base.</li>
            <li>Lanzar las cuatro corridas (semillas 11, 22, 33 y 44).</li>
            <li>Exportar la evidencia en CSV y JSON.</li>
          </ol>
        </section>
      </div>

      <section className="stack">
        <div className="section-title">
          <h2>Límites del prototipo</h2>
          <Link to="/glosario">Ver glosario académico</Link>
        </div>
        <div className="cols">
          <Callout tone="warn" title="La unidad es el lote, no la persona">
            El programa no mide hambre, estado nutricional ni personas alimentadas. Un número de
            usuarios solo sirve para estimar demanda si se declara la regla de conversión.
          </Callout>
          <Callout tone="warn" title="Sin datos personales">
            El padrón municipal enumera DNI, nombres de personas y sexo: la aplicación no los
            importa, muestra ni almacena, y no los usa para priorizar.
          </Callout>
          <Callout tone="warn" title="Distancias en línea recta = simulación">
            Los km Haversine no son aptos para planificar repartos. Las conclusiones operativas
            exigen una matriz vial verificada; nunca se mezclan ambas modalidades.
          </Callout>
          <Callout tone="info" title="Apoyo a la decisión, no decisión autónoma">
            No es un sistema oficial de despacho. Las entregas reales requieren validación
            institucional y controles sanitarios y operativos ajenos a este prototipo.
          </Callout>
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
