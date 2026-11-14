"""Lectura de una matriz de distancias viales desde CSV (plan §2.1, opción A).

Formatos aceptados (separador ``,`` o ``;``; UTF-8):

* **Largo**: cabecera ``from_id,to_id,km`` y una fila por par ordenado.
* **Cuadrado**: primera fila con los IDs de destino, primera columna con los IDs de
  origen. Debe ser cuadrada y con los mismos IDs en filas y columnas.

Solo se analiza la forma del archivo; la completitud y los rangos se comprueban
contra el escenario en ``validate_scenario``.
"""

from __future__ import annotations

import csv
import io
from typing import Any

from app.data.geocoding import parse_number

LONG_HEADERS = {
    "from_id": {"from_id", "from", "origen", "desde", "id_origen"},
    "to_id": {"to_id", "to", "destino", "hasta", "id_destino"},
    "km": {"km", "distancia", "distancia_km", "distance_km", "distance"},
}


class MatrixParseError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def decode_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise MatrixParseError("UNREADABLE_FILE", "No se pudo leer el archivo como texto.")


def sniff_delimiter(text: str) -> str:
    first = text.splitlines()[0] if text.strip() else ""
    counts = {sep: first.count(sep) for sep in (";", ",", "\t")}
    return max(counts, key=lambda sep: counts[sep]) if any(counts.values()) else ","


def _number(raw: str, where: str) -> float:
    try:
        value = parse_number(raw)
    except ValueError as exc:
        raise MatrixParseError(
            "NON_NUMERIC_DISTANCE", f"{where}: «{raw}» no es una distancia numérica finita."
        ) from exc
    if value is None:
        raise MatrixParseError("EMPTY_DISTANCE", f"{where}: falta la distancia.")
    return value


def parse_matrix_csv(content: bytes) -> dict[str, Any]:
    """Devuelve ``{"format", "entries": [{from_id, to_id, km}], "ids"}``."""
    text = decode_text(content)
    if not text.strip():
        raise MatrixParseError("EMPTY_FILE", "El archivo de matriz está vacío.")
    rows = [
        [cell.strip() for cell in row]
        for row in csv.reader(io.StringIO(text), delimiter=sniff_delimiter(text))
        if any(cell.strip() for cell in row)
    ]
    if len(rows) < 2:
        raise MatrixParseError("EMPTY_FILE", "La matriz no contiene filas de datos.")

    header = [cell.lower() for cell in rows[0]]
    column: dict[str, int] = {}
    for field, names in LONG_HEADERS.items():
        for k, cell in enumerate(header):
            if cell in names:
                column[field] = k
                break

    entries: list[dict[str, Any]] = []
    if len(column) == 3:
        width = max(column.values()) + 1
        for line, row in enumerate(rows[1:], start=2):
            if len(row) < width:
                raise MatrixParseError(
                    "MALFORMED_ROW",
                    f"Fila {line}: faltan columnas (se esperaban from_id,to_id,km).",
                )
            a, b = row[column["from_id"]], row[column["to_id"]]
            if not a or not b:
                raise MatrixParseError("MALFORMED_ROW", f"Fila {line}: falta un identificador.")
            entries.append(
                {"from_id": a, "to_id": b, "km": _number(row[column["km"]], f"Fila {line}")}
            )
        ids = sorted({e["from_id"] for e in entries} | {e["to_id"] for e in entries})
        return {"format": "long", "entries": entries, "ids": ids}

    # Formato cuadrado
    col_ids = rows[0][1:]
    row_ids = [row[0] for row in rows[1:]]
    if len(set(col_ids)) != len(col_ids) or len(set(row_ids)) != len(row_ids):
        raise MatrixParseError("DUPLICATE_MATRIX_ID", "La matriz tiene identificadores repetidos.")
    if len(col_ids) != len(row_ids) or set(col_ids) != set(row_ids):
        raise MatrixParseError(
            "MATRIX_NOT_SQUARE",
            f"La matriz no es cuadrada: {len(row_ids)} filas y {len(col_ids)} columnas, o los IDs "
            "de filas y columnas no coinciden.",
        )
    for line, row in enumerate(rows[1:], start=2):
        if len(row) != len(col_ids) + 1:
            raise MatrixParseError(
                "MATRIX_NOT_SQUARE",
                f"Fila {line}: tiene {len(row) - 1} valores y se esperaban {len(col_ids)}.",
            )
        for k, raw in enumerate(row[1:]):
            entries.append(
                {
                    "from_id": row[0],
                    "to_id": col_ids[k],
                    "km": _number(raw, f"Fila {line}, columna {col_ids[k]}"),
                }
            )
    return {"format": "square", "entries": entries, "ids": sorted(row_ids)}
