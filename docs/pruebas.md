# Pruebas y validación

Cómo se comprueba que el sistema hace lo que dice, y cómo repetir cada comprobación.

## 1. Resumen

| Nivel | Herramienta | Casos | Dónde |
|---|---|---:|---|
| Unitarias | pytest | 123 | `backend/tests/unit/` |
| De propiedades y fuerza bruta | pytest + Hypothesis | 9 | `backend/tests/property/` |
| Integración de la API | pytest + TestClient + SQLite | 24 | `backend/tests/integration/` |
| Extremo a extremo (stack real) | pytest + httpx | 2 | `backend/tests/e2e/` |
| Unitarias del frontend | Vitest | 9 | `frontend/src/tests/` |
| Funcional de interfaz | Playwright (navegador instalado) | 19 comprobaciones | `frontend/e2e/ui-flow.mjs` |
| Estática | ruff, `tsc`, ESLint, Prettier | — | configuración en cada proyecto |

Última ejecución registrada (13/11/2026): 158 de 158 pruebas del backend superadas, 9 de 9 del frontend, 19 de 19 comprobaciones de interfaz, y lint, tipos y formato sin hallazgos.

## 2. Cómo ejecutarlas

```bash
# Backend: todo (las e2e necesitan el stack arriba; si no responde, se omiten)
docker compose up -d --build
docker compose --profile test build tests
docker compose --profile test run --rm tests pytest

# Solo una parte
docker compose --profile test run --rm tests pytest tests/unit -q
docker compose --profile test run --rm tests pytest tests/property -q -s   # muestra la brecha al óptimo
docker compose --profile test run --rm tests pytest tests/e2e -v

# Lint y formato del backend
docker compose --profile test run --rm tests ruff check . /srv/scripts
docker compose --profile test run --rm tests ruff format --check . /srv/scripts

# Frontend
cd frontend
npm ci
npm run typecheck && npm run lint && npm run format:check && npm test
npm run build

# Interfaz en navegador (Edge por defecto; BROWSER_CHANNEL=chrome para Chrome)
npm run test:ui
```

Con `make`: `make test`, `make test-e2e`, `make test-frontend`, `make test-ui`, `make lint`.

Las pruebas de integración usan una base SQLite temporal por prueba y ejecutan las corridas de forma síncrona (hacen de worker). Las e2e crean un escenario sintético propio (15 centros, semilla de fixture 987) y lo eliminan al terminar. La prueba de interfaz sí deja en la base una corrida adicional con semilla 22 sobre el escenario demo.

## 3. Pruebas unitarias obligatorias del plan (§9.1)

| # | Requisito | Prueba |
|---|---|---|
| 1 | OX produce una permutación del mismo conjunto de IDs | `test_operators.py::test_ox_children_are_permutations_of_same_ids`, `test_ox_known_example`, `test_ox_keeps_relative_order_of_filler` |
| 2 | En el cruce uniforme cada gen viene del gen del mismo centro de un padre | `test_uniform_crossover_gene_comes_from_same_center_of_a_parent`, `test_crossover_event_is_joint_for_pi_and_q` |
| 3 | La mutación mantiene dominios, no crea IDs ni valores negativos | `test_permutation_mutations_keep_ids`, `test_quantity_mutation_stays_in_domain` |
| 4 | La reparación termina, respeta `B` y `Cᵥ` y documenta los cambios | `test_repair_decoder.py::test_repair_*` |
| 5 | Decodificación: cada centro con `qᵢ > 0` se visita una vez; rutas depósito a depósito | `test_decode_routes_follow_pi_suborder_and_depot`, `test_every_decoded_solution_passes_validation_from_scratch` |
| 6 | Fitness recalculado a mano (3 centros, 2 vehículos); mayor `J` ⇒ menor fitness | `test_fitness_baseline.py::test_fitness_by_hand`, `test_baseline_by_hand`, `test_higher_j_means_lower_fitness` |
| 7 | Misma semilla ⇒ mismo historial y cromosoma | `test_evolution.py::test_same_seed_same_history_and_chromosome`, `test_api.py::test_same_seed_is_reproducible_through_the_api` |
| 8 | Datos: CSV corrupto, duplicados, NaN/Inf, distancias negativas, matriz no cuadrada, coordenadas fuera de rango, `B = 0`, `n = 0`, capacidad 0, matrices simétricas y asimétricas | `test_validators.py`, `test_imports.py::test_corrupt_and_unsupported_files` |
| 9 | DNI, sexo y nombres nunca quedan en la base ni en los exports | `test_imports.py`, `test_api.py::test_personal_data_never_reaches_database_or_exports` |

### El fixture calculado a mano

Tres centros y dos vehículos (`tests/conftest.py::hand_problem`):

```
C1: d = 10, p = 3   ·   C2: d = 8, p = 1   ·   C3: d = 6, p = 2      Σ p·d = 50
V1 = V2 = 10 lotes  ·   B = 18
km: D–C1 = 3, D–C2 = 4, D–C3 = 5, C1–C2 = 2, C1–C3 = 6, C2–C3 = 3
```

- **Línea base:** C1 ← 10 (V1); C3 ← 6 (V2); C2 ← 2 (V2, lo que queda de inventario). V1: 3 + 3 = 6 km. V2 por vecino más cercano: D→C2→C3→D = 4 + 3 + 5 = 12 km. `D_ref = 18 km`; `U = 6/50 = 0,12`; `J = 0,75·0,12 + 0,20·1 = 0,29`.
- **Cromosoma `π = [C3, C1, C2]`, `q = (10, 4, 4)`:** el empaquetado pone C1 en V1 y C3, C2 (en ese orden por `π`) en V2. Distancia 6 + (5 + 3 + 4) = 18 km. `U = (0 + 4 + 4)/50 = 0,16`; `R = 1`; `H = 0`; `J = 0,32`; `fitness = 1/1,32`.
- **Cromosoma que deja sin entrega a C1:** `H = 1`, `U = 0,6`, `J = 0,70` → fitness menor.

## 4. Propiedades y comparación exacta (§9.2)

**Propiedades** (Hypothesis, cientos de instancias aleatorias de 1 a 9 centros y 1 a 4 vehículos, con matrices asimétricas):

- La reparación termina, respeta dominio, inventario y flota, y contabiliza cada lote retirado.
- El decodificador produce siempre un plan que supera la validación desde cero.
- Decodificar un cromosoma ya reparado no cambia nada.
- La línea base es factible, `D_ref > 0` y el fitness está en `(0, 1]`.
- OX, intercambio e inversión conservan el conjunto de IDs; el cruce uniforme conserva los genes por centro.

**Fuerza bruta** (`test_bruteforce.py`): instancia de 5 centros, 2 vehículos de 4 lotes e inventario 7. Se enumeran las 120 permutaciones × 576 vectores `q` = **69 120** cromosomas con el mismo decodificador y la misma `J`. Se exige `J_AG ≥ J_óptimo` (nunca lo contrario) y factibilidad; **no** se exige que el AG alcance el óptimo. En la última ejecución, las cuatro semillas alcanzaron el óptimo enumerado (brecha 0 en las cuatro), lo que se informa como observación, no como garantía.

## 5. Integración de la API

Flujo completo demo → validar → guardar → idempotencia → conflicto; escenarios inválidos que nunca se guardan; errores estructurados y rechazo de campos personales; línea base; ciclo de vida de una corrida, historial incremental y exportaciones; reproducibilidad por la API; límites de parámetros; cancelación en cola y durante la ejecución; tiempo máximo; experimento de cuatro corridas (orden FIFO, mismos parámetros, mismo hash y misma `D_ref`) y sus exportaciones; escenario con matriz vial asimétrica; borrado en cascada; importación de padrón y de matriz; archivos corruptos y demasiado grandes.

## 6. Extremo a extremo

`tests/e2e/test_stack.py` habla por HTTP con el stack Docker real (nginx → API → PostgreSQL → worker):

1. nginx sirve la interfaz, devuelve `index.html` en rutas del cliente y reenvía `/api` y `/health`.
2. Demo → validar → guardar → línea base → corrida individual (la toma el worker real) → experimento de cuatro corridas → exportación CSV.
3. **Reproducibilidad real:** la corrida suelta con semilla 11 y la corrida 1 del experimento, ejecutadas por separado, producen el mismo cromosoma y el mismo `J`.

## 7. Funcional de interfaz

`frontend/e2e/ui-flow.mjs` recorre la aplicación en un navegador sin cabeza: demo rápida, bloqueo del preset Docente, corrida con semilla 22, indicador de fitness, insignia «Factible», coincidencia del `J` mostrado con la evidencia (0,26275), tres hojas de ruta, tres rutas y 18 centros en el mapa (con los no atendidos diferenciados), exportación CSV, importación de un padrón ficticio con cuatro columnas personales descartadas, imposibilidad de guardar un escenario incompleto, ausencia de valores personales en pantalla, enlace «Saltar al contenido» y cero errores de consola.

Además, durante el desarrollo se tomaron capturas de las siete pantallas en escritorio (claro y oscuro) y en móvil (400 px), comprobando que no hubiera desborde horizontal ni errores de consola. Una selección está en `docs/capturas/`.

## 8. Validación de la paleta de gráficos

Los colores de serie se comprobaron con un validador de paletas (banda de luminosidad, croma, separación bajo daltonismo, separación en visión normal y contraste) sobre las superficies clara y oscura de la aplicación. Las cuatro series usadas en líneas pasan todas las comprobaciones; las tres usadas para vehículos en el mapa pasan también la comprobación de todos los pares. Dos tonos quedan por debajo de 3:1 de contraste en tema claro, por lo que los gráficos llevan siempre leyenda, vista de tabla y, en el mapa, patrón de línea y etiqueta.

## 9. Integración continua

`.github/workflows/ci.yml` define tres trabajos: backend (ruff, fixtures al día, pytest sin e2e, `pip-audit`), frontend (tipos, lint, formato, pruebas, build, `npm audit`) y stack Docker (levanta todo, e2e y cuatro corridas como artefacto). **El flujo está escrito pero no se ha ejecutado en GitHub**: la carpeta aún no es un repositorio.

## 10. Límites de la validación

- Cuatro semillas describen variabilidad, no permiten generalizar.
- La comparación con el óptimo solo es posible en instancias diminutas.
- No hay pruebas de carga ni de concurrencia con varios workers.
- La interfaz se probó en Edge (Chromium); no en Firefox ni Safari.
- No se auditó la accesibilidad con lectores de pantalla reales; se siguieron prácticas estándar (roles, etiquetas, foco, alternativas textuales).
