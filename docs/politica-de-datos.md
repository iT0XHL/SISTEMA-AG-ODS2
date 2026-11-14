# Política de datos

Qué datos usa NutriRuta AG, cuáles rechaza y cómo deben interpretarse.

## 1. Principios

1. **La unidad es el lote, no la persona.** El modelo trabaja con centros (instituciones) y lotes homogéneos de alimentos no perecibles.
2. **Sin datos personales.** No se importan, muestran, almacenan ni registran DNI, nombres de personas, sexo, teléfonos, correos, fechas de nacimiento ni edades.
3. **Cada dato declara su origen.** `synthetic` (sintético), `official` (tomado de un padrón oficial) o `declared` (declarado por el usuario). La demanda distingue además `inferred` (derivada de una regla).
4. **No se inventa precisión.** La demo usa nombres ficticios; nunca combina nombres reales con coordenadas inventadas.
5. **Una simulación no es una medición.** Ninguna cifra de la aplicación mide hambre, estado nutricional ni personas alimentadas.

## 2. Qué justifica cada fuente

| Fuente | Qué justifica | Qué no justifica |
|---|---|---|
| Naciones Unidas, ODS 2, meta 2.1 | Pertinencia del acceso a alimentos inocuos, nutritivos y suficientes | Que mejorar rutas mida una reducción del hambre |
| Programa Mundial de Alimentos, ficha Perú | Contexto nacional de inseguridad alimentaria (51,7 % en 2024) | Demanda de centros específicos de Cañete |
| Defensoría del Pueblo (2025), Informe Defensorial 242 | Problemas de gestión y abastecimiento | Que una ruta concreta sea deficiente sin medición |
| MIDIS (22/05/2026) | Existencia y relevancia de comedores y ollas comunes | Que todas las organizaciones reciban víveres por reparto |
| Municipalidad Provincial de Cañete (2026), padrón | Nombres y direcciones institucionales | Coordenadas verificadas, demanda por período, stock o distancias viales |
| Material de clase de R. Delgadillo | Base pedagógica de AG | Evidencia de eficacia del prototipo |

Enlaces en el [README](../README.md#fuentes).

## 3. Modos de carga

### Modo DEMO

Generador determinista (`backend/app/data/demo.py`): 15 a 20 centros «Centro ficticio NN», coordenadas en un área ilustrativa, demandas de 6 a 16 lotes y prioridades simuladas al azar. Tres vehículos de 50 lotes e inventario de 135. Todo queda marcado `synthetic` y la interfaz muestra la insignia «Simulación · datos sintéticos». Ninguna de estas cantidades es una estadística de Cañete ni el stock de una institución.

### Modo PADRÓN

El usuario descarga el recurso oficial, **revisa su fecha y licencia** y sube una copia local. A la fecha de redacción, la página del conjunto de datos indicaba formato XLSX, licencia *Open Data Commons Attribution* y última modificación en enero de 2026; verifíquelo antes de usarlo, porque puede cambiar.

El importador aplica una **lista permitida**:

| Campo permitido | Uso |
|---|---|
| Código del centro | Identificador; rechaza duplicados |
| Nombre institucional | Nombre del comedor u olla |
| Distrito, dirección institucional | Ubicación administrativa |
| Estado | Para ignorar centros inactivos |
| Número agregado de usuarios | Solo como cifra agregada |
| Latitud, longitud | Se validan únicamente si están presentes |
| Demanda, prioridad | Solo si provienen de una columna institucional |

Reglas del proceso:

- Las columnas cuyo encabezado corresponde a datos personales (DNI o documento, sexo o género, nombres y apellidos, presidenta, representante, socias, beneficiarios, teléfono, correo, fecha de nacimiento, edad) **no se pueden asignar a ningún campo**. Se descartan antes de construir cualquier resultado y se reportan como removidas. Sus valores nunca se copian ni se devuelven.
- Las columnas no asignadas se descartan.
- El archivo se procesa en memoria; no se escribe en disco ni se guarda en la base de datos.
- Se ignoran filas inactivas, se rechazan duplicados por código y filas sin nombre, y se estandarizan distrito y dirección.
- Coordenadas fuera de rango o incompletas se omiten con un aviso; **no se geocodifican direcciones**.

El informe de importación muestra filas aceptadas, duplicadas, inactivas, rechazadas (con motivo), columnas descartadas y campos personales removidos.

Además, la API rechaza con `422` cualquier escenario cuyo cuerpo traiga campos fuera del contrato, y la interfaz descarta esos campos al abrir un archivo JSON.

## 4. Demanda y prioridad

- **La cantidad de usuarios no es demanda.** La demanda se carga explícitamente o se deriva con una regla declarada: `⌈usuarios × raciones por usuario / raciones por lote⌉`. La regla queda guardada en el escenario y la demanda se rotula «inferida», con una advertencia visible.
- **La prioridad es del centro.** Debe venir de un criterio institucional documentado y auditable. No se infiere vulnerabilidad de personas, barrios, sexo ni nombres. Sin criterio, se usa `pᵢ = 1` para todos. Si hay prioridades 2 o 3 en datos no sintéticos sin criterio registrado, el validador lo advierte.

## 5. Distancias

| Modalidad | Naturaleza | Uso permitido |
|---|---|---|
| Matriz vial verificada (CSV) | Km de carretera aportados por el usuario | Conclusiones operativas, si la matriz está verificada |
| Línea recta (Haversine) | Aproximación geográfica | Solo simulación; se rotula «no aptos para planificación de reparto» |

Nunca se suman km viales con km en línea recta: cada escenario tiene una única fuente de distancias y la matriz completa se guarda con ella. En el mapa, las rutas se dibujan como líneas discontinuas esquemáticas; no se simulan trazados de calles.

## 6. Qué se guarda y qué no

| Se guarda | No se guarda |
|---|---|
| Centros con campos institucionales y origen | Archivos subidos |
| Depósito, flota, inventario, matriz | Columnas descartadas del padrón |
| Corridas, parámetros, semillas, historial | Datos personales de ningún tipo |
| Soluciones validadas y línea base | Direcciones IP o identidad del usuario |

Los registros (logs) del servidor contienen identificadores de corrida y errores técnicos; no vuelcan filas de archivos ni cuerpos de solicitud.

## 7. Verificación automática

- `tests/unit/test_imports.py`: detección de encabezados personales, imposibilidad de asignarlos, ausencia de valores personales en la vista previa y en el resultado.
- `tests/integration/test_api.py::test_personal_data_never_reaches_database_or_exports`: importa un padrón ficticio con DNI, nombres, sexo y teléfono; crea un escenario; ejecuta cuatro corridas; y comprueba que ni el esquema, ni ninguna fila de ninguna tabla, ni ninguna respuesta o exportación contienen esos valores.
- `frontend/e2e/ui-flow.mjs`: lo mismo desde la interfaz.

El «padrón» de prueba (`fixtures/invalid/padron_con_pii_ficticio.csv`) es inventado.

## 8. Mapas y licencias

- Teselas de **OpenStreetMap** (© colaboradores de OpenStreetMap, ODbL), solicitadas solo si «Mapa base» está activo. Para un uso intensivo o público, revise la política de teselas de OSM o use un servidor propio.
- Tipografías IBM Plex bajo SIL Open Font License, incluidas en la aplicación (no se consultan servidores externos).
- La aplicación no requiere cuentas comerciales ni servicios de pago.

## 9. Si la demo se publica

Por defecto el despliegue es local y solo con datos ficticios. Para exponerlo en una red: añada autenticación para importar y ejecutar, límites de tasa, HTTPS, restrinja `CORS_ORIGINS` y defina la caducidad de los datos. Esto no está incluido en la versión 1.0.0.
