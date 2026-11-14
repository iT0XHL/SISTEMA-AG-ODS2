import { Link } from "react-router-dom";
import { PageHead } from "../components/ui";

interface Term {
  term: string;
  definition: string;
  inApp: string;
  module: string;
  link: { to: string; label: string };
}

const TERMS: Term[] = [
  {
    term: "Cromosoma",
    definition:
      "Codificación de una solución completa. Aquí es híbrido: C = (π, q), con π una permutación de los centros (orden global de visita) y q un vector de enteros (lotes por centro). No es binario porque las variables son un orden y unas cantidades.",
    inApp: "El mejor cromosoma de cada corrida se muestra como dos tiras de genes.",
    module: "app/ga/chromosome.py",
    link: { to: "/resultados", label: "Ver en Resultados → Asignación" },
  },
  {
    term: "Gen",
    definition:
      "Cada posición del cromosoma. En π, un gen es el ID de un centro; en q, el gen del centro i es la cantidad qᵢ. El índice de q es el centro, no la posición en π: por eso cruzar o mutar π no desordena las cantidades.",
    inApp: "Cada casilla de las tiras π y q es un gen.",
    module: "app/ga/chromosome.py",
    link: { to: "/resultados", label: "Ver en Resultados → Asignación" },
  },
  {
    term: "Decodificación",
    definition:
      "Paso del genotipo al plan operativo (fenotipo): reparar cantidades, empaquetar entregas por capacidad (mayor primero, desempate por posición en π), ordenar cada vehículo con el suborden de π y sumar distancias depósito → centros → depósito.",
    inApp: "Las hojas de ruta y el mapa son el cromosoma decodificado.",
    module: "app/ga/decoder.py",
    link: { to: "/resultados", label: "Ver en Resultados → Rutas" },
  },
  {
    term: "Reparación",
    definition:
      "Corrección que garantiza restricciones duras antes de evaluar: recorta qᵢ a [0, min(dᵢ, máx Cᵥ)] y, si se excede el inventario o la flota, retira lotes del centro de menor prioridad. Cada lote retirado queda registrado.",
    inApp: "El registro de reparación acompaña a cada solución.",
    module: "app/ga/repair.py",
    link: { to: "/resultados", label: "Ver en Resultados → Evidencia" },
  },
  {
    term: "Función fitness",
    definition:
      "Medida de aptitud. Se minimiza J = 0,75·U + 0,20·R + 0,05·H (demanda ponderada no cubierta, distancia relativa y centros de prioridad alta sin entrega) y se maximiza fitness = 1 / (1 + J), siempre positivo. Se calcula después de reparar y decodificar.",
    inApp: "KPI «Fitness» y descomposición de J frente a la línea base.",
    module: "app/ga/fitness.py",
    link: { to: "/", label: "Ver la fórmula en Inicio" },
  },
  {
    term: "Población",
    definition:
      "Conjunto de cromosomas de una generación. La inicial P(0) tiene 100 individuos: 70 % aleatorios, 20 % sesgados por prioridad y 10 % derivados de la heurística perturbada, para empezar con diversidad.",
    inApp: "Tarjeta «Población inicial» y gráfico de diversidad.",
    module: "app/ga/initialization.py",
    link: { to: "/configuracion", label: "Ver en Configuración AG" },
  },
  {
    term: "Selección por torneo",
    definition:
      "Se extraen k = 3 individuos al azar y el de mayor fitness pasa a ser progenitor. El tamaño del torneo regula la presión selectiva. A diferencia de la ruleta, no depende de la magnitud relativa del fitness.",
    inApp: "Tarjeta «Selección por torneo».",
    module: "app/ga/selection.py",
    link: { to: "/configuracion", label: "Ver en Configuración AG" },
  },
  {
    term: "Cruce OX (Order Crossover)",
    definition:
      "Operador para permutaciones: el hijo conserva una subcadena de un padre y completa el resto con los centros del otro en su orden relativo, sin duplicar ninguno. Para q se usa cruce uniforme gen por gen. Ambos ocurren en el mismo evento, con probabilidad 0,90.",
    inApp: "Tarjeta «Cruce: OX + uniforme».",
    module: "app/ga/crossover.py",
    link: { to: "/configuracion", label: "Ver en Configuración AG" },
  },
  {
    term: "Mutación",
    definition:
      "Variación aleatoria que explora regiones nuevas. En π: intercambio de dos centros o inversión de una subcadena (0,15 por individuo). En q: ±1 a ±3 lotes por gen (0,08 por gen), saturado al dominio.",
    inApp: "Tarjeta «Mutación».",
    module: "app/ga/mutation.py",
    link: { to: "/configuracion", label: "Ver en Configuración AG" },
  },
  {
    term: "Elitismo",
    definition:
      "Las 2 mejores soluciones de cada generación pasan intactas a la siguiente. Evita perder lo mejor hallado; no garantiza el óptimo global. Por eso la curva del mejor fitness nunca baja.",
    inApp: "Curva «Mejor fitness» en Ejecución.",
    module: "app/ga/evolution.py",
    link: { to: "/ejecucion", label: "Ver en Ejecución" },
  },
  {
    term: "Línea base y D_ref",
    definition:
      "Heurística determinista de comparación: atiende por prioridad descendente, asigna hasta capacidad e inventario y ordena cada ruta por vecino más cercano. Su distancia es D_ref, que normaliza R y se calcula una sola vez por escenario.",
    inApp: "Tabla «AG frente a la línea base».",
    module: "app/baselines/priority_greedy.py",
    link: { to: "/resultados", label: "Ver en Resultados" },
  },
  {
    term: "Semilla y reproducibilidad",
    definition:
      "Un único generador PCG64 inicializado con la semilla alimenta todo el flujo. Mismo escenario, semilla, parámetros y versión producen el mismo historial y el mismo cromosoma. Las cuatro corridas oficiales usan 11, 22, 33 y 44.",
    inApp: "Tabla de cuatro corridas con hash de escenario y versión.",
    module: "app/ga/evolution.py",
    link: { to: "/cuatro-corridas", label: "Ver en Cuatro corridas" },
  },
];

export function GlossaryPage() {
  return (
    <>
      <PageHead step="Referencia" title="Glosario académico">
        Conceptos de algoritmos genéticos del material del curso (R. Delgadillo) y del informe,
        enlazados con el lugar de la aplicación donde se observan y con el módulo del backend que
        los implementa.
      </PageHead>
      <div className="glossary">
        {TERMS.map((item) => (
          <article className="card term" key={item.term}>
            <dfn>{item.term}</dfn>
            <p>{item.definition}</p>
            <p className="small muted">
              En la aplicación: {item.inApp}
              <br />
              Código: <code>{item.module}</code>
            </p>
            <Link to={item.link.to}>{item.link.label}</Link>
          </article>
        ))}
      </div>
    </>
  );
}
