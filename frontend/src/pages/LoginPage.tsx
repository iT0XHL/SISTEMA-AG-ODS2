import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { HeroArt } from "../components/HeroArt";
import { Callout, Icon } from "../components/ui";
import { useAuth } from "../features/auth";
import { ApiError, errorMessage } from "../services/api";

const REMEMBER_KEY = "nutriruta-ag.user";

function savedUser(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? "";
  } catch {
    return "";
  }
}

function retryAfter(reason: unknown): number {
  if (!(reason instanceof ApiError)) return 0;
  const seconds = (reason.details as { retry_after?: number } | null)?.retry_after;
  return typeof seconds === "number" && seconds > 0 ? Math.ceil(seconds) : 0;
}

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState(savedUser);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(() => savedUser() !== "");
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [wait, setWait] = useState(0);
  const userRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (username ? passwordRef : userRef).current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || wait > 0) return;
    if (!username.trim() || !password) {
      setError("Escriba su usuario y su contraseña.");
      setShaking(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, username.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* sin localStorage */
      }
    } catch (reason) {
      setError(errorMessage(reason));
      setWait(retryAfter(reason));
      setPassword("");
      setShaking(true);
      passwordRef.current?.focus();
      setBusy(false);
    }
  }

  function keys(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  return (
    <div className="login">
      <aside className="login-aside" aria-hidden="true">
        <div className="login-brand">
          <svg viewBox="0 0 36 36" width="40" height="40">
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
          <span>
            NutriRuta AG
            <small>ODS 2 · Hambre cero</small>
          </span>
        </div>
        <div className="login-hero">
          <div className="login-pitch">
            <h2>Reparto y rutas de alimentos con un algoritmo genético</h2>
            <p>
              Cargue un escenario, ejecute el algoritmo y compare el resultado con una línea base.
            </p>
          </div>
          <HeroArt />
        </div>
      </aside>

      <main className="login-main" id="contenido">
        <form
          className={`login-card ${shaking ? "shake" : ""}`}
          onAnimationEnd={() => setShaking(false)}
          onSubmit={submit}
          noValidate
          aria-labelledby="login-title"
        >
          <div className="stack" style={{ "--gap": "0.3rem" } as React.CSSProperties}>
            <h1 id="login-title">Iniciar sesión</h1>
            <p className="muted small">Entra con la cuenta del equipo.</p>
          </div>

          {error && (
            <Callout tone="error">
              {error}
              {wait > 0 && <span className="mono"> ({wait} s)</span>}
            </Callout>
          )}

          <div className="field">
            <label htmlFor="login-user">Usuario</label>
            <input
              ref={userRef}
              id="login-user"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              aria-invalid={error ? true : undefined}
            />
          </div>

          <div className="field">
            <label htmlFor="login-password">Contraseña</label>
            <div className="password-box">
              <input
                ref={passwordRef}
                id="login-password"
                className="input"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={keys}
                onKeyUp={keys}
                aria-invalid={error ? true : undefined}
                aria-describedby={capsLock ? "caps-hint" : undefined}
              />
              <button
                type="button"
                className="btn small ghost"
                aria-pressed={visible}
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            {capsLock && (
              <span className="hint" id="caps-hint" role="status">
                <Icon name="warn" /> Las mayúsculas están activadas.
              </span>
            )}
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Recordar mi usuario en este equipo
          </label>

          <button type="submit" className="btn primary" disabled={busy || wait > 0}>
            {busy ? (
              <>
                <span className="spinner on-primary" aria-hidden="true" /> Verificando…
              </>
            ) : wait > 0 ? (
              `Reintentar en ${wait} s`
            ) : (
              <>
                Entrar <Icon name="arrow" />
              </>
            )}
          </button>

          <p className="small muted">Credenciales iniciales: ver el README.</p>
        </form>
      </main>
    </div>
  );
}
