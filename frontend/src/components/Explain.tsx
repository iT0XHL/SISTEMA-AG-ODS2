import { Link } from "react-router-dom";
import type { Experiment, Solution } from "../types";
import { explainExperiment, explainSolution } from "../utils/explain";
import { Icon } from "./ui";

export function ExplainSummary({ solution }: { solution: Solution }) {
  const e = explainSolution(solution);
  return (
    <div className="stack" style={{ "--gap": "0.7rem" } as React.CSSProperties}>
      <h3>En pocas palabras</h3>
      <p>{e.headline}</p>
      {e.gains.length + e.losses.length > 0 && (
        <p className="small muted">
          Frente a la línea base:
          {e.gains.length > 0 && ` a favor, ${e.gains.join("; ").toLowerCase()}.`}
          {e.losses.length > 0 && ` En contra, ${e.losses.join("; ").toLowerCase()}.`}
        </p>
      )}
      <p className="small muted">{e.prioritySentence}</p>
    </div>
  );
}

export function ExplainPanel({ solution }: { solution: Solution }) {
  const e = explainSolution(solution);
  return (
    <div className="stack" style={{ "--gap": "1.25rem" } as React.CSSProperties}>
      <div className="split even">
        <section className="card">
          <h3>Qué hizo el algoritmo</h3>
          <p>{e.headline}</p>
          <ul className="plain small">
            {e.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3>A quién atendió primero</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Prioridad</th>
                  <th scope="col" className="num">
                    Centros
                  </th>
                  <th scope="col" className="num">
                    Completos
                  </th>
                  <th scope="col" className="num">
                    Parciales
                  </th>
                  <th scope="col" className="num">
                    Sin entrega
                  </th>
                  <th scope="col" className="num">
                    Lotes
                  </th>
                </tr>
              </thead>
              <tbody>
                {e.priorities.map((row) => (
                  <tr key={row.priority}>
                    <th scope="row">
                      <span className={`prio p${row.priority}`}>{row.priority}</span> {row.label}
                    </th>
                    <td className="num">{row.centers}</td>
                    <td className="num">{row.complete}</td>
                    <td className="num">{row.partial}</td>
                    <td className="num">{row.none}</td>
                    <td className="num">
                      {row.delivered}/{row.demanded}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small">{e.prioritySentence}</p>
        </section>
      </div>

      <section className="card">
        <h3>Frente a la línea base</h3>
        <p className="small muted">
          La línea base es un reparto simple: atiende por prioridad y ordena cada ruta por el vecino
          más cercano.
        </p>
        <div className="split even">
          <div className="gain-list good">
            <b>
              <Icon name="check" /> Gana
            </b>
            {e.gains.length === 0 ? (
              <span className="muted small">Nada que destacar.</span>
            ) : (
              <ul className="plain">
                {e.gains.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="gain-list bad">
            <b>
              <Icon name="warn" /> Cede
            </b>
            {e.losses.length === 0 ? (
              <span className="muted small">Nada que ceder.</span>
            ) : (
              <ul className="plain">
                {e.losses.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="small">{e.weights}</p>
      </section>

      {e.notes.length > 0 && (
        <section className="card">
          <h3>Centros que no recibieron todo</h3>
          <ul className="note-list">
            {e.notes.map((note) => (
              <li key={note.id}>
                <span className="mono">{note.id}</span>
                <span className={`prio p${note.priority}`} title={`Prioridad ${note.priority}`}>
                  {note.priority}
                </span>
                <span>{note.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="split even">
        <section className="card">
          <h3>¿Es la mejor solución posible?</h3>
          <p className="small">{e.reliability}</p>
          <Link to="/cuatro-corridas">Comparar con las cuatro corridas</Link>
        </section>
        <section className="card">
          <h3>Cómo leer los números</h3>
          <dl className="io-list">
            <dt>Lote</dt>
            <dd>Unidad de reparto; no es una persona.</dd>
            <dt>Cobertura ponderada</dt>
            <dd>Parte de la demanda atendida, dando más peso a los centros de prioridad alta.</dd>
            <dt>J</dt>
            <dd>
              Puntaje total del reparto. Menor es mejor; sirve para comparar, no tiene unidad.
            </dd>
            <dt>Distancia</dt>
            <dd>Km en línea recta; no son kilómetros de carretera.</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}

export function ExplainRuns({ experiment }: { experiment: Experiment }) {
  const lines = explainExperiment(experiment);
  if (lines.length === 0) return null;
  return (
    <section className="card">
      <h3>Qué significan estas corridas</h3>
      <ul className="plain">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
