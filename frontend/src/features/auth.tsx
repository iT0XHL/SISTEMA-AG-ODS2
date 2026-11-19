import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { UNAUTHORIZED_EVENT, api } from "../services/api";
import type { AuthUser } from "../types";

type Status = "loading" | "anon" | "auth";

interface AuthContext {
  status: Status;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Context = createContext<AuthContext | null>(null);

function applySavedTheme() {
  try {
    const raw = localStorage.getItem("nutriruta-ag.v1");
    const theme = raw ? (JSON.parse(raw) as { theme?: string }).theme : undefined;
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  } catch {
    /* sin localStorage */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    applySavedTheme();
    let cancelled = false;
    api
      .me()
      .then((result) => {
        if (cancelled) return;
        setUser(result.user);
        setStatus("auth");
      })
      .catch(() => {
        if (!cancelled) setStatus("anon");
      });
    const expired = () => {
      setUser(null);
      setStatus("anon");
    };
    window.addEventListener(UNAUTHORIZED_EVENT, expired);
    return () => {
      cancelled = true;
      window.removeEventListener(UNAUTHORIZED_EVENT, expired);
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.login(username, password);
    setUser(result.user);
    setStatus("auth");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setStatus("anon");
    }
  }, []);

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth(): AuthContext {
  const value = useContext(Context);
  if (!value) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return value;
}
