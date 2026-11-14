"""Importación del padrón de centros con **lista permitida** de columnas (plan §2.1, HU-02).

Principios de privacidad:

* Solo se leen las columnas que el usuario mapea a un campo **institucional permitido**
  (código, nombre institucional, distrito, dirección institucional, estado, número
  agregado de usuarios, coordenadas, demanda y prioridad declaradas).
* Las columnas con datos personales (DNI, nombres y apellidos de personas, sexo,
  teléfonos, etc.) **no pueden mapearse**: se descartan antes de construir cualquier
  resultado y se reportan como removidas. Sus valores nunca se copian, registran ni
  devuelven.
* El archivo se procesa en memoria y no se guarda en disco.
"""

from __future__ import annotations

import io
import math
import re
import unicodedata
from typing import Any

import pandas as pd

from app.data.geocoding import parse_coordinate, parse_number
from app.data.matrix import decode_text, sniff_delimiter

ALLOWED_FIELDS: dict[str, str] = {
    "center_id": "Código del centro",
    "name": "Nombre institucional",
    "district": "Distrito",
    "address": "Dirección institucional",
    "status": "Estado del centro",
    "users_aggregate": "Número agregado de usuarios",
    "lat": "Latitud",
    "lon": "Longitud",
    "demand_lots": "Demanda declarada (lotes)",
    "priority_weight": "Prioridad institucional (1–3)",
}

# Patrones sobre el encabezado normalizado (minúsculas, sin tildes, separadores → "_").
PII_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"(^|_)dni(_|$)|documento|doc_ident|nro_doc|num_doc|carnet", "documento de identidad"),
    (r"(^|_)sexo(_|$)|(^|_)genero(_|$)", "sexo"),
    (r"apellid|nombres(_|$)|nombre_y_apellido|nombre_completo", "nombres de personas"),
    (
        r"president|representante|responsable|coordinador|(^|_)soci[ao]s?(_|$)|beneficiari|"
        r"titular|dirigente|encargad|contacto",
        "persona de contacto",
    ),
    (r"telefono|celular|movil|whatsapp|correo|email|e_mail", "datos de contacto personal"),
    (r"fecha_nac|nacimiento|(^|_)edad(_|$)|estado_civil", "datos personales"),
)

FIELD_HINTS: dict[str, tuple[str, ...]] = {
    "center_id": ("codigo", "cod_", "id_centro", "id_comedor", "id_olla", "nro_registro", "ruos"),
    "name": (
        "nombre_comedor",
        "nombre_olla",
        "nombre_del_comedor",
        "nombre_de_la_olla",
        "nombre_institucion",
        "nombre_organizacion",
        "nombre_centro",
        "denominacion",
        "organizacion",
        "razon_social",
        "comedor",
        "olla_comun",
    ),
    "district": ("distrito",),
    "address": ("direccion", "domicilio", "ubicacion"),
    "status": ("estado", "situacion", "condicion", "activo", "vigencia"),
    "users_aggregate": (
        "numero_usuarios",
        "nro_usuarios",
        "n_usuarios",
        "cantidad_usuarios",
        "total_usuarios",
        "usuarios",
        "num_beneficiarios_total",
        "raciones",
    ),
    "lat": ("latitud", "lat"),
    "lon": ("longitud", "lon", "lng"),
    "demand_lots": ("demanda_lotes", "demand_lots", "lotes"),
    "priority_weight": ("prioridad", "priority"),
}
INACTIVE_VALUES = {
    "inactivo",
    "inactiva",
    "baja",
    "de baja",
    "cerrado",
    "cerrada",
    "no activo",
    "no activa",
    "no",
    "0",
    "false",
    "suspendido",
    "suspendida",
    "no vigente",
}
MAX_IMPORT_ROWS = 5000


class ImportFileError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def normalize_header(header: object) -> str:
    text = unicodedata.normalize("NFKD", str(header)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def pii_category(header: object) -> str | None:
    """Categoría de dato personal si el encabezado corresponde a PII; si no, ``None``."""
    key = normalize_header(header)
    for pattern, category in PII_PATTERNS:
        if re.search(pattern, key):
            return category
    return None


def suggest_field(header: object) -> str | None:
    """Campo permitido sugerido para un encabezado (nunca para columnas PII)."""
    if pii_category(header):
        return None
    key = normalize_header(header)
    if key in ("nombre", "name"):
        return "name"
    if key in ("id", "codigo", "cod"):
        return "center_id"
    for field, hints in FIELD_HINTS.items():
        for hint in hints:
            if field in ("lat", "lon"):
                if key == hint or key.startswith(hint + "_") or key.endswith("_" + hint):
                    return field
            elif hint in key:
                return field
    return None


def read_table(filename: str, content: bytes) -> pd.DataFrame:
    """Lee CSV o XLSX como texto (sin inferir tipos). No escribe nada en disco."""
    name = (filename or "").lower()
    # Se lee sin cabecera para detectar encabezados repetidos (pandas los renombraría).
    try:
        if name.endswith((".xlsx", ".xlsm")):
            frame = pd.read_excel(io.BytesIO(content), dtype=str, engine="openpyxl", header=None)
        elif name.endswith((".csv", ".txt", ".tsv")):
            text = decode_text(content)
            if not text.strip():
                raise ImportFileError("EMPTY_FILE", "El archivo está vacío.")
            if "\x00" in text:
                raise ImportFileError(
                    "CORRUPT_FILE",
                    "El archivo contiene bytes nulos: no es un CSV de texto válido.",
                )
            frame = pd.read_csv(
                io.StringIO(text),
                dtype=str,
                sep=sniff_delimiter(text),
                keep_default_na=False,
                skip_blank_lines=True,
                header=None,
            )
        else:
            raise ImportFileError(
                "UNSUPPORTED_FORMAT", "Formato no admitido: suba un archivo .csv o .xlsx."
            )
    except ImportFileError:
        raise
    except Exception as exc:  # archivo corrupto o ilegible
        raise ImportFileError(
            "CORRUPT_FILE",
            "No se pudo leer el archivo: parece estar dañado o no corresponde a su extensión.",
        ) from exc
    frame = frame.fillna("")
    if frame.empty:
        raise ImportFileError("EMPTY_FILE", "El archivo está vacío.")
    headers = [str(c).strip() for c in frame.iloc[0]]
    if any(not header for header in headers):
        raise ImportFileError(
            "MISSING_HEADER", "La primera fila debe contener un encabezado en cada columna."
        )
    if len(set(headers)) != len(headers):
        raise ImportFileError("DUPLICATE_COLUMNS", "El archivo tiene encabezados repetidos.")
    frame = frame.iloc[1:]
    frame.columns = headers
    frame = frame[frame.apply(lambda row: any(str(v).strip() for v in row), axis=1)]
    if frame.empty or len(frame.columns) == 0:
        raise ImportFileError("EMPTY_FILE", "El archivo no contiene filas de datos.")
    if len(frame) > MAX_IMPORT_ROWS:
        raise ImportFileError(
            "TOO_MANY_ROWS", f"El archivo supera el máximo de {MAX_IMPORT_ROWS} filas."
        )
    return frame.reset_index(drop=True)


def preview_import(frame: pd.DataFrame) -> dict[str, Any]:
    """Propone el mapeo de columnas y muestra qué se descartará. No devuelve valores PII."""
    columns = []
    used: set[str] = set()
    for header in frame.columns:
        category = pii_category(header)
        suggestion = suggest_field(header)
        if suggestion in used:
            suggestion = None
        if suggestion:
            used.add(suggestion)
        columns.append(
            {
                "name": header,
                "pii": category is not None,
                "pii_category": category,
                "suggested_field": suggestion,
                "action": "discard_pii" if category else ("map" if suggestion else "discard"),
            }
        )
    safe = [c["name"] for c in columns if c["suggested_field"]]
    sample = frame[safe].head(5).to_dict(orient="records") if safe else []
    return {
        "row_count": len(frame),
        "columns": columns,
        "allowed_fields": ALLOWED_FIELDS,
        "sample": sample,
        "sample_note": "La muestra solo incluye columnas institucionales con mapeo sugerido.",
    }


def _title(text: str) -> str:
    cleaned = " ".join(text.split())
    return cleaned.title() if cleaned.isupper() or cleaned.islower() else cleaned


def _integer(raw: str, label: str, minimum: int = 0) -> int | None:
    value = parse_number(raw)
    if value is None:
        return None
    if not float(value).is_integer() or value < minimum:
        raise ValueError(f"{label} debe ser un entero ≥ {minimum}")
    return int(value)


def normalize_import(
    frame: pd.DataFrame,
    mapping: dict[str, str],
    demand_rule: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Convierte el padrón en centros normalizados usando solo columnas permitidas.

    ``mapping``: ``{campo_permitido: encabezado_del_archivo}``.
    ``demand_rule`` (opcional): ``{"rations_per_user": x, "rations_per_lot": y}`` para
    derivar ``ceil(usuarios × x / y)``; la demanda resultante queda rotulada «inferred».
    """
    for field, header in mapping.items():
        if field not in ALLOWED_FIELDS:
            raise ImportFileError(
                "FIELD_NOT_ALLOWED", f"«{field}» no es un campo institucional permitido."
            )
        if header not in frame.columns:
            raise ImportFileError(
                "UNKNOWN_COLUMN", f"La columna «{header}» no existe en el archivo."
            )
        category = pii_category(header)
        if category:
            raise ImportFileError(
                "PII_COLUMN_NOT_ALLOWED",
                f"La columna «{header}» contiene {category} y no puede importarse.",
            )
    if "name" not in mapping:
        raise ImportFileError(
            "MISSING_NAME_MAPPING", "Indique qué columna contiene el nombre institucional."
        )
    if len(set(mapping.values())) != len(mapping):
        raise ImportFileError(
            "DUPLICATE_MAPPING", "Cada columna del archivo solo puede mapearse a un campo."
        )
    if demand_rule is not None:
        per_user = demand_rule.get("rations_per_user")
        per_lot = demand_rule.get("rations_per_lot")
        valid_rule = all(
            isinstance(v, (int, float)) and math.isfinite(v) and v > 0 for v in (per_user, per_lot)
        )
        if not valid_rule:
            raise ImportFileError(
                "INVALID_DEMAND_RULE",
                "La regla de demanda necesita raciones por usuario y raciones por lote > 0.",
            )

    mapped_headers = set(mapping.values())
    discarded = [
        {
            "name": header,
            "pii": pii_category(header) is not None,
            "pii_category": pii_category(header),
        }
        for header in frame.columns
        if header not in mapped_headers
    ]
    # Solo las columnas permitidas pasan de este punto.
    safe = frame[[mapping[f] for f in mapping]].rename(columns={v: k for k, v in mapping.items()})

    centers: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    row_warnings: list[dict[str, Any]] = []
    duplicates = 0
    inactive = 0
    seen: set[str] = set()

    for position, row in enumerate(safe.to_dict(orient="records")):
        line = position + 2  # fila del archivo (1 = cabecera)
        get = lambda f, row=row: str(row.get(f, "") or "").strip()  # noqa: E731

        if "status" in mapping and get("status").lower() in INACTIVE_VALUES:
            inactive += 1
            continue
        name = _title(get("name"))
        if not name:
            rejected.append({"row": line, "reason": "sin nombre institucional"})
            continue
        code = get("center_id") if "center_id" in mapping else f"P{position + 1:03d}"
        if not code:
            rejected.append({"row": line, "reason": "sin código de centro"})
            continue
        if code in seen:
            duplicates += 1
            rejected.append({"row": line, "reason": f"código duplicado «{code}»"})
            continue

        lat = lon = None
        try:
            lat = parse_coordinate(get("lat"), "lat") if "lat" in mapping else None
            lon = parse_coordinate(get("lon"), "lon") if "lon" in mapping else None
        except ValueError as exc:
            row_warnings.append({"row": line, "center_id": code, "warning": f"coordenadas: {exc}"})
            lat = lon = None
        if (lat is None) != (lon is None):
            row_warnings.append(
                {"row": line, "center_id": code, "warning": "coordenadas incompletas; se omiten"}
            )
            lat = lon = None

        try:
            users = (
                _integer(get("users_aggregate"), "usuarios")
                if "users_aggregate" in mapping
                else None
            )
            demand = _integer(get("demand_lots"), "demanda") if "demand_lots" in mapping else None
            priority = (
                _integer(get("priority_weight"), "prioridad", 1)
                if "priority_weight" in mapping
                else None
            )
        except ValueError as exc:
            rejected.append({"row": line, "reason": str(exc)})
            continue
        if priority is not None and priority not in (1, 2, 3):
            rejected.append({"row": line, "reason": "prioridad fuera de 1–3"})
            continue

        demand_origin = "declared"
        if demand is None and demand_rule is not None and users is not None:
            demand = math.ceil(
                users * demand_rule["rations_per_user"] / demand_rule["rations_per_lot"]
            )
            demand_origin = "inferred"

        seen.add(code)
        centers.append(
            {
                "id": code,
                "name": name,
                "district": _title(get("district")) or None,
                "address": _title(get("address")) or None,
                "lat": lat,
                "lon": lon,
                "demand_lots": demand,
                "priority_weight": priority if priority is not None else 1,
                "source": "official",
                "demand_origin": demand_origin,
                "users_aggregate": users,
            }
        )

    return {
        "centers": centers,
        "report": {
            "rows_total": len(frame),
            "accepted": len(centers),
            "duplicates": duplicates,
            "inactive_ignored": inactive,
            "rejected": rejected,
            "row_warnings": row_warnings,
            "mapped_columns": [
                {"field": f, "label": ALLOWED_FIELDS[f], "column": mapping[f]} for f in mapping
            ],
            "discarded_columns": discarded,
            "pii_removed": [c["name"] for c in discarded if c["pii"]],
            "source_nature": (
                "Padrón cargado por el usuario (origen «official» para identificación). "
                "Demanda, prioridad, coordenadas, flota, inventario y distancias deben "
                "completarse y validarse por separado."
            ),
            "priority_note": (
                "Prioridad uniforme p = 1 salvo columna institucional mapeada: no se infiere "
                "vulnerabilidad de personas, barrios, sexo ni nombres."
            ),
            "demand_rule": demand_rule,
        },
    }
