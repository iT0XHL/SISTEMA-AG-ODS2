# Guía de replicación de las cuatro corridas

*NutriRuta AG · Optimización de la asignación y las rutas de distribución de alimentos a comedores populares y ollas comunes de Cañete mediante algoritmos genéticos*

- Versión del programa: 1.0.0
- Escenario: demo-cañete-001 (18 centros ficticios, datos sintéticos)
- Semillas oficiales: 11, 22, 33 y 44
- Fecha de las cifras: 18 de noviembre de 2026

## 1. Qué vas a lograr

Al terminar esta guía habrás ejecutado en tu computadora las **cuatro corridas oficiales** del algoritmo genético y habrás obtenido **exactamente los mismos resultados** que aparecen en el informe: el mismo puntaje J, los mismos lotes entregados, las mismas rutas y el mismo número de generaciones. Solo cambia el tiempo de CPU, que depende de cada equipo.

Las cuatro corridas usan el mismo escenario y los mismos parámetros; lo único que cambia es la **semilla** (11, 22, 33 y 44), el número que fija el azar del algoritmo. Con la misma semilla, el mismo escenario y los mismos parámetros, el resultado es siempre el mismo. Por eso cualquiera de tus compañeros puede comprobarlo.

| Para qué sirve | Dónde |
|---|---|
| Levantar el sistema y replicar paso a paso desde la interfaz | Secciones 3 y 4 |
| Replicar con un script (sin hacer clic) | Sección 5.1 |
| Replicar con archivos de ejemplo (JSON o CSV) | Sección 5.2 |
| Llenar el escenario a mano | Sección 5.3 y 6 |
| Comprobar que tus cifras coinciden | Secciones 7 y 8 |
| Entender qué significan los resultados | Sección 9 |
| Resolver problemas | Sección 11 |

> Tiempo estimado: unos 15 minutos la primera vez (la mayor parte es la descarga y construcción de Docker). Cada corrida del algoritmo dura menos de un segundo.

## 2. Antes de empezar

### 2.1 Qué necesitas

| Requisito | Detalle |
|---|---|
| Docker Desktop | Windows o macOS; en Linux, Docker Engine con Compose v2. Debe estar abierto y con el motor iniciado. |
| Espacio y memoria | Unos 2 GB libres en disco y 1,5 GB de memoria para los cuatro contenedores. |
| Puertos libres | 8090 (aplicación web) y 8010 (API). Se pueden cambiar en el archivo .env. |
| Navegador | Edge, Chrome o Firefox actualizados. |
| Python 3.10 o superior (opcional) | Solo para el script de la sección 5.1. No necesita instalar paquetes. |
| Internet (opcional) | Solo para el fondo del mapa (OpenStreetMap). Sin internet, las rutas y las tablas funcionan igual. |
| El proyecto | La carpeta SISTEMA-AG-ODS2 (clonada de Git o copiada), con el código en la versión 1.0.0. |

### 2.2 Cuatro ideas que conviene tener claras

- **Lote:** unidad de reparto de alimentos no perecibles. No es una persona: el programa no mide hambre ni personas atendidas.
- **Semilla:** número entero que fija el azar de la corrida. Misma semilla, mismo resultado.
- **J:** puntaje total de un reparto. Combina la demanda sin cubrir, la distancia recorrida y los centros de prioridad alta sin entrega. **Menor es mejor.** Se calcula como J = 0,75·U + 0,20·R + 0,05·H.
- **Línea base:** un reparto simple de referencia (atiende por prioridad y ordena cada ruta por el vecino más cercano). Sirve para saber si el algoritmo genético mejora algo.

## 3. Levantar el sistema

1. Abre una terminal (PowerShell, Git Bash o la terminal de tu sistema) y entra a la carpeta del proyecto: `cd SISTEMA-AG-ODS2`.
2. Ejecuta: `docker compose up -d --build --wait`. La primera vez descarga y construye las imágenes; puede tardar varios minutos.
3. Comprueba con `docker compose ps` que db, api y frontend estén en «healthy» y que el worker aparezca como «Up».
4. Abre http://localhost:8090 en el navegador. Debes ver la pantalla de inicio de NutriRuta AG.
5. Verifica el estado técnico en http://localhost:8090/health: debe responder status «ok» y database «ok».

```bash
cd SISTEMA-AG-ODS2
docker compose up -d --build --wait
docker compose ps
```

| Servicio | Dirección | Para qué |
|---|---|---|
| Aplicación web | http://localhost:8090 | La interfaz que usarás |
| API (documentación interactiva) | http://localhost:8010/docs | Consultar los datos y probar endpoints |
| Estado técnico | http://localhost:8090/health | Comprobar que todo responde |

> Para apagar el sistema usa `docker compose down` (conserva los datos). Con `docker compose down -v` se borran escenarios y corridas guardadas.

## 4. Replicar las cuatro corridas desde la interfaz

Es el camino recomendado: ves cada resultado en pantalla y puedes explorarlo.

### Paso 1. Cargar el escenario

1. En **Inicio**, pulsa **«Usar el escenario demo»**. Se crea y se activa el escenario sintético de 18 centros y la aplicación te lleva a Configuración.
2. Si prefieres hacerlo desde el archivo de ejemplo: **Escenario → Nuevo escenario → Subir un archivo** y elige `escenario_ejemplo.json` (se descarga desde esa misma pantalla). Luego entra al paso 4 «Distancias y validación», pulsa **Validar escenario** y después **Guardar y activar**.
3. Comprueba que el escenario tiene 18 centros, 3 vehículos de 50 lotes, inventario de 135 lotes y demanda total de 181 lotes. Su identificador (hash) empieza con `4d139880bd`.

> El archivo escenario_ejemplo.json y el escenario demo producen el mismo hash, es decir, son el mismo escenario.

### Paso 2. Revisar la configuración

1. Ve a **Configuración AG**. Deja el **preset estándar** (valores bloqueados). No cambies nada: las cuatro corridas oficiales usan exactamente estos valores.
2. Los parámetros están en «Ajustes avanzados» por si quieres verlos; coinciden con la tabla de la sección 6.2.

### Paso 3. Ejecutar la primera corrida (semilla 11)

1. Elige la semilla **11** y pulsa **«Ejecutar AG con semilla 11»**.
2. En **Ejecución** verás el avance por generaciones. Al terminar aparece «Solución validada».
3. Debe haber terminado en la generación 99 por estancamiento, con un mejor fitness de 0,79191.
4. Pulsa **«Ver resultados»**. En la parte superior debes ver J = 0,26278 frente a 0,30455 de la línea base.

### Paso 4. Lanzar las cuatro corridas oficiales

1. Ve a **Cuatro corridas** y pulsa **«Lanzar las cuatro corridas»**. Se ejecutan las semillas 11, 22, 33 y 44 una tras otra; tarda unos segundos.
2. Cuando el estado sea «Completada», compara la tabla con la sección 7.1 de esta guía.
3. Usa **Exportar CSV** y **Exportar JSON** para guardar la evidencia.

### Paso 5. Explorar el resultado

- **Resultados → Explicación:** cuenta en lenguaje claro qué hizo el algoritmo, a quién atendió primero y qué ganó y cedió frente a la línea base.
- **Asignación:** cuánto recibe cada centro y el cromosoma; el desplegable «Cómo se pasa del cromosoma a las rutas» lo explica en cuatro pasos.
- **Rutas:** mapa por vehículo y el desplegable «Recorrido paso a paso», que reproduce la ruta de cada camión parada por parada.
- **Evolución:** cómo mejora el fitness generación a generación y el ciclo del algoritmo.
- **Detalle técnico:** la comparación completa con la línea base, los componentes de J y la validación de restricciones.

## 5. Otras formas de replicar

### 5.1 Con el script (sin hacer clic)

El script ejecuta las cuatro corridas contra el sistema ya levantado y guarda la evidencia en archivos. Solo usa la biblioteca estándar de Python.

```bash
python scripts/export_four_runs.py --api http://localhost:8090 --out evidencia-replica
```

Genera, dentro de la carpeta indicada: la tabla oficial (`cuatro_corridas.csv` y `tabla_cuatro_corridas.md`), el experimento completo con historiales (`cuatro_corridas.json`), la asignación por centro de cada semilla (`asignaciones_seed11.csv` … `asignaciones_seed44.csv`) y el escenario. En Windows también puedes usar `powershell -ExecutionPolicy Bypass -File scripts\demo.ps1`, que levanta todo y ejecuta las corridas.

### 5.2 Con los archivos de ejemplo

Desde **Escenario → Nuevo escenario → Subir un archivo** se aceptan CSV, Excel y JSON; el formato se detecta solo. Los ejemplos están en la carpeta `frontend/public/ejemplos/` y se descargan desde esa misma pantalla.

| Archivo | Contiene | Qué hacer después |
|---|---|---|
| escenario_ejemplo.json | El escenario completo: depósito, 3 vehículos, inventario, 18 centros, distancias en línea recta y procedencia. | Validar y guardar. Es idéntico al escenario demo (mismo hash). |
| centros_ejemplo.csv | Solo los 18 centros: codigo, nombre, distrito, direccion, latitud, longitud, demanda_lotes, prioridad. | Pulsar «Depurar e importar» y «Usar estos 18 centros»; luego completar depósito, vehículos e inventario (sección 6.3) y validar. |

> Si subes un CSV con columnas de datos personales (DNI, nombres de personas, sexo, teléfono), el sistema las detecta, las descarta y no las muestra ni las guarda.

### 5.3 Llenando el escenario a mano

Si quieres practicar el llenado, crea el escenario desde cero con los datos de la sección 6. El asistente tiene cuatro pasos y cada uno indica qué falta:

1. **Centros:** al menos 5, cada uno con demanda y coordenadas (en modalidad línea recta).
2. **Depósito y vehículos:** coordenadas del depósito y capacidad de cada vehículo.
3. **Inventario y prioridades:** inventario total en lotes y prioridad de cada centro (1 a 3).
4. **Distancias y validación:** modalidad de distancia (línea recta, solo simulación), nombre del escenario y **Validar escenario**.

## 6. Datos de entrada del escenario

### 6.1 Depósito, vehículos e inventario

| Dato | Valor |
|---|---|
| Depósito | DEPOT · Depósito ficticio · latitud -13.07 · longitud -76.39 |
| Vehículos | V01: 50 lotes · V02: 50 lotes · V03: 50 lotes (capacidad total 150) |
| Inventario | 135 lotes |
| Demanda total | 181 lotes (demanda ponderada 330) |
| Distancias | Línea recta (Haversine), solo simulación. No son kilómetros de carretera. |
| Origen de los datos | Sintético. Semilla del generador del escenario: 2026 (distinta de las semillas del algoritmo). |
| Hash SHA-256 | 4d139880bd4e6e2cabc286c0e37ff6a2cf964c2f1d0a37d14aca5933f3ebb1f4 |

Hay **escasez estructural**: la demanda (181 lotes) supera al inventario (135), así que al menos 46 lotes quedan sin cubrir en cualquier solución.

### 6.2 Parámetros del preset estándar (idénticos en las cuatro corridas)

| Parámetro | Valor | Parámetro | Valor |
|---|---|---|---|
| Tamaño de población | 100 | Elitismo | 2 |
| Generaciones máximas | 200 | Estancamiento | 35 generaciones, tolerancia 10⁻⁶ |
| Torneo (k) | 3 | Población inicial | 70 % aleatoria · 20 % por prioridad · 10 % heurística |
| Probabilidad de cruce | 0,90 | Pesos de J (U · R · H) | 0,75 · 0,20 · 0,05 |
| Mutación de π (por individuo) | 0,15 | Mutación de q (por gen) | 0,08, paso máximo 3 lotes |

### 6.3 Los 18 centros

| Centro | Distrito | Latitud | Longitud | Demanda (lotes) | Prioridad |
|---|---|---|---|---|---|
| C01 | Zona ilustrativa Sur | -13.10032 | -76.31681 | 10 | 1 |
| C02 | Zona ilustrativa Centro | -13.08096 | -76.29723 | 11 | 3 |
| C03 | Zona ilustrativa Sur | -13.10049 | -76.31514 | 7 | 3 |
| C04 | Zona ilustrativa Norte | -13.01882 | -76.31734 | 9 | 2 |
| C05 | Zona ilustrativa Centro | -13.06333 | -76.29263 | 13 | 1 |
| C06 | Zona ilustrativa Sur | -13.08943 | -76.37058 | 10 | 2 |
| C07 | Zona ilustrativa Centro | -13.0726 | -76.31379 | 15 | 1 |
| C08 | Zona ilustrativa Centro | -13.07983 | -76.3746 | 6 | 2 |
| C09 | Zona ilustrativa Centro | -13.07212 | -76.361 | 16 | 3 |
| C10 | Zona ilustrativa Norte | -13.03228 | -76.32113 | 8 | 1 |
| C11 | Zona ilustrativa Norte | -13.01585 | -76.32676 | 12 | 3 |
| C12 | Zona ilustrativa Sur | -13.08487 | -76.30952 | 10 | 1 |
| C13 | Zona ilustrativa Sur | -13.09123 | -76.30889 | 10 | 1 |
| C14 | Zona ilustrativa Centro | -13.0562 | -76.37544 | 8 | 2 |
| C15 | Zona ilustrativa Centro | -13.05967 | -76.3192 | 6 | 1 |
| C16 | Zona ilustrativa Centro | -13.06557 | -76.3389 | 10 | 2 |
| C17 | Zona ilustrativa Centro | -13.05651 | -76.34588 | 14 | 2 |
| C18 | Zona ilustrativa Centro | -13.06287 | -76.35755 | 6 | 1 |

Prioridades: 8 centros con prioridad 1, 6 centros con prioridad 2, 4 centros con prioridad 3. Las prioridades son simuladas con fines de demostración; no representan una clasificación institucional.

## 7. Resultados esperados

Estas son las cifras que debes obtener. Todas salen de la aplicación en ejecución; no se calcularon aparte.

### 7.1 Tabla maestra

| Semilla | J | Fitness | Lotes entregados | Cobertura ponderada | Distancia (km) | Vehículos | Generaciones |
|---|---|---|---|---|---|---|---|
| 11 | 0,26278 | 0,79191 | 135 / 181 | 85,76 % | 62,61 | 3 | 99 |
| 22 | 0,26275 | 0,79192 | 130 / 181 | 84,24 % | 58,04 | 3 | 123 |
| 33 | 0,26344 | 0,79149 | 135 / 181 | 85,76 % | 62,87 | 3 | 112 |
| 44 | 0,26603 | 0,78987 | 135 / 181 | 85,45 % | 63,00 | 3 | 89 |
| Línea base | 0,30455 | 0,76655 | 135 / 181 | 86,06 % | 80,29 | 3 | — |

Las cuatro corridas terminaron por **estancamiento** (35 generaciones seguidas sin mejora), antes del máximo de 200. Todas las soluciones son factibles. Media del AG: J = 0,26375 ± 0,00156 (desviación estándar muestral); fitness 0,79130 ± 0,00097; cobertura ponderada 85,30 % ± 0,72; distancia 61,63 ± 2,40 km.

### 7.2 Componentes de J

La distancia de referencia es D_ref = 80,287044 km (la distancia de la línea base) y es la misma en todas las filas. J = 0,75·U + 0,20·R + 0,05·H.

| Semilla | U (demanda ponderada no cubierta) | R (km / D_ref) | H (prioridad alta sin entrega) | J | CPU (s)* |
|---|---|---|---|---|---|
| 11 | 0,14242 | 0,77979 | 0,00000 | 0,26278 | 0,642 |
| 22 | 0,15758 | 0,72285 | 0,00000 | 0,26275 | 0,736 |
| 33 | 0,14242 | 0,78311 | 0,00000 | 0,26344 | 0,690 |
| 44 | 0,14545 | 0,78472 | 0,00000 | 0,26603 | 0,561 |
| Línea base | 0,13939 | 1,00000 | 0,00000 | 0,30455 | — |

> *El tiempo de CPU depende del equipo y cambia en cada ejecución (en este equipo, entre 0,5 y 0,8 s). Es la única cifra que no tiene por qué coincidir.

### 7.3 Evolución de la población

| Semilla | Mejor fitness inicial | Mejor fitness final | Promedio final | Diversidad final | Última generación |
|---|---|---|---|---|---|
| 11 | 0,75906 | 0,79191 | 0,77325 | 53 % | 99 |
| 22 | 0,74502 | 0,79192 | 0,74679 | 92 % | 123 |
| 33 | 0,75257 | 0,79149 | 0,76878 | 80 % | 112 |
| 44 | 0,75126 | 0,78987 | 0,75201 | 93 % | 89 |

La diversidad cuenta cuántos órdenes de visita (π) distintos hay en la población; no compara las cantidades q, así que describe solo una parte de la variedad.

### 7.4 Rutas de cada corrida

| Semilla | V01 | V02 | V03 |
|---|---|---|---|
| 11 | C11→C04→C17→C09 · 50 lotes · 20,94 km | C12→C02→C07→C16→C14 · 49 lotes · 21,42 km | C18→C13→C03→C06→C08 · 36 lotes · 20,25 km |
| 22 | C11→C04→C17→C09 · 50 lotes · 20,94 km | C16→C07→C05→C02→C03 · 50 lotes · 24,62 km | C18→C14→C08→C06 · 30 lotes · 12,48 km |
| 33 | C11→C04→C17→C09 · 50 lotes · 20,94 km | C06→C12→C02→C07→C16 · 50 lotes · 21,46 km | C08→C03→C13→C18→C14 · 35 lotes · 20,48 km |
| 44 | C09→C17→C04→C11 · 50 lotes · 20,94 km | C07→C02→C12→C16→C14 · 49 lotes · 21,81 km | C18→C13→C03→C06→C08 · 36 lotes · 20,25 km |

Todas las rutas salen del depósito (DEPOT) y vuelven a él. La ruta de V01 es la misma en las cuatro corridas (en la semilla 44, recorrida en sentido inverso).

### 7.5 Lotes que recibe cada centro

| Centro | Prioridad | Demanda | Sem. 11 | Sem. 22 | Sem. 33 | Sem. 44 | Línea base |
|---|---|---|---|---|---|---|---|
| C01 | 1 | 10 | 0 | 0 | 0 | 0 | 10 |
| C02 | 3 | 11 | 11 | 11 | 11 | 11 | 11 |
| C03 | 3 | 7 | 7 | 7 | 7 | 7 | 7 |
| C04 | 2 | 9 | 8 | 8 | 8 | 9 | 9 |
| C05 | 1 | 13 | 0 | 12 | 0 | 0 | 13 |
| C06 | 2 | 10 | 10 | 10 | 10 | 10 | 10 |
| C07 | 1 | 15 | 10 | 10 | 9 | 10 | 9 |
| C08 | 2 | 6 | 6 | 6 | 6 | 6 | 6 |
| C09 | 3 | 16 | 16 | 16 | 16 | 15 | 16 |
| C10 | 1 | 8 | 0 | 0 | 0 | 0 | 0 |
| C11 | 3 | 12 | 12 | 12 | 12 | 12 | 12 |
| C12 | 1 | 10 | 10 | 0 | 10 | 10 | 0 |
| C13 | 1 | 10 | 7 | 0 | 8 | 7 | 0 |
| C14 | 2 | 8 | 8 | 8 | 8 | 8 | 8 |
| C15 | 1 | 6 | 0 | 0 | 0 | 0 | 0 |
| C16 | 2 | 10 | 10 | 10 | 10 | 10 | 10 |
| C17 | 2 | 14 | 14 | 14 | 14 | 14 | 14 |
| C18 | 1 | 6 | 6 | 6 | 6 | 6 | 0 |
| Total |  | 181 | 135 | 130 | 135 | 135 | 135 |

## 8. Cómo comprobar que tu réplica coincide

1. **Hash del escenario:** en Resultados → Detalle técnico debe empezar con `4d139880bd`.
2. **Versión del programa:** 1.0.0.
3. **J de cada semilla:** debe coincidir en los 5 decimales de la tabla 7.1 (0,26278 · 0,26275 · 0,26344 · 0,26603).
4. **Generaciones, lotes y kilómetros:** deben coincidir exactamente (99, 123, 112 y 89 generaciones).
5. **Rutas:** deben ser las de la tabla 7.4.
6. **Línea base:** J = 0,30455 y 80,29 km.

### Si algo no coincide

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El hash del escenario es distinto | El escenario no es el mismo (datos llenados a mano o modificados). | Carga la demo o el archivo escenario_ejemplo.json. |
| Los parámetros no son los de la tabla 6.2 | Quedó activo el modo Experimental o se editó algún valor. | En Configuración AG elige el preset estándar. |
| La semilla no es 11, 22, 33 o 44 | Se escribió otra semilla. | Usa los botones de semilla oficiales. |
| Los resultados difieren en las últimas cifras | Versión del código distinta de 1.0.0. | Usa la versión 1.0.0 y reconstruye con `docker compose up -d --build`. |
| Solo cambia el tiempo de CPU | Normal: depende del equipo. | No es un error. |

## 9. Cómo interpretar los resultados

Esta sección resume lo que dice cada resultado, en el mismo lenguaje que usa la pestaña **Explicación** de la aplicación.

### 9.1 ¿El algoritmo mejora algo?

Sí, según el puntaje J: las cuatro corridas obtienen menos J que la línea base (0,26375 de media frente a 0,30455; unos 13,4 % menos). Casi toda la mejora viene de la **distancia**: el algoritmo recorre entre 58,04 y 63,00 km frente a 80,29 km de la línea base. La línea base reparte los centros entre los vehículos por orden de prioridad, sin mirar qué tan cerca están entre sí, y eso alarga sus rutas.

### 9.2 ¿Qué cede a cambio?

La cobertura ponderada del algoritmo (84,2 % a 85,8 %) es ligeramente menor que la de la línea base (86,1 %). Con los pesos 0,75 / 0,20 / 0,05, el ahorro de distancia compensa esa pérdida; con otros pesos el balance podría invertirse. **No mejoran todos los indicadores a la vez**: es un compromiso, y es importante contarlo así.

### 9.3 ¿Por qué la semilla 22 tiene el menor J si entrega menos lotes?

La semilla 22 entrega 130 lotes (deja 5 sin repartir) y recorre solo 58,04 km. Renuncia a una pequeña parte de la entrega para acortar la ruta del vehículo V03 a 12,48 km. Como el objetivo suma demanda, distancia y prioridad, esa pérdida compensa y su J (0,26275) resulta el menor de las cuatro. No significa que sea «la mejor» en todo sentido.

### 9.4 ¿A quién se atiende primero?

| Prioridad (semilla 22) | Centros | Completos | Parciales | Sin entrega | Lotes entregados / pedidos |
|---|---|---|---|---|---|
| 3 | 4 | 4 | 0 | 0 | 46 / 46 |
| 2 | 6 | 5 | 1 | 0 | 56 / 57 |
| 1 | 8 | 1 | 2 | 5 | 28 / 78 |

Como el inventario no alcanza, el algoritmo concentra los lotes en los centros de prioridad alta: en las cuatro corridas ningún centro de prioridad 3 se queda sin entrega (H = 0). Los centros sin entrega son todos de prioridad baja. Un centro puede recibir una entrega parcial cuando el vehículo ya va lleno (por ejemplo, 50 de 50 lotes) o cuando su demanda supera la capacidad de un vehículo.

### 9.5 ¿Es la mejor solución posible?

No se puede asegurar. Un algoritmo genético es una búsqueda guiada por el azar: encuentra buenas soluciones, pero no demuestra que sean óptimas. Las cuatro corridas terminaron por estancamiento, lo que indica que la búsqueda dejó de mejorar, no que no exista algo mejor. Que las cuatro semillas lleguen a repartos distintos con un J casi igual (desviación estándar 0,0016) muestra que el método es estable en este escenario.

### 9.6 Lo que estos resultados no permiten afirmar

- Que el algoritmo encuentre el óptimo global.
- Que la ventaja se mantenga en otros escenarios: cuatro semillas sobre un solo escenario sintético no bastan para generalizar.
- Que las distancias correspondan a recorridos reales: son en línea recta.
- Nada sobre personas atendidas, estado nutricional ni inseguridad alimentaria: la unidad es el lote.

## 10. Para experimentar (opcional)

- En **Configuración AG → Ajustes avanzados** elige el modo **Experimental** para cambiar población, probabilidades, pesos y generaciones. Esas corridas **no** forman parte del experimento oficial.
- Cada etapa del algoritmo tiene un desplegable «Ver cómo funciona» con un ejemplo gráfico (torneo, cruce, mutación, elitismo, parada).
- Prueba otra semilla (por ejemplo, 7 o 100) para ver cuánto varía el reparto.
- Sube un CSV propio con tus centros. Recuerda que el programa necesita demanda, coordenadas (o una matriz vial) y al menos 5 centros.

## 11. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Puerto ocupado al levantar | Otro programa usa 8090 u 8010. | Copia .env.example a .env y cambia FRONTEND_PORT o API_PORT. |
| «No hay conexión con el servidor» | La API está caída o arrancando. | `docker compose ps` y `docker compose logs api`. |
| Una corrida queda «En cola» | El worker no está en ejecución. | `docker compose restart worker`. |
| Docker no responde | Docker Desktop apagado. | Ábrelo y espera a que el motor esté listo. |
| El mapa sale sin fondo | Sin internet o teselas bloqueadas. | Desactiva «Mapa base»; las rutas y las tablas siguen funcionando. |
| Error al validar el escenario | Faltan datos (demanda, coordenadas, capacidad o inventario). | El asistente indica qué falta en cada paso; corrige y vuelve a validar. |
| Corrida «fallida» con WORKER_INTERRUPTED | El worker se reinició a mitad de la corrida. | Vuelve a ejecutarla. |

## Anexo A. Dónde está cada cosa en el código

| Elemento | Ubicación |
|---|---|
| Cromosoma, reparación y decodificación | backend/app/ga/chromosome.py, repair.py, decoder.py |
| Función fitness (U, R, H, J) | backend/app/ga/fitness.py |
| Selección, cruce y mutación | backend/app/ga/selection.py, crossover.py, mutation.py |
| Población inicial y bucle evolutivo | backend/app/ga/initialization.py, evolution.py |
| Parámetros del preset estándar | backend/app/ga/params.py |
| Línea base | backend/app/baselines/priority_greedy.py |
| Escenario demo y fixtures | backend/app/data/demo.py y fixtures/demo/scenario.json |
| Interfaz (React + TypeScript) | frontend/src/pages y frontend/src/components |
| Archivos de ejemplo | frontend/public/ejemplos/ |
| Evidencia de las corridas | docs/evidencia/ |

## Anexo B. Lista de verificación para el informe

- Indicar versión del programa (1.0.0), identificador y hash del escenario, y semillas 11, 22, 33 y 44.
- Presentar la tabla 7.1 con la nota «distancias en línea recta, no viales».
- Explicar el compromiso entre distancia y cobertura (sección 9.2), sin afirmar que todos los indicadores mejoran.
- Aclarar que los datos son sintéticos y que la unidad es el lote, no la persona.
- No mezclar resultados de ejecuciones distintas; si se repite con otro escenario o versión, reemplazar todas las cifras.
- Conservar los archivos exportados (CSV y JSON) como evidencia.

Documentación complementaria en el repositorio: docs/guia-de-uso.md, docs/modelo-matematico.md, docs/evidencia-corridas.md, docs/despliegue.md y docs/pruebas.md.
