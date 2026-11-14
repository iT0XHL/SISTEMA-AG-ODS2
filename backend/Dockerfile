# Imagen del backend (API + worker). Contexto de build: raíz del repositorio.
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /srv/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/ ./
COPY fixtures/ /srv/fixtures/
COPY scripts/ /srv/scripts/
RUN useradd --create-home --uid 10001 app && chown -R app:app /srv
USER app
ARG GIT_COMMIT=""
ENV GIT_COMMIT=${GIT_COMMIT} PYTHONPATH=/srv/backend
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# Imagen de pruebas: añade pytest, hypothesis y ruff.
FROM runtime AS test
USER root
COPY backend/requirements-dev.txt ./
RUN pip install -r requirements-dev.txt
USER app
CMD ["pytest"]
