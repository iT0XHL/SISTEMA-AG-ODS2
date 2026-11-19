import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { clearToken, getToken } from "../services/session";

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; headers: Headers }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ url, headers: new Headers(init.headers) });
    return handler(url, init);
  });
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  clearToken();
});

describe("sesión con token (frontend en otro dominio)", () => {
  it("guarda el token del login y lo envía como Bearer", async () => {
    const calls = mockFetch((url) =>
      url.endsWith("/auth/login")
        ? json({ user: { username: "admin", display_name: "Administrador" }, token: "abc123" })
        : json({ user: { username: "admin", display_name: "Administrador" } }),
    );
    const result = await api.login("admin", "x");
    expect(result.user.username).toBe("admin");
    expect(getToken()).toBe("abc123");
    expect(calls[0].headers.get("Authorization")).toBeNull();

    await api.me();
    expect(calls[1].headers.get("Authorization")).toBe("Bearer abc123");
  });

  it("borra el token al cerrar sesión, incluso si el servidor falla", async () => {
    mockFetch(() => json({ code: "X", message: "x" }, 500));
    mockFetch((url) =>
      url.endsWith("/auth/login") ? json({ user: { username: "a", display_name: "A" }, token: "t" }) : json({}, 500),
    );
    await api.login("a", "b");
    await expect(api.logout()).rejects.toBeTruthy();
    expect(getToken()).toBeNull();
  });

  it("sin VITE_API_URL las llamadas van al mismo origen", async () => {
    const calls = mockFetch(() => json({ user: { username: "a", display_name: "A" } }));
    await api.me();
    expect(calls[0].url).toBe("/api/v1/auth/me");
  });
});
