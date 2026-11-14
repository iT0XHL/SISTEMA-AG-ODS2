"""Coordenadas: solo validación de valores declarados.

El MVP **no geocodifica** direcciones ni consulta servicios externos: un padrón sin
posiciones validadas no permite calcular distancias. Las coordenadas se aceptan
únicamente cuando vienen en el archivo o se ingresan manualmente (origen «declarado»).
"""

from __future__ import annotations

import math


def parse_number(text: object) -> float | None:
    """Convierte texto a número aceptando coma o punto decimal. ``None`` si está vacío."""
    if text is None:
        return None
    raw = str(text).strip()
    if raw == "" or raw.lower() in {"none", "null", "-"}:
        return None
    if "," in raw and "." not in raw:
        raw = raw.replace(",", ".")
    try:
        value = float(raw)
    except ValueError as exc:
        raise ValueError(f"«{text}» no es un número") from exc
    if not math.isfinite(value):
        raise ValueError(f"«{text}» no es un número finito")
    return value


def parse_coordinate(text: object, kind: str) -> float | None:
    """Valida latitud (``kind='lat'``) o longitud (``kind='lon'``) declarada."""
    value = parse_number(text)
    if value is None:
        return None
    limit = 90 if kind == "lat" else 180
    if not -limit <= value <= limit:
        raise ValueError(f"{'latitud' if kind == 'lat' else 'longitud'} fuera de rango: {value}")
    return value
