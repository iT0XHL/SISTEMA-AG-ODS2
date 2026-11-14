# Evidencia de las cuatro corridas

Resultados producidos por la aplicación, sin retoques. Sirven de base para la sección 8 del informe.

> Todas las cifras de este documento salen de `docs/evidencia/` (archivos generados por `scripts/export_four_runs.py` contra el stack Docker en ejecución). Los datos del escenario son **sintéticos** y las distancias, **en línea recta**: describen el comportamiento del modelo, no una operación real ni un efecto sobre la inseguridad alimentaria.

## 1. Ficha de la ejecución

| Dato | Valor |
|---|---|
| Fecha | 13/11/2026, 20:22 (hora de Perú) · `2026-11-14T01:22:18Z` |
| Versión del programa | 1.0.0 |
| Experimento | `862fd4bb-7e2d-4c5c-9889-d4dfe0bf0f29` |
| Escenario | `demo-cañete-001` · «Escenario sintético para evaluación (18 centros)» |
| Hash del escenario (SHA-256) | `4d139880bd4e6e2cabc286c0e37ff6a2cf964c2f1d0a37d14aca5933f3ebb1f4` |
| Origen de datos | Sintético · semilla de fixture 2026 |
| Modalidad de distancia | `haversine_demo`: km en línea recta, no aptos para planificación de reparto |
| Entorno | Docker Compose: nginx → FastAPI → PostgreSQL 17 → worker (Python 3.12) |

### Escenario

- 18 centros ficticios; prioridades: 8 con `p = 1`, 6 con `p = 2`, 4 con `p = 3`.
- Demanda total **181 lotes**; demanda ponderada `Σ pᵢ·dᵢ = 330`.
- Inventario **B = 135 lotes**; flota de 3 vehículos de 50 lotes (150 en total).
- **Escasez estructural:** como máximo se pueden entregar 135 lotes; al menos 46 quedan sin cubrir en cualquier solución.

### Parámetros (preset Docente, idénticos en las cuatro corridas)

| Parámetro | Valor | Parámetro | Valor |
|---|---|---|---|
| Población | 100 | Élite | 2 |
| Generaciones máximas | 200 | Estancamiento | 35 generaciones, tolerancia 10⁻⁶ |
| Torneo | 3 | Población inicial | 70 % aleatoria · 20 % por prioridad · 10 % heurística |
| Probabilidad de cruce | 0,90 | Pesos de `J` | 0,75 · 0,20 · 0,05 |
| Mutación de `π` | 0,15 por individuo | Mutación de `q` | 0,08 por gen, ±1…±3 lotes |

## 2. Tabla de resultados

| Corrida | Semilla | J | Fitness | Lotes entregados / demandados | Cobertura ponderada | Distancia km + modalidad | Vehículos | Tiempo CPU s | Generaciones | Factible |
|---|---:|---:|---:|---|---:|---|---:|---:|---:|---|
| 1 | 11 | 0,26278 | 0,79191 | 135 / 181 | 85,76 % | 62,61 (línea recta) | 3 | 0,63 | 99 | sí |
| 2 | 22 | 0,26275 | 0,79192 | 130 / 181 | 84,24 % | 58,04 (línea recta) | 3 | 0,78 | 123 | sí |
| 3 | 33 | 0,26344 | 0,79149 | 135 / 181 | 85,76 % | 62,87 (línea recta) | 3 | 0,71 | 112 | sí |
| 4 | 44 | 0,26603 | 0,78987 | 135 / 181 | 85,45 % | 63,00 (línea recta) | 3 | 0,58 | 89 | sí |
| **Línea base** | — | 0,30455 | 0,76655 | 135 / 181 | 86,06 % | 80,29 (línea recta) | 3 | — | — | sí |

Resumen adicional del AG (no reemplaza las filas): `J` medio **0,26375 ± 0,00156**; fitness 0,79130 ± 0,00097; cobertura ponderada 85,30 % ± 0,72; distancia 61,63 ± 2,40 km; lotes entregados 133,75 ± 2,50; generaciones 105,75 ± 14,86. Desviación estándar muestral (n − 1).

Las cuatro corridas se detuvieron por **estancamiento** (35 generaciones sin mejora ≥ 10⁻⁶), no por alcanzar las 200 generaciones. El tiempo de CPU depende del equipo y cambia en cada ejecución; el resto de las cifras se reproduce exactamente.

## 3. Componentes de `J`

`D_ref = 80,287 km` (distancia de la línea base), la misma para todas las filas.

| Método | U (demanda ponderada no cubierta) | R (km / D_ref) | H (prioridad alta sin entrega) | J = 0,75·U + 0,20·R + 0,05·H |
|---|---:|---:|---:|---:|
| Semilla 11 | 0,14242 | 0,77979 | 0 | 0,26278 |
| Semilla 22 | 0,15758 | 0,72285 | 0 | 0,26275 |
| Semilla 33 | 0,14242 | 0,78311 | 0 | 0,26344 |
| Semilla 44 | 0,14545 | 0,78472 | 0 | 0,26603 |
| Línea base | 0,13939 | 1,00000 | 0 | 0,30455 |

## 4. Rutas de cada corrida

| Semilla | V01 | V02 | V03 |
|---|---|---|---|
| 11 | C11→C04→C17→C09 · 50 lotes · 20,94 km | C12→C02→C07→C16→C14 · 49 · 21,42 km | C18→C13→C03→C06→C08 · 36 · 20,25 km |
| 22 | C11→C04→C17→C09 · 50 · 20,94 km | C16→C07→C05→C02→C03 · 50 · 24,62 km | C18→C14→C08→C06 · 30 · 12,48 km |
| 33 | C11→C04→C17→C09 · 50 · 20,94 km | C06→C12→C02→C07→C16 · 50 · 21,46 km | C08→C03→C13→C18→C14 · 35 · 20,48 km |
| 44 | C09→C17→C04→C11 · 50 · 20,94 km | C07→C02→C12→C16→C14 · 49 · 21,81 km | C18→C13→C03→C06→C08 · 36 · 20,25 km |

Cada ruta empieza y termina en el depósito. Centros atendidos: 14, 13, 14 y 14 de 18 (la línea base atiende 13). El detalle por centro está en `asignaciones_seed*.csv`.

## 5. Comprobación de factibilidad

Las cuatro soluciones y la línea base superaron las ocho comprobaciones de la validación desde cero: permutación completa, dominio de cantidades, inventario (`Σq ≤ 135`), capacidad por vehículo (cargas ≤ 50), visita única, ida y vuelta al depósito, suborden de `π` y distancia recalculada desde la matriz. En los cuatro casos el mejor individuo **no necesitó reparación** (0 lotes retirados): su cromosoma ya era factible.

## 6. Análisis

**El AG obtuvo menor `J` que la línea base en las 4 corridas** (0,26375 de media frente a 0,30455).

- **De dónde viene la diferencia.** Casi toda procede de la distancia: el AG recorre entre 58 y 63 km frente a 80,29 km (`R` baja de 1,00 a 0,72–0,78, lo que resta entre 0,043 y 0,055 a `J`). La línea base asigna centros a vehículos por orden de prioridad, sin considerar cercanía, y eso alarga sus rutas.
- **Qué cede a cambio.** La cobertura ponderada del AG es **ligeramente menor** que la de la línea base (84,2 %–85,8 % frente a 86,06 %; `U` sube de 0,139 a 0,142–0,158, lo que suma entre 0,002 y 0,014 a `J`). La línea base, que atiende estrictamente por prioridad, cubre un poco mejor la demanda ponderada. Con los pesos 0,75 / 0,20 / 0,05, el ahorro de distancia compensa esa pérdida; con otros pesos el balance podría invertirse.
- **Un compromiso visible.** La semilla 22 entrega 130 lotes y deja 5 en el depósito: renuncia a parte de la entrega para acortar la ruta de V03 a 12,48 km y logra el menor `J` de las cuatro. Es el comportamiento esperado de un objetivo agregado, y conviene mostrarlo como tal.
- **Prioridad alta.** Ningún centro de prioridad 3 quedó sin entrega (`H = 0`) en ninguna solución.
- **Variabilidad.** Las cuatro semillas llegan a soluciones distintas con `J` muy parecido (desviación estándar 0,0016). La ruta de V01 coincide en las cuatro (en la semilla 44, recorrida en sentido inverso).
- **Evolución.** El mejor fitness de la población inicial fue 0,759, 0,745, 0,753 y 0,751; el final, 0,792, 0,792, 0,791 y 0,790. Las curvas están en la pantalla «Cuatro corridas» y en `cuatro_corridas.json`.

### Lo que estos resultados no permiten afirmar

- Que el AG encuentre el óptimo: en una instancia de 18 centros no se puede enumerar el espacio de búsqueda. Solo en una instancia de prueba de 5 centros se comparó con el óptimo exacto (ver [pruebas.md](pruebas.md)).
- Que la ventaja se mantenga en cualquier escenario: cuatro semillas sobre un único escenario sintético no bastan para generalizar. En pruebas complementarias (sección 7) la ventaja fue nula en la instancia más pequeña y reducida en la más grande.
- Que las distancias correspondan a recorridos reales: son en línea recta.
- Nada sobre personas atendidas o sobre inseguridad alimentaria.

## 7. Prueba complementaria por tamaño

`scripts/benchmark.py` ejecuta el motor directamente (sin base de datos) sobre instancias sintéticas de distinto tamaño, con inventario y flota escalados. **No forma parte del experimento oficial**; se incluye para dar contexto. Ejecutado el 13/11/2026 con las semillas 11 y 22:

| Centros | Semilla | J del AG | J de la línea base | Diferencia | km AG | km base | Generaciones | CPU s | Factible |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 6 | 11 | 0,29783 | 0,29783 | 0,00000 | 29,01 | 29,01 | 35 | 0,14 | sí |
| 6 | 22 | 0,29783 | 0,29783 | 0,00000 | 29,01 | 29,01 | 35 | 0,15 | sí |
| 18 | 11 | 0,26278 | 0,30455 | −0,04177 | 62,61 | 80,29 | 99 | 0,54 | sí |
| 18 | 22 | 0,26275 | 0,30455 | −0,04179 | 58,04 | 80,29 | 123 | 0,68 | sí |
| 30 | 11 | 0,30042 | 0,32544 | −0,02501 | 124,43 | 142,21 | 109 | 0,77 | sí |
| 30 | 22 | 0,30451 | 0,32544 | −0,02092 | 127,33 | 142,21 | 59 | 0,42 | sí |
| 50 | 11 | 0,33581 | 0,33794 | −0,00213 | 233,85 | 245,59 | 84 | 0,85 | sí |
| 50 | 22 | 0,32820 | 0,33794 | −0,00974 | 227,53 | 245,59 | 77 | 0,80 | sí |

Lectura: con 6 centros el AG iguala a la línea base y se detiene en la generación 35 sin haberla mejorado; con 50 centros la mejora es pequeña y las corridas se estancan antes de la generación 90. Es coherente con dos límites conocidos del diseño: el decodificador reparte los centros entre vehículos por tamaño de entrega y no por cercanía, y el criterio de estancamiento corta pronto. Mejoras locales entre rutas quedaron fuera del MVP por decisión del plan.

## 8. Archivos de evidencia

En `docs/evidencia/`:

| Archivo | Contenido |
|---|---|
| `cuatro_corridas.csv` | Tabla oficial: 4 filas del AG + 1 de la línea base, con hash, versión, fecha y parámetros |
| `cuatro_corridas.json` | Experimento completo: escenario, historiales por generación y soluciones por semilla |
| `asignaciones_seed11.csv` … `seed44.csv` | Asignación por centro de cada corrida |
| `escenario.json` | Escenario, procedencia, banderas y resumen de validación |
| `resumen.json` | Respuesta de `GET /experiments/{id}` |
| `tabla_cuatro_corridas.md` | La tabla en Markdown |

Capturas de la aplicación en `docs/capturas/` (entre ellas `desktop-light-07-cuatro-corridas.png` y `desktop-light-06-resultados-rutas.png`).

## 9. Cómo reproducirlo

```bash
docker compose up -d --build
python scripts/export_four_runs.py --api http://localhost:8090 --out docs/evidencia
```

O desde la interfaz: Inicio → «Usar el escenario demo» → Cuatro corridas → «Lanzar las cuatro corridas» → «Exportar CSV».

Con la versión 1.0.0 y el mismo escenario (mismo hash), `J`, fitness, lotes, cobertura, distancias, rutas y número de generaciones deben coincidir con las tablas de arriba; solo cambiará el tiempo de CPU. Esto se comprobó tres veces de forma independiente: llamando al motor directamente, con el experimento de la aplicación y relanzando la semilla 22 desde la interfaz (`J = 0,26275` en los tres casos).

## 10. Para completar el informe

- **Sección 7 (Desarrollo en Python):** arquitectura y módulos en [especificacion.md](especificacion.md); modelo y operadores en [modelo-matematico.md](modelo-matematico.md); pruebas en [pruebas.md](pruebas.md); capturas en `docs/capturas/`.
- **Sección 8 (Corridas):** las tablas de las secciones 2 a 4, la comprobación de factibilidad de la sección 5 y el análisis de la sección 6. Si se vuelve a ejecutar con otro escenario o versión, sustituya las cifras por las nuevas; no mezcle resultados de ejecuciones distintas.
