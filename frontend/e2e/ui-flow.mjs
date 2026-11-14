// Prueba funcional de la interfaz contra el stack en ejecución.
//
//   docker compose up -d --build
//   cd frontend && npm install && npm run test:ui
//
// Usa playwright-core con un navegador ya instalado (Edge por defecto; BROWSER_CHANNEL=chrome
// para Chrome). Variables: UI_BASE_URL (por defecto http://localhost:8090).
// El «padrón» que sube es ficticio y existe para comprobar que los datos personales se descartan.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.UI_BASE_URL ?? "http://localhost:8090";
const PADRON = path.resolve(here, "../../fixtures/invalid/padron_con_pii_ficticio.csv");
const OUT = process.env.UI_SHOTS_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "nutriruta-ui-"));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "OK  " : "FALLA"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? "msedge",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "es-PE",
});
const page = await context.newPage();
const errors = [];
let expectedTileErrors = 0;
let simulatingTileBlock = false;
const tileReferers = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (
    simulatingTileBlock &&
    m.location().url.startsWith("https://tile.openstreetmap.org/") &&
    m.text().includes("403 (Forbidden)")
  )
    expectedTileErrors += 1;
  else errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(e.message));

// 1) Inicio → demo rápida → Configuración
await page.goto(BASE + "/", { waitUntil: "networkidle" });
const homeHeaders = (await page.request.get(BASE + "/")).headers();
check(
  "La página permite enviar el origen a OpenStreetMap",
  homeHeaders["referrer-policy"] === "strict-origin-when-cross-origin",
);
check(
  "El HTML se revalida para cargar la versión actual",
  homeHeaders["cache-control"]?.includes("no-cache"),
);
await page.getByRole("button", { name: "Usar el escenario demo" }).click();
await page.waitForURL("**/configuracion");
check("Demo rápida activa el escenario y lleva a Configuración", true);
const locked = await page.getByLabel("Tamaño de población").isDisabled();
check("Preset Docente bloquea los parámetros", locked);

// 2) Ejecutar AG con semilla 22 → Ejecución → Resultados
await page.getByRole("button", { name: "22", exact: true }).click();
await page.getByRole("button", { name: /Ejecutar AG con semilla 22/ }).click();
await page.waitForURL("**/ejecucion");
await page.getByRole("link", { name: /Ver resultados/ }).waitFor({ timeout: 60000 });
check(
  "La corrida se completa y muestra «Solución validada»",
  await page.getByText("Solución validada").isVisible(),
);
const bestFitness = await page
  .locator(".kpi", { hasText: "Mejor fitness" })
  .locator(".kpi-value")
  .innerText();
check("KPI de mejor fitness visible", /0,7\d+/.test(bestFitness), bestFitness.trim());
const runHistory = page.locator("section.stack").filter({
  has: page.getByRole("heading", { name: "Corridas de este escenario" }),
});
const recentRunCount = await runHistory.locator(".data tbody tr").count();
const expandHistory = runHistory.getByRole("button", { name: /^Ver las .* corridas$/ });
if (await expandHistory.isVisible()) {
  check(
    "El historial limita las corridas visibles inicialmente",
    recentRunCount === 5,
    `${recentRunCount} visibles`,
  );
  await runHistory.getByRole("button", { name: /^Ver las .* corridas$/ }).click();
  check(
    "El control permite desplegar el historial completo",
    (await runHistory.locator(".data tbody tr").count()) > 5,
  );
  await runHistory.getByRole("button", { name: "Mostrar recientes" }).click();
  check(
    "El historial vuelve al resumen de cinco corridas",
    (await runHistory.locator(".data tbody tr").count()) === 5,
  );
} else {
  check(
    "El historial muestra todas las corridas cuando son cinco o menos",
    recentRunCount > 0 && recentRunCount <= 5,
  );
}
await page.screenshot({ path: `${OUT}/ui-ejecucion.png`, fullPage: true });
await page.getByRole("link", { name: /Ver resultados/ }).click();
await page.waitForURL("**/resultados");
await page.getByText("AG frente a la línea base").waitFor();
check(
  "Resultados muestra insignia Factible",
  await page.locator(".badge.good", { hasText: "Factible" }).first().isVisible(),
);
const j = await page
  .locator("tr", { hasText: "J (sin unidades)" })
  .locator("td")
  .first()
  .innerText();
check("J de la semilla 22 coincide con la evidencia (0,26275)", j.trim() === "0,26275", j.trim());
simulatingTileBlock = true;
await page.route("https://tile.openstreetmap.org/**", (route) => {
  tileReferers.push(route.request().headers().referer);
  return route.fulfill({ status: 403, contentType: "text/plain", body: "Access blocked" });
});
await page.getByRole("tab", { name: "Rutas" }).click();
await page.getByText(/No se pudo cargar el mapa base/).waitFor({ timeout: 15000 });
check("El mapa informa el bloqueo de teselas sin ocultar datos de ruta", true);
check(
  "Las peticiones de teselas incluyen el origen de la aplicación",
  tileReferers.length > 0 && tileReferers.every((value) => value === new URL(BASE).origin + "/"),
);
const firstTileAttempts = tileReferers.length;
await page.getByRole("button", { name: "Reintentar mapa base" }).click();
await page.getByText(/No se pudo cargar el mapa base/).waitFor();
check(
  "Reintentar solicita de nuevo las teselas y vuelve a informar el error",
  tileReferers.length > firstTileAttempts,
);
check("Pestaña Rutas muestra 3 hojas de ruta", (await page.locator(".manifest").count()) === 3);
check("El mapa dibuja 3 rutas", (await page.locator("path.route-line").count()) === 3);
const dots = await page.locator("path.center-dot").count();
const unserved = await page.locator("path.center-dot.unserved").count();
check(
  "El mapa dibuja los 18 centros y distingue los no atendidos",
  dots === 18 && unserved > 0,
  `${dots} centros, ${unserved} sin entrega`,
);

// 3) Reproducibilidad vía interfaz: el export CSV existe
const csv = await page.request.get(
  BASE + (await page.getByRole("link", { name: /CSV de asignaciones/ }).getAttribute("href")),
);
check(
  "Exportación CSV de la corrida responde 200",
  csv.status() === 200 && (await csv.text()).includes("asignado_lotes"),
);

// 4) Importar padrón con columnas personales
await page.goto(BASE + "/escenario", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Nuevo escenario" }).click();
await page.getByRole("button", { name: /Importar padrón/ }).click();
await page.getByLabel("Archivo del padrón").setInputFiles(PADRON);
await page.getByText("Dato personal").first().waitFor();
const piiRows = await page.locator(".badge.bad", { hasText: "Dato personal" }).count();
check(
  "La vista previa marca 4 columnas como dato personal descartado",
  piiRows === 4,
  `${piiRows}`,
);
const body1 = await page.locator("body").innerText();
check(
  "La vista previa no muestra valores personales",
  !/ZZ00000|PERSONA FICTICIA|TEL-FICT/.test(body1),
);
await page.getByRole("button", { name: "Depurar e importar" }).click();
await page.getByText(/5 centros aceptados de 8 filas/).waitFor();
check("Informe de importación: 5 aceptados de 8 filas", true);
check(
  "Informe lista los campos personales removidos",
  await page.getByText("DNI, NOMBRES_APELLIDOS, SEXO, TELEFONO").isVisible(),
);
await page.screenshot({ path: `${OUT}/ui-importacion.png`, fullPage: true });
await page.getByRole("button", { name: /Usar estos 5 centros/ }).click();
check(
  "Los 5 centros pasan a la tabla editable",
  (await page.locator("table.data tbody tr").count()) === 5,
);
// escenario incompleto: validar debe bloquear (faltan demanda, coordenadas, inventario, capacidad)
await page
  .getByRole("button", { name: /Distancias y validación/ })
  .first()
  .click();
await page.getByRole("button", { name: "Validar escenario" }).click();
await page.getByText(/error\(es\) bloquean el guardado/).waitFor();
check(
  "Un escenario importado incompleto no se puede guardar",
  await page.getByRole("button", { name: "Guardar y activar" }).isDisabled(),
);
const body2 = await page.locator("body").innerText();
check(
  "Ningún valor personal aparece en la interfaz tras importar",
  !/ZZ00000|PERSONA FICTICIA|TEL-FICT/.test(body2),
);

// 5) Navegación por teclado: enlace de salto y foco visible
await page.goto(BASE + "/glosario", { waitUntil: "networkidle" });
await page.keyboard.press("Tab");
const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
check(
  "El primer foco de teclado es «Saltar al contenido»",
  focused === "Saltar al contenido",
  focused,
);

check(
  "Sin errores inesperados de consola durante el recorrido",
  errors.length === 0 && expectedTileErrors > 0,
  errors.slice(0, 3).join(" | "),
);
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones superadas`);
process.exit(failed ? 1 : 0);
