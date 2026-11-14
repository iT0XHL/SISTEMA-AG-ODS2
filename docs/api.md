# API de NutriRuta AG

Base: `http://localhost:8090` (a través de nginx) o `http://localhost:8010` (directo). Documentación interactiva generada por FastAPI en `http://localhost:8010/docs`.

- JSON con **punto decimal**; la interfaz muestra coma decimal.
- Los identificadores de corrida y experimento son UUID.
- Los archivos subidos se procesan en memoria y no se guardan.

## Errores

Todas las respuestas de error tienen la misma forma:

```json
{ "code": "SCENARIO_INVALID", "message": "Texto legible en español", "field": "vehicles[0].capacity_lots", "details": { } }
```

| HTTP | Cuándo | Códigos frecuentes |
|---|---|---|
| 404 | Recurso inexistente | `SCENARIO_NOT_FOUND`, `RUN_NOT_FOUND`, `EXPERIMENT_NOT_FOUND`, `NOT_FOUND` |
| 409 | Estado incompatible | `SCENARIO_ID_CONFLICT`, `RUN_NOT_COMPLETED`, `RUN_ALREADY_FINISHED`, `EXPERIMENT_NOT_COMPLETED` |
| 413 | Solicitud o archivo demasiado grande | `PAYLOAD_TOO_LARGE`, `FILE_TOO_LARGE` |
| 422 | Esquema o reglas de dominio | `VALIDATION_ERROR`, `SCENARIO_INVALID`, `INVALID_PARAMETERS`, `TOO_MANY_GENERATIONS`, `CORRUPT_FILE`, `PII_COLUMN_NOT_ALLOWED`, `MATRIX_NOT_SQUARE` |
| 500 | Error interno | `INTERNAL_ERROR` |

Un campo no permitido en el cuerpo (por ejemplo `dni` dentro de un centro) produce `422 VALIDATION_ERROR`: el esquema es una lista permitida.

## Endpoints

| Método y ruta | Función | Respuesta |
|---|---|---|
| `GET /health` | Estado técnico y de la base de datos | `200` / `503` |
| `GET /api/v1/meta` | Límites, preset Docente, semillas oficiales, textos | `200` |
| `POST /api/v1/scenarios/demo` | Genera el escenario sintético (no lo guarda) | `200` escenario |
| `POST /api/v1/scenarios/validate` | Valida esquema y dominio **sin guardar** | `200` informe; `422` si el esquema es incorrecto |
| `POST /api/v1/scenarios` | Guarda un escenario válido | `201` `{id, hash, provenance}`; `200` si ya existía idéntico; `409`; `422` |
| `GET /api/v1/scenarios` | Lista de escenarios | `200` |
| `GET /api/v1/scenarios/{id}` | Escenario completo, procedencia, banderas | `200` / `404` |
| `GET /api/v1/scenarios/{id}/matrix` | Matriz de distancias persistida | `200` |
| `DELETE /api/v1/scenarios/{id}` | Elimina el escenario y sus corridas | `204` |
| `POST /api/v1/imports/padron/preview` | Columnas del padrón, mapeo sugerido y descartes | `200` |
| `POST /api/v1/imports/padron/normalize` | Aplica el mapeo y devuelve centros + informe | `200` |
| `POST /api/v1/imports/matrix` | Lee una matriz vial CSV | `200` |
| `POST /api/v1/baselines` | Línea base del escenario | `200` métricas y rutas |
| `POST /api/v1/runs` | Encola una corrida del AG | `202` `{run_id}` |
| `GET /api/v1/runs?scenario_id=` | Corridas de un escenario | `200` |
| `GET /api/v1/runs/{id}` | Estado y progreso | `200` |
| `POST /api/v1/runs/{id}/cancel` | Solicita cancelar | `200` / `409` |
| `GET /api/v1/runs/{id}/solution` | Mejor solución validada | `200` / `409` si no terminó |
| `GET /api/v1/runs/{id}/history?since=` | Fitness por generación | `200` |
| `GET /api/v1/runs/{id}/export?format=json\|csv` | Evidencia de la corrida | archivo |
| `POST /api/v1/experiments/four-runs` | Encola las semillas 11, 22, 33 y 44 | `202` |
| `GET /api/v1/experiments?scenario_id=` | Experimentos de un escenario | `200` |
| `GET /api/v1/experiments/{id}` | Tabla de las cuatro corridas, línea base y resumen | `200` |
| `GET /api/v1/experiments/{id}/export?format=csv\|json` | Exporta la tabla (solo si las cuatro terminaron) | archivo / `409` |

## Escenario

```json
{
  "scenario_id": "demo-cañete-001",
  "label": "Escenario sintético para evaluación (18 centros)",
  "data_origin": "synthetic",
  "distance_mode": "haversine_demo",
  "depot": { "id": "DEPOT", "name": "Depósito ficticio", "lat": -13.07, "lon": -76.39 },
  "inventory_lots": 135,
  "vehicles": [ { "id": "V01", "capacity_lots": 50 } ],
  "centers": [
    { "id": "C01", "name": "Centro ficticio 01", "district": "Zona ilustrativa Sur",
      "lat": -13.10032, "lon": -76.31681, "demand_lots": 10, "priority_weight": 1,
      "source": "synthetic", "demand_origin": "synthetic", "users_aggregate": null }
  ],
  "distances": [],
  "data_license": "…", "notes": "…", "priority_criterion": "…",
  "demand_rule": null, "fixture_seed": 2026
}
```

| Campo | Valores |
|---|---|
| `data_origin` | `synthetic`, `official`, `declared`, `mixed` |
| `distance_mode` | `haversine_demo` (se calcula desde coordenadas; `distances` debe ir vacío) o `road_matrix` (requiere todos los pares en `distances`) |
| `centers[].source` | `synthetic`, `official`, `declared` |
| `centers[].demand_origin` | `synthetic`, `declared`, `inferred` |
| `distances[]` | `{from_id, to_id, km}`; puede ser asimétrica |
| `scenario_id` | opcional; letras, números, guiones, guiones bajos y puntos |

### Informe de validación

```json
{
  "valid": false,
  "errors":   [ { "code": "INVALID_CAPACITY", "message": "…", "field": "vehicles[0].capacity_lots", "details": {} } ],
  "warnings": [ { "code": "STRAIGHT_LINE_DISTANCES", "message": "…", "field": "distance_mode", "details": {} } ],
  "flags": {
    "structural_scarcity": { "active": true, "total_demand": 181, "inventory_lots": 135,
                             "fleet_capacity": 150, "max_deliverable": 135, "min_unmet_lots": 46 },
    "partial_only_centers": []
  },
  "summary": { "n_centers": 18, "n_vehicles": 3, "distance_mode": "haversine_demo",
               "matrix": { "entries": 342, "symmetric": true }, "total_demand": 181 },
  "hash": null
}
```

Errores bloqueantes: `NO_CENTERS`, `CENTER_COUNT_OUT_OF_RANGE`, `MISSING_CENTER_ID`, `DUPLICATE_CENTER_ID`, `MISSING_CENTER_NAME`, `MISSING_DEMAND`, `INVALID_DEMAND`, `INVALID_PRIORITY`, `MISSING_COORDINATES`, `INCOMPLETE_COORDINATES`, `INVALID_LATITUDE`, `INVALID_LONGITUDE`, `NO_VEHICLES`, `DUPLICATE_VEHICLE_ID`, `INVALID_CAPACITY`, `MISSING_INVENTORY`, `INVALID_INVENTORY`, `EMPTY_INVENTORY`, `EMPTY_DEMAND`, `DEPOT_ID_COLLISION`, `MIXED_DISTANCE_SOURCES`, `MISSING_MATRIX`, `MATRIX_INCOMPLETE`, `NEGATIVE_DISTANCE`, `NON_FINITE_DISTANCE`, `NONZERO_DIAGONAL`, `CONFLICTING_DISTANCE`, `UNKNOWN_DISTANCE_ID`.

Advertencias: `STRAIGHT_LINE_DISTANCES`, `STRUCTURAL_SCARCITY`, `DEMAND_EXCEEDS_VEHICLE`, `ZERO_DEMAND`, `PRIORITY_NEEDS_JUSTIFICATION`, `INFERRED_DEMAND`.

## Corridas

```http
POST /api/v1/runs
{ "scenario_id": "demo-cañete-001", "seed": 11, "parameters": { "population_size": 100 } }
→ 202 { "run_id": "3fb83402-…", "status": "queued", "seed": 11 }
```

`parameters` es opcional (por defecto, preset Docente). Campos: `population_size`, `max_generations`, `tournament_k`, `crossover_prob`, `perm_mutation_prob`, `qty_mutation_prob`, `qty_mutation_max_step`, `elite`, `stagnation_generations`, `improvement_tolerance`, `init_random_frac`, `init_priority_frac`, `init_heuristic_frac`, `w_u`, `w_r`, `w_h`.

Estado (`GET /runs/{id}`): `status` ∈ `queued`, `running`, `completed`, `failed`, `cancelled`; `progress {generation, max_generations, fraction}`; `latest` (última generación); `stop_reason` ∈ `max_generations`, `stagnation`, `cancelled`; `error {code, message}`; `code_version`; `scenario_hash`.

Solución (`GET /runs/{id}/solution`), campos principales:

| Campo | Contenido |
|---|---|
| `chromosome` | `{ "pi": ["C11", …], "q": { "C01": 0, … } }` |
| `routes[]` | `vehicle_id`, `capacity_lots`, `load_lots`, `km`, `used`, `path` (`[DEPOT, …, DEPOT]`), `stops[] {order, center_id, lots}` |
| `assignments[]` | por centro: prioridad, demanda, asignado, pendiente, vehículo, parada, `partial_only` |
| `metrics` | `J`, `fitness`, `U`, `R`, `H`, lotes, cobertura, centros, vehículos, `total_km`, `d_ref_km`, `distance_mode`, `cpu_seconds`, `generations_run`, `evaluations`, `stop_reason` |
| `validation` | `feasible` y ocho `checks {id, description, ok, detail}` |
| `repair` | lotes retirados al mejor individuo, por motivo y centro |
| `baseline` | la línea base completa (método, `d_ref_km`, métricas, rutas, validación) |
| `comparison` | diferencias AG − base y `ga_better_than_baseline` |

## Exportaciones

**CSV del experimento** (UTF-8 con BOM): cuatro filas `metodo = AG` y una `metodo = linea_base`. Columnas: `metodo, corrida, seed, estado, J, fitness, U, R, H, lotes_entregados, lotes_demandados, cobertura_ponderada, distancia_km, modalidad_distancia, vehiculos_usados, tiempo_cpu_s, generaciones, criterio_parada, factible, D_ref_km, run_id, experiment_id, scenario_id, scenario_hash, origen_datos, version_codigo, fecha_ejecucion_utc, parametros_json`.

**JSON del experimento**: `experiment`, `scenario`, `histories_by_seed`, `solutions_by_seed` y bloque `export` con fecha y declaración.

**CSV de una corrida**: una fila por centro con asignación y metadatos. **JSON de una corrida**: escenario, solución e historial completo.

## Importación

`POST /imports/padron/preview` — `multipart/form-data` con `file`. Devuelve `columns[] {name, pii, pii_category, suggested_field, action}`, `allowed_fields`, `row_count` y una muestra **solo** de columnas institucionales.

`POST /imports/padron/normalize` — `file`, `mapping` (JSON `{campo_permitido: columna}`) y `demand_rule` opcional (`{"rations_per_user": 1, "rations_per_lot": 10}`). Devuelve `centers[]` e `report {rows_total, accepted, duplicates, inactive_ignored, rejected[], row_warnings[], discarded_columns[], pii_removed[]}`. Mapear una columna personal devuelve `422 PII_COLUMN_NOT_ALLOWED`.

`POST /imports/matrix` — `file` CSV. Devuelve `format` (`long` o `square`), `ids`, `entries[]` y `count`.

## Ejemplo con `curl`

```bash
B=http://localhost:8090
curl -s -X POST $B/api/v1/scenarios/demo -H 'Content-Type: application/json' -d '{}' > demo.json
curl -s -X POST $B/api/v1/scenarios -H 'Content-Type: application/json' -d @demo.json
curl -s -X POST $B/api/v1/experiments/four-runs -H 'Content-Type: application/json' \
     -d '{"scenario_id":"demo-cañete-001"}'
curl -s "$B/api/v1/experiments/<experiment_id>/export?format=csv" -o cuatro_corridas.csv
```
