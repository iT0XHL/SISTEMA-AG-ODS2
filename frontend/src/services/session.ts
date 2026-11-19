/** Token de sesión para cuando la API vive en otro dominio (Amplify → API Gateway).
 *  Se guarda solo en la pestaña (sessionStorage) y, si el navegador lo impide, en memoria.
 *  Con nginx y un solo origen la cookie HttpOnly basta y este token no se usa. */
const KEY = "nutriruta.token";
let memory: string | null = null;

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function setToken(token: string): void {
  memory = token;
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    /* sin sessionStorage: se queda en memoria */
  }
}

export function clearToken(): void {
  memory = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* sin sessionStorage */
  }
}
