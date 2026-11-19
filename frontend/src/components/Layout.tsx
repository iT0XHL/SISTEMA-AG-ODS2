import { useEffect, useState, type CSSProperties } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../features/auth";
import { useStore, type Theme } from "../features/store";
import { Callout, Icon } from "./ui";

const FLOW = [
  { to: "/", label: "Inicio · ODS 2", step: "1", end: true },
  { to: "/escenario", label: "Escenario", step: "2" },
  { to: "/configuracion", label: "Configuración AG", step: "3" },
  { to: "/ejecucion", label: "Ejecución", step: "4" },
  { to: "/resultados", label: "Resultados", step: "5" },
  { to: "/cuatro-corridas", label: "Cuatro corridas", step: "6" },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
];

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="9" fill="var(--nav-active)" />
      <path
        d="M8 25 L15 11 L21.5 21.5 L28 10"
        fill="none"
        stroke="var(--ods)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="5.2" y="22.2" width="5.6" height="5.6" rx="1" fill="var(--nav-ink)" />
      <circle cx="15" cy="11" r="2.6" fill="#5598e7" />
      <circle cx="21.5" cy="21.5" r="2.6" fill="#5598e7" />
      <circle cx="28" cy="10" r="2.6" fill="#5598e7" />
    </svg>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { meta, metaError, scenario, runId, experimentId, theme, setTheme } = useStore();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  const done: Record<string, boolean> = {
    "/escenario": !!scenario,
    "/configuracion": !!runId,
    "/ejecucion": !!runId,
    "/resultados": !!runId,
    "/cuatro-corridas": !!experimentId,
  };

  return (
    <div className="app">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <nav className="nav" aria-label="Navegación principal">
        <div className="nav-top">
          <Link className="brand" to="/">
            <BrandMark />
            <span className="brand-name">
              NutriRuta AG
              <span className="brand-sub">ODS 2 · Hambre cero</span>
            </span>
          </Link>
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={open}
            aria-controls="nav-body"
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name="menu" /> Menú
          </button>
        </div>
        <div id="nav-body" className={`nav-body ${open ? "open" : ""}`}>
          <div className="stack" style={{ "--gap": "0.4rem" } as CSSProperties}>
            <span className="nav-group">Recorrido</span>
            <ul className="nav-list">
              {FLOW.map((item) => (
                <li key={item.to}>
                  <NavLink
                    className={({ isActive }) =>
                      `nav-link ${done[item.to] && !isActive ? "done" : ""} ${isActive ? "active" : ""}`
                    }
                    to={item.to}
                    end={item.end}
                  >
                    <span className="nav-step" aria-hidden="true">
                      {done[item.to] && location.pathname !== item.to ? (
                        <Icon name="check" />
                      ) : (
                        item.step
                      )}
                    </span>
                    {item.label}
                    {done[item.to] && <span className="sr-only"> (con datos)</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
          <div className="stack" style={{ "--gap": "0.4rem" } as CSSProperties}>
            <span className="nav-group">Referencia</span>
            <ul className="nav-list">
              <li>
                <NavLink
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                  to="/glosario"
                >
                  <span className="nav-step" aria-hidden="true">
                    <Icon name="book" />
                  </span>
                  Glosario académico
                </NavLink>
              </li>
            </ul>
          </div>
          <div className="nav-scenario" aria-label="Escenario activo">
            {scenario ? (
              <>
                <span className="nav-group">Escenario activo</span>
                <strong>{scenario.label}</strong>
                {scenario.data_origin === "synthetic" && (
                  <span className="nav-tag">Simulación · datos sintéticos</span>
                )}
              </>
            ) : (
              <>
                <span className="nav-group">Sin escenario</span>
                <Link to="/escenario">Cargar o crear uno</Link>
              </>
            )}
          </div>
          <div className="nav-foot">
            {user && (
              <div className="nav-user">
                <span>Sesión iniciada como</span>
                <strong>{user.display_name}</strong>
                <button type="button" onClick={() => void logout()}>
                  Cerrar sesión
                </button>
              </div>
            )}
            <div className="theme-switch" role="group" aria-label="Tema de color">
              {THEMES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={theme === option.value}
                  onClick={() => setTheme(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span>Prototipo académico · v{meta?.code_version ?? "…"}</span>
          </div>
        </div>
      </nav>

      <div className="main">
        <main key={location.pathname} id="contenido" className="page" tabIndex={-1}>
          {metaError && (
            <Callout tone="error" title="No hay conexión con el servidor">
              {metaError} Ejecute <code>docker compose up -d</code> y recargue la página.
            </Callout>
          )}
          <Outlet />
        </main>
        <footer className="page-foot">
          {meta?.declaration ??
            "Herramienta académica de simulación; los resultados no equivalen a efectos medidos sobre inseguridad alimentaria."}
        </footer>
      </div>
    </div>
  );
}
