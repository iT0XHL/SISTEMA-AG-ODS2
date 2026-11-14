# Despliegue y operación

## 1. Requisitos

- Docker Desktop (Windows / macOS) o Docker Engine con Compose v2 (Linux).
- Unos 2 GB libres para imágenes y 1,5 GB de memoria para los cuatro contenedores.
- Opcional: Python ≥ 3.10 para `scripts/export_four_runs.py`; Node 22 o superior para trabajar en el frontend fuera de Docker.

## 2. Servicios

| Servicio | Imagen base | Puerto interno | Puerto en el equipo | Límite | Salud |
|---|---|---|---|---|---|
| `db` | `postgres:17-alpine` | 5432 | no expuesto | 1 CPU · 512 MB | `pg_isready` |
| `api` | `python:3.12-slim` | 8000 | `API_PORT` (8010) | 1 CPU · 512 MB | `GET /health` |
| `worker` | la misma de `api` | — | — | 1 CPU · 768 MB | — |
| `frontend` | `nginx:1.29-alpine` | 80 | `FRONTEND_PORT` (8090) | 0,5 CPU · 128 MB | `GET /` |
| `tests` | imagen de pruebas | — | — | — | perfil `test` |

`api` y `worker` esperan a que `db` esté sana; `frontend` espera a `api`. Los datos viven en el volumen `db_data`. Los contenedores del backend se ejecutan con un usuario sin privilegios.

## 3. Variables de entorno

Copie `.env.example` a `.env` para cambiarlas. Sin `.env` se usan los valores por defecto.

| Variable | Por defecto | Para qué |
|---|---|---|
| `APP_ENV` | `development` | Etiqueta del entorno |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `nutriruta` / `nutriruta` / `nutriruta_local` | Credenciales de la base (cámbielas si expone el servicio) |
| `DB_URL` | la arma Compose | Cadena SQLAlchemy; con `sqlite:///./nutriruta.db` funciona sin PostgreSQL |
| `MIN_CENTERS` / `MAX_CENTERS` | 5 / 50 | Tamaño admitido de escenario |
| `MAX_GENERATIONS` | 1000 | Tope de generaciones por corrida |
| `MAX_UPLOAD_MB` | 5 | Tamaño máximo de archivo |
| `MAX_RUN_SECONDS` | 120 | Tiempo máximo de una corrida |
| `CORS_ORIGINS` | `http://localhost:8090` | Orígenes permitidos para llamar a la API directamente |
| `FRONTEND_PORT` / `API_PORT` | 8090 / 8010 | Puertos publicados |
| `GIT_COMMIT` | vacío | Si se define, se añade a la versión registrada en cada corrida |

Para registrar el commit exacto: `GIT_COMMIT=$(git rev-parse HEAD) docker compose up -d --build`.

## 4. Operación diaria

```bash
docker compose up -d --build          # construir y levantar
docker compose ps                     # estado
docker compose logs -f api worker     # registros
docker compose restart worker         # reiniciar el worker
docker compose down                   # detener (conserva los datos)
docker compose down -v                # detener y BORRAR la base de datos
```

Comprobaciones tras levantar:

1. `curl http://localhost:8090/health` → `"status":"ok","database":"ok"`.
2. Abrir http://localhost:8090 y cargar la demo.
3. Ejecutar una corrida y exportar: `python scripts/export_four_runs.py --api http://localhost:8090 --out docs/evidencia`.

## 5. Scripts

| Script | Dónde se ejecuta | Qué hace |
|---|---|---|
| `scripts/export_four_runs.py` | En el equipo (solo biblioteca estándar) | Asegura el escenario demo, lanza 11/22/33/44, espera al worker y guarda CSV, JSON y tabla Markdown |
| `scripts/create_demo.py` | En la imagen del backend | Regenera los fixtures deterministas |
| `scripts/benchmark.py` | `docker compose exec api python /srv/scripts/benchmark.py` | Tiempos y calidad por tamaño de instancia, sin tocar la base |
| `scripts/demo.ps1` | PowerShell | Equivalente de `make demo` |

En Git Bash para Windows, anteponga `MSYS_NO_PATHCONV=1` a los comandos `docker compose exec …` que llevan rutas como `/srv/…`.

## 6. Desarrollo sin reconstruir imágenes

```bash
# Backend con recarga (SQLite local)
cd backend
python -m venv .venv && .venv/Scripts/activate      # Linux/macOS: source .venv/bin/activate
pip install -r requirements-dev.txt
DB_URL=sqlite:///./nutriruta.db uvicorn app.main:app --reload --port 8010
DB_URL=sqlite:///./nutriruta.db python -m app.worker        # en otra terminal

# Frontend con recarga (reenvía /api a http://localhost:8010)
cd frontend
npm ci
npm run dev                                          # http://localhost:5173
```

## 7. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Bind for … failed: port is already allocated` | Otro programa usa el puerto | Cambie `FRONTEND_PORT` o `API_PORT` en `.env` y vuelva a levantar |
| La interfaz dice «No hay conexión con el servidor» | `api` caída o arrancando | `docker compose ps`; `docker compose logs api` |
| Una corrida queda «En cola» | El worker no está en ejecución | `docker compose ps worker`; `docker compose restart worker` |
| Corridas «fallidas» con `WORKER_INTERRUPTED` | El worker se reinició a mitad de una corrida | Vuelva a ejecutarlas |
| `TIME_LIMIT` | La corrida superó `MAX_RUN_SECONDS` | Reduzca generaciones o población, o suba el límite |
| `SCENARIO_ID_CONFLICT` | Ya existe ese identificador con otro contenido | Use otro identificador: los escenarios no se sobrescriben |
| El mapa sale sin fondo | Sin internet o teselas bloqueadas | Desactive «Mapa base»; puntos, rutas y tablas siguen funcionando |
| `/srv/…: No such file` en Git Bash | Conversión de rutas de MSYS | Anteponga `MSYS_NO_PATHCONV=1` |
| Docker no responde | Docker Desktop apagado | Ábralo y espere a que el motor esté listo |

## 8. Volver a una versión anterior

Las imágenes llevan etiqueta de versión (`nutriruta-ag-backend:1.0.0`, `nutriruta-ag-frontend:1.0.0`). Para deshacer un cambio: recupere el código anterior (o conserve las imágenes de la versión previa), ejecute `docker compose up -d --build` y verifique `/health`. Los datos del volumen `db_data` se conservan; como no hay migraciones, un cambio de esquema incompatible exige recrear el volumen (`docker compose down -v`), lo que borra escenarios y corridas. Respalde antes con `pg_dump`.

## 9. Antes de exponerlo fuera del equipo

El despliegue está pensado para una máquina local con datos ficticios. Para publicarlo hace falta, como mínimo: HTTPS, autenticación para importar y ejecutar, límites de tasa, contraseñas propias para la base, `CORS_ORIGINS` restringido, política de caducidad de datos y revisar la política de teselas de OpenStreetMap. Nada de esto está incluido en la versión 1.0.0.
