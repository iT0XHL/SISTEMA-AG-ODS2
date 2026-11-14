# NutriRuta AG — atajos de desarrollo y demostración.
# En Windows sin `make`, use scripts/demo.ps1 o los comandos equivalentes del README.

COMPOSE ?= docker compose
APP_URL ?= http://localhost:8090
PYTHON  ?= python

.PHONY: help demo up down logs ps test test-e2e test-frontend test-ui lint four-runs fixtures benchmark reset-db

help:
	@echo "make demo          Levanta el stack, espera a que responda y ejecuta las cuatro corridas"
	@echo "make up / down     Levanta / detiene los contenedores (los datos se conservan)"
	@echo "make test          Pruebas del backend (unitarias, propiedades, integracion y e2e)"
	@echo "make test-frontend Tipos, lint, formato y pruebas unitarias del frontend"
	@echo "make test-ui       Prueba funcional de la interfaz en un navegador (requiere stack arriba)"
	@echo "make lint          ruff (backend)"
	@echo "make four-runs     Ejecuta 11/22/33/44 y exporta la evidencia a docs/evidencia"
	@echo "make fixtures      Regenera los fixtures sinteticos"
	@echo "make benchmark     Tiempos y calidad del AG por tamano de instancia"
	@echo "make reset-db      BORRA la base de datos (volumen db_data) y la recrea vacia"

demo: up four-runs
	@echo "Listo: abra $(APP_URL)"

up:
	$(COMPOSE) up -d --build --wait

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

ps:
	$(COMPOSE) ps

test:
	$(COMPOSE) --profile test build tests
	$(COMPOSE) --profile test run --rm tests pytest

test-e2e:
	$(COMPOSE) --profile test run --rm tests pytest tests/e2e -v

test-frontend:
	cd frontend && npm ci && npm run typecheck && npm run lint && npm run format:check && npm test

test-ui:
	cd frontend && npm run test:ui

lint:
	$(COMPOSE) --profile test run --rm tests ruff check . /srv/scripts
	$(COMPOSE) --profile test run --rm tests ruff format --check . /srv/scripts

four-runs:
	$(PYTHON) scripts/export_four_runs.py --api $(APP_URL) --out docs/evidencia

fixtures:
	$(COMPOSE) --profile test run --rm --user root -v "$(CURDIR)/fixtures:/out" tests python /srv/scripts/create_demo.py --out /out

benchmark:
	$(COMPOSE) exec api python /srv/scripts/benchmark.py

reset-db:
	$(COMPOSE) down -v
	$(COMPOSE) up -d --build --wait
