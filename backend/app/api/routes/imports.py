"""Importación de archivos: padrón de centros (CSV/XLSX) y matriz vial (CSV).

Los archivos se procesan en memoria y se descartan al terminar la solicitud. Estas
rutas no guardan nada: devuelven datos normalizados para que el usuario complete el
escenario y lo valide.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, File, Form, UploadFile

from app.api.dependencies import read_upload
from app.api.errors import ApiError
from app.data.imports import ImportFileError, normalize_import, preview_import, read_table
from app.data.matrix import MatrixParseError, parse_matrix_csv

router = APIRouter(prefix="/api/v1/imports", tags=["importación"])


def _json_form(raw: str | None, field: str) -> Any:
    if raw is None or raw.strip() == "":
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ApiError(
            422, "INVALID_JSON", f"El campo «{field}» no es JSON válido.", field
        ) from exc


@router.post("/padron/preview")
async def padron_preview(file: UploadFile = File(...)) -> dict[str, Any]:
    """Muestra columnas, mapeo sugerido y qué se descartará (DNI, nombres de personas, sexo)."""
    content = await read_upload(file)
    try:
        frame = read_table(file.filename or "", content)
    except ImportFileError as exc:
        raise ApiError(422, exc.code, exc.message, "file") from exc
    return {"filename": file.filename, **preview_import(frame)}


@router.post("/padron/normalize")
async def padron_normalize(
    file: UploadFile = File(...),
    mapping: str = Form(...),
    demand_rule: str | None = Form(default=None),
) -> dict[str, Any]:
    """Aplica el mapeo y devuelve centros normalizados + informe de importación."""
    content = await read_upload(file)
    parsed_mapping = _json_form(mapping, "mapping")
    if not isinstance(parsed_mapping, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in parsed_mapping.items()
    ):
        raise ApiError(
            422, "INVALID_MAPPING", "El mapeo debe ser un objeto {campo: columna}.", "mapping"
        )
    rule = _json_form(demand_rule, "demand_rule")
    if rule is not None and not isinstance(rule, dict):
        raise ApiError(
            422, "INVALID_DEMAND_RULE", "La regla de demanda debe ser un objeto.", "demand_rule"
        )
    try:
        frame = read_table(file.filename or "", content)
        return normalize_import(frame, parsed_mapping, rule)
    except ImportFileError as exc:
        raise ApiError(422, exc.code, exc.message, "file") from exc


@router.post("/matrix")
async def matrix_import(file: UploadFile = File(...)) -> dict[str, Any]:
    """Lee una matriz de distancias viales (formato largo o cuadrado)."""
    content = await read_upload(file)
    try:
        parsed = parse_matrix_csv(content)
    except MatrixParseError as exc:
        raise ApiError(422, exc.code, exc.message, "file") from exc
    return {
        "filename": file.filename,
        "format": parsed["format"],
        "ids": parsed["ids"],
        "entries": parsed["entries"],
        "count": len(parsed["entries"]),
        "note": "La completitud y los rangos se comprueban al validar el escenario.",
    }
