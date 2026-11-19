# Modelo matemático y algoritmo genético

Contrato matemático de NutriRuta AG tal como está implementado. Los símbolos, la función fitness y los operadores son los del informe académico y del plan de implementación; aquí se añaden las precisiones que hubo que fijar al programarlo (sección 9).

## 1. Entradas y unidades

| Símbolo / campo | Tipo | Significado |
|---|---|---|
| `n`, `center_id` | entero > 0, ID único | Centros elegibles |
| `dᵢ` / `demand_lots` | entero ≥ 0 | Lotes requeridos por el centro en un período |
| `pᵢ` / `priority_weight` | entero 1–3 | Importancia relativa **del centro** |
| `B` / `inventory_lots` | entero > 0 | Inventario total homogéneo |
| `m`, `Cᵥ` / `capacity_lots` | enteros > 0 | Vehículos y su capacidad en lotes |
| `D[u][v]` | matriz finita ≥ 0 | Distancia en km entre depósito/centros; **una sola modalidad por corrida** |
| `depot_id` | texto | Origen y fin común de cada ruta |
| `D_ref` | real > 0 | Distancia de la línea base, calculada una vez por escenario |

Supuestos: un centro no recibe varios viajes en un período; cada vehículo hace a lo sumo un recorrido; lotes homogéneos no perecibles.

## 2. Cromosoma

```
C = (π, q)
π = permutación de los n centros        [C07, C01, C11, …, C03]   orden global de visita
q = vector de n enteros                 [ 12,   0,   8, …,  16 ]   lotes por centro
    q está indexado por ID de centro, no por posición en π
```

- `π` contiene **todos** los centros exactamente una vez, también los que tienen `qᵢ = 0` (por conveniencia genética: permite usar OX).
- Longitud fija `2n`; lo que varía es el fenotipo (cuántos vehículos y paradas resultan).
- Código: `backend/app/ga/chromosome.py`.

## 3. Restricciones duras

```
∀i: 0 ≤ qᵢ ≤ dᵢ   y   qᵢ ≤ máx_v Cᵥ
Σᵢ qᵢ ≤ B
∀v: Σ_{i asignado a v} qᵢ ≤ Cᵥ
∀i con qᵢ > 0: exactamente una visita, en un único vehículo
∀v usado: ruta = [depósito, …centros…, depósito]
π es una permutación completa y sin repetidos
```

Toda solución publicada las cumple. Se comprueban **desde cero** antes de guardar (`validate_solution` en `backend/app/domain/metrics.py`), con ocho verificaciones: permutación, dominio de cantidades, inventario, capacidad por vehículo, visita única, ida y vuelta al depósito, suborden de `π` y distancia recalculada desde `D`.

## 4. Reparación y decodificación

Código: `backend/app/ga/repair.py` y `backend/app/ga/decoder.py`.

1. **Dominio.** Recortar cada `qᵢ` a `[0, min(dᵢ, máx Cᵥ)]`.
2. **Inventario y flota.** Mientras `Σq > min(B, Σ Cᵥ)`, quitar un lote al centro de **menor prioridad** con cantidad positiva; desempate por orden fijo de ID (lexicográfico).
3. **Empaquetado por capacidad** (*first-fit decreasing*). Ordenar las entregas por `qᵢ` descendente, desempate por posición en `π`; cada una va al **primer** vehículo (orden de ID) con espacio suficiente.
4. **Si el empaquetado falla**, quitar un lote al centro de menor prioridad y reintentar hasta obtener rutas viables.
5. **Rutas.** Los centros de cada vehículo se visitan en el **suborden de `π`**; se añade el depósito al inicio y al final y se suman las distancias desde `D`.

Cada lote retirado queda en un registro por motivo (`dominio`, `inventario`, `capacidad_flota`, `empaquetado`) y centro. La decodificación es una **función pura** del cromosoma: no usa aleatoriedad.

La reparación es **lamarckiana**: las cantidades corregidas se escriben de vuelta en el cromosoma. Así el cromosoma publicado es factible por sí mismo y volver a decodificarlo no requiere reparar nada.

Casos vacíos (`B = 0`, todas las demandas en 0, sin centros, sin vehículos, matriz inválida): el validador los bloquea con un mensaje explícito y el motor los aborta sin dividir entre cero.

## 5. Función objetivo y fitness

```
U = Σᵢ pᵢ·(dᵢ − qᵢ) / max(1, Σᵢ pᵢ·dᵢ)          demanda ponderada no satisfecha, en [0, 1]
R = distancia_total_km / D_ref                    costo relativo de transporte
H = (# centros pᵢ = 3 con qᵢ = 0) / max(1, # centros pᵢ = 3)

J = 0,75·U + 0,20·R + 0,05·H        (minimizar)
fitness = 1 / (1 + J)               (maximizar; siempre > 0)
```

- Los pesos son **parámetros experimentales** de demostración, no valores institucionales. En modo «Experimental» se pueden variar (deben sumar 1).
- El fitness se calcula **después** de reparar y decodificar.
- Mayor `J` implica menor fitness (transformación estrictamente decreciente).
- Código: `backend/app/ga/fitness.py`.

### Línea base y `D_ref`

Heurística determinista (`backend/app/baselines/`):

1. Recorrer los centros por **prioridad descendente**, desempate por ID.
2. Cantidad objetivo = `min(dᵢ, máx Cᵥ, inventario restante)`.
3. Va al primer vehículo donde cabe completa; si no cabe en ninguno, entrega parcial en el vehículo con más espacio libre; si no queda espacio, el centro no se atiende.
4. Cada ruta se ordena por **vecino más cercano** desde el depósito.

`D_ref` es la distancia total de esa solución. Si no contiene viajes se usa `D_ref = 1 km` **solo como convención de normalización**, y la API lo informa (`d_ref_is_convention`). El AG y la línea base se comparan con exactamente la misma matriz, unidades, inventario, prioridades, `D_ref` y función `J`.

### Métricas auxiliares

Lotes entregados y pendientes, inventario remanente, demanda ponderada cubierta, cobertura ponderada (`1 − U`), centros atendidos y atendidos por completo, centros de prioridad alta sin entrega, vehículos usados, km totales, carga por vehículo, factibilidad, tiempo de CPU, evaluaciones, generaciones y criterio de parada. No se informa «personas alimentadas».

## 6. Algoritmo genético

| Componente | Implementación | Parámetro (preset estándar) |
|---|---|---|
| Población inicial | 70 % aleatoria, 20 % sesgada por prioridad, 10 % heurística perturbada | `N = 100` |
| Selección | Torneo: `k` individuos distintos al azar, gana el de mayor fitness | `k = 3` |
| Cruce de `π` | Order Crossover (OX, variante circular de Davis) | `p_c = 0,90` |
| Cruce de `q` | Uniforme gen por gen (mismo centro en ambos padres) | mismo evento que OX |
| Mutación de `π` | Intercambio de dos centros **o** inversión de subcadena (50/50) | `p_π = 0,15` por individuo |
| Mutación de `q` | ±1…±3 lotes, saturado al dominio | `p_q = 0,08` por gen |
| Reemplazo | Generacional con elitismo (copias exactas) | `élite = 2` |
| Parada | Generaciones máximas o estancamiento sin mejora ≥ tolerancia | `G_max = 200`, 35 gen., `10⁻⁶` |
| Aleatoriedad | Un único `numpy.random.Generator(PCG64(seed))` en todo el flujo | semillas 11, 22, 33, 44 |

### Población inicial

- **Aleatorios (70):** `π` al azar; `qᵢ ~ U{0 … min(dᵢ, máx Cᵥ)}`.
- **Sesgados por prioridad (20):** `π` al azar; `qᵢ` con piso según prioridad (`p=3` → ≥ 70 % del tope, `p=2` → ≥ 40 %, `p=1` → sin piso). Es un sesgo de muestreo, no una regla.
- **Heurística perturbada (10):** parte de la línea base codificada como `(π, q)` y aplica de 1 a 3 mutaciones de `π` y ±1…±3 lotes en ~15 % de los genes.

Los 100 pasan por la misma reparación y decodificación antes de evaluarse.

### Pseudocódigo

```text
validar escenario y calcular matriz de distancias
construir línea base determinista y D_ref
P0 ← población inicial; reparar, decodificar y evaluar
mejor_global ← mejor(P0)
para t = 1 … G_max:
    nueva ← copias exactas de los 2 mejores de P(t−1)
    mientras |nueva| < N:
        padre1, padre2 ← torneo(P(t−1), k = 3)
        (π, q) de los hijos ← OX + uniforme con probabilidad p_c; si no, copias
        mutar π y q; reparar + decodificar + evaluar cada hijo
    P(t) ← nueva
    actualizar mejor_global, historial y contador de estancamiento
validar la mejor solución desde cero
```

Por generación se registran: mejor fitness, fitness promedio, mejor `J` y **diversidad** (proporción de permutaciones `π` distintas en la población).

## 7. Reproducibilidad

Mismo escenario (hash), semilla, parámetros y versión de código producen el mismo historial y el mismo cromosoma. Se cumple porque: un único generador PCG64 alimenta todo; no hay paralelismo (un worker ejecuta las corridas de una en una); la decodificación es determinista; `numpy` está fijado a una versión exacta. Cada corrida guarda semilla, parámetros, hash del escenario y versión. Lo único no reproducible es el tiempo de CPU.

## 8. Escasez estructural y entregas parciales

Si `Σ dᵢ > min(B, Σ Cᵥ)` hay **escasez estructural**: ninguna solución cubre toda la demanda. El validador la cuantifica (demanda total, inventario, capacidad de flota, máximo entregable y lotes que quedarán sin cubrir como mínimo). Si `dᵢ > máx Cᵥ`, el centro solo puede recibir una entrega parcial; se marca «solo parcial» y nunca se presenta como satisfacción completa.

## 9. Precisiones de implementación

Decisiones que el plan dejaba abiertas y cómo se resolvieron:

| Tema | Decisión |
|---|---|
| Desempate de la reparación | Orden fijo de ID (el plan permitía ID o RNG). Hace que la decodificación sea determinista. |
| «Orden fijo de ID» | Orden lexicográfico de los identificadores (`C01 < C02 < … < C10`). |
| Reparación | Lamarckiana: el cromosoma queda reparado. |
| `H` con centros sin demanda | Solo cuentan los centros `p = 3` con `dᵢ > 0`: un centro sin demanda no puede quedar desatendido. |
| Estancamiento | Se compara contra el último nivel que contó como mejora, para no perder mejoras diminutas acumuladas. |
| Torneo | Sin reemplazo dentro del torneo; en empate gana el primero extraído. |
| Mutación de `π` | Cuando ocurre, intercambio o inversión con probabilidad 0,5 cada una. |
| Diversidad | Proporción de permutaciones distintas (ejemplo del informe). |
| Individuos heurísticos | Los 10 se perturban; no se inyecta la línea base intacta, para que la comparación con ella sea limpia. |
| Mejoras locales (inserción, intercambio entre rutas) | Fuera del MVP, como indica el plan. |

Consecuencia que conviene explicar en una exposición: el decodificador decide el vehículo de cada centro por tamaño de entrega y posición en `π`, no por cercanía geográfica. El AG influye en las rutas mediante el orden de `π` y las cantidades, pero no «dibuja» zonas de reparto directamente. Es una limitación del modelo acordado, no un defecto del programa.
