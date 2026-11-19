<div align="center">

<img src="frontend/public/favicon.svg" alt="Logo de NutriRuta AG" width="88">

# NutriRuta AG

**Un algoritmo genético que decide cuántos lotes de alimentos recibe cada comedor y en qué orden los visita cada vehículo.**

[![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](backend)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](frontend)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](docker-compose.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-green)](LICENSE)

[Inicio rápido](#inicio-rápido) · [Acceso](#acceso) · [Demostración](#demostración) · [Resultados](#resultados) · [Cómo funciona](#cómo-funciona) · [Producción](#producción)

![Resultados: rutas por vehículo](assets/captura-resultados.png)

</div>

NutriRuta AG es un simulador académico vinculado al **ODS 2 (Hambre cero), meta 2.1**. Toma el inventario de un depósito, la demanda de los comedores populares y ollas comunes de Cañete y la flota disponible, y propone un reparto de lotes y una ruta por vehículo. Compara siempre el resultado con una línea base simple para mostrar qué gana y qué cede el algoritmo.

> [!NOTE]
> Los datos de la demo son sintéticos y las distancias son en línea recta. El programa sirve para estudiar el comportamiento del modelo; no es un sistema oficial de despacho ni mide efectos sobre la inseguridad alimentaria.

## Qué ofrece

- **Reparto y rutas en una sola decisión:** cada solución es un cromosoma `(π, q)` con el orden de visita y los lotes de cada centro, siempre factible en inventario, capacidad y visitas únicas.
- **Explicación en lenguaje claro:** cada resultado dice a quién se atendió primero, qué ganó y qué cedió frente a la línea base y por qué algunos centros no recibieron todo.
- **Gráficos que enseñan el método:** recorrido paso a paso de cada vehículo, decodificación del cromosoma y ejemplos de torneo, cruce, mutación y elitismo.
- **Escenarios fáciles de cargar:** demo lista, archivo CSV, Excel o JSON, o llenado a mano con un asistente que indica qué falta.
- **Acceso controlado:** inicio de sesión con cuentas en la base de datos, cookies `HttpOnly` y rate limit por cliente.
- **Privacidad por diseño:** las columnas con datos personales de un padrón (DNI, nombres, sexo, teléfono) se descartan al importar.
- **Resultados reproducibles:** misma semilla, mismo escenario y mismos parámetros dan siempre la misma corrida.

## Inicio rápido

Necesitas **Docker Desktop** (o Docker Engine con Compose v2). Para exportar la evidencia desde la terminal, además, Python 3.10 o superior.

```bash
git clone https://github.com/iT0XHL/SISTEMA-AG-ODS2.git
cd SISTEMA-AG-ODS2
docker compose up -d --build --wait
```

| Servicio | Dirección |
|---|---|
| Aplicación web | http://localhost:8090 |
| API (documentación interactiva) | http://localhost:8010/docs |
| Estado técnico | http://localhost:8090/health |

> [!TIP]
> Los puertos se cambian con `FRONTEND_PORT` y `API_PORT` en un archivo `.env` (copia `.env.example`). Para ejecutar todo de una vez, `make demo` o, en Windows, `powershell -ExecutionPolicy Bypass -File scripts\demo.ps1`.

## Acceso

La aplicación pide iniciar sesión. Las cuentas se guardan en la base de datos (tabla `app_user`, con la contraseña como hash `scrypt`).

| Usuario | Contraseña inicial |
|---|---|
| `admin` | `NutriRuta2026!` |

> [!WARNING]
> Es una credencial de demostración. Cambia `ADMIN_PASSWORD` en `.env` antes del primer arranque o usa `docker compose exec api python -m app.users passwd --username admin`. Para agregar compañeros: `docker compose exec api python -m app.users add --username ana --name "Ana"`.

La API limita las solicitudes por cliente (10 inicios de sesión, 30 operaciones pesadas y 1200 consultas por minuto) y bloquea una cuenta 60 s tras 5 contraseñas incorrectas.

## Demostración

1. **Inicio:** pulsa «Usar el escenario demo» (18 centros ficticios, 3 vehículos de 50 lotes, inventario de 135 lotes).
2. **Configuración AG:** elige una semilla; el preset estándar ya trae los valores del informe.
3. **Ejecución:** mira cómo mejora el fitness generación a generación.
4. **Resultados:** lee la explicación, revisa la asignación y recorre las rutas.
5. **Cuatro corridas:** lanza las semillas 11, 22, 33 y 44 y exporta la evidencia en CSV o JSON.

Para probar la carga de datos, descarga desde **Escenario → Nuevo escenario** los archivos de ejemplo: [`centros_ejemplo.csv`](frontend/public/ejemplos/centros_ejemplo.csv) (solo los 18 centros) y [`escenario_ejemplo.json`](frontend/public/ejemplos/escenario_ejemplo.json) (escenario completo, idéntico al demo).

## Resultados

Cifras reales del escenario demo (versión 1.0.0). Se reproducen con `python scripts/export_four_runs.py --api http://localhost:8090`, que guarda la evidencia en `evidencia/`.

| Semilla | J | Lotes entregados | Cobertura ponderada | Distancia (km) |
|---:|---:|---|---:|---:|
| 11 | 0,26278 | 135 / 181 | 85,76 % | 62,61 |
| 22 | 0,26275 | 130 / 181 | 84,24 % | 58,04 |
| 33 | 0,26344 | 135 / 181 | 85,76 % | 62,87 |
| 44 | 0,26603 | 135 / 181 | 85,45 % | 63,00 |
| Línea base | 0,30455 | 135 / 181 | 86,06 % | 80,29 |

`J` es el puntaje total del reparto (menor es mejor). El algoritmo recorre cerca de 23 % menos distancia que la línea base a cambio de cubrir algo menos la demanda ponderada: no mejoran todos los indicadores a la vez.

## Cómo funciona

```mermaid
flowchart LR
    U[Navegador] --> N[nginx + React]
    N -->|/api| A[FastAPI]
    A --> D[(PostgreSQL)]
    W[Worker del AG] --> D
```

- **Frontend** (`frontend/`): React, TypeScript y Vite; mapas con Leaflet y gráficos con Recharts.
- **API** (`backend/app/api`): valida escenarios, encola corridas, expone resultados y exportaciones.
- **Worker** (`backend/app/worker.py`): toma las corridas en cola y ejecuta el algoritmo, por lo que se puede seguir el avance o cancelar mientras calcula.
- **Algoritmo** (`backend/app/ga`): población inicial mixta, torneo de 3, cruce OX y uniforme, mutación por intercambio, inversión y ±1…±3 lotes, elitismo de 2, reparación y decodificación en rutas. Minimiza `J = 0,75·U + 0,20·R + 0,05·H`.

## Estructura

```text
backend/    API, algoritmo genético, línea base, importación de datos y pruebas
frontend/   Interfaz web, archivos de ejemplo (public/ejemplos) y prueba en navegador (e2e)
fixtures/   Escenarios sintéticos y casos inválidos de prueba
scripts/    Exportación de las cuatro corridas, benchmark y demo para Windows
assets/     Imagen del README
```

## Pruebas

```bash
docker compose --profile test build tests
docker compose --profile test run --rm tests pytest         # 195 pruebas del backend
cd frontend && npm ci && npm run typecheck && npm run lint && npm test
cd frontend && npm run test:ui                               # recorrido completo en navegador
```

## Producción

Con `APP_ENV=production` la API **no arranca** si conserva valores de demostración. Antes de desplegar:

- Copia `.env.example` a `.env` y define `APP_ENV=production`, `ADMIN_PASSWORD` (12 caracteres o más) y `POSTGRES_PASSWORD`.
- Sirve la aplicación por HTTPS: en producción la cookie de sesión siempre es `Secure`.
- Mantén nginx (o tu proxy) fijando `X-Real-IP`; el rate limit por cliente depende de esa cabecera.
- Restringe `CORS_ORIGINS` al dominio público y respalda el volumen `db_data` (`pg_dump`).
- Ajusta los límites de cada solicitud con las variables `RATE_LIMIT_*` y `MAX_*` de `.env.example`.

### Despliegue en AWS

`infra/` contiene Terraform (ECS Fargate + RDS + ALB + CloudFront + Amplify) y `scripts/desplegar_aws.ps1` lo despliega todo desde tu PC con un comando. Pasos en [infra/README.md](infra/README.md). Detrás de CloudFront + ALB se usa `TRUSTED_PROXY_HOPS=2` para que el rate limit lea la IP real del cliente.

## Límites

> [!WARNING]
> - La unidad de optimización es el **lote**, no la persona.
> - El padrón público de Cañete identifica centros, pero no aporta coordenadas verificadas, demandas, stock ni distancias viales.
> - La prioridad de cada centro exige un criterio institucional documentado; sin él, usa prioridad uniforme.
> - Un centro recibe como máximo una entrega por período: si su demanda supera al mayor vehículo, la entrega es parcial.
