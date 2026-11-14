"""Prueba unitaria 9 del plan §9.1 (parte de dominio): el importador descarta datos personales."""

from __future__ import annotations

import io
import json

import pandas as pd
import pytest

from app.data.geocoding import parse_coordinate, parse_number
from app.data.imports import (
    ALLOWED_FIELDS,
    ImportFileError,
    normalize_import,
    pii_category,
    preview_import,
    read_table,
    suggest_field,
)
from tests.conftest import FIXTURES

PADRON = FIXTURES / "invalid" / "padron_con_pii_ficticio.csv"
PII_VALUES = ("ZZ000001", "PERSONA FICTICIA", "Persona Ficticia", "TEL-FICT-001")
MAPPING = {
    "center_id": "CODIGO",
    "name": "NOMBRE_COMEDOR",
    "district": "DISTRITO",
    "address": "DIRECCION",
    "status": "ESTADO",
    "users_aggregate": "NRO_USUARIOS",
}


def frame() -> pd.DataFrame:
    return read_table("padron.csv", PADRON.read_bytes())


@pytest.mark.parametrize(
    "header",
    [
        "DNI",
        "dni_presidenta",
        "Nro. Documento",
        "SEXO",
        "Género",
        "NOMBRES_APELLIDOS",
        "Apellidos y Nombres",
        "NOMBRES",
        "Nombre completo",
        "PRESIDENTA",
        "Representante legal",
        "Socias",
        "N° beneficiarios (lista)",
        "TELEFONO",
        "Celular",
        "Correo electrónico",
        "Fecha de nacimiento",
        "EDAD",
    ],
)
def test_personal_headers_are_flagged_as_pii(header: str) -> None:
    assert pii_category(header) is not None
    assert suggest_field(header) is None


@pytest.mark.parametrize(
    ("header", "field"),
    [
        ("CODIGO", "center_id"),
        ("NOMBRE_COMEDOR", "name"),
        ("Nombre de la olla", "name"),
        ("Razón Social", "name"),
        ("DISTRITO", "district"),
        ("Dirección", "address"),
        ("ESTADO", "status"),
        ("NRO_USUARIOS", "users_aggregate"),
        ("Latitud", "lat"),
        ("LONGITUD", "lon"),
        ("Prioridad", "priority_weight"),
    ],
)
def test_institutional_headers_are_suggested(header: str, field: str) -> None:
    assert pii_category(header) is None
    assert suggest_field(header) == field


def test_preview_reports_discards_without_leaking_values() -> None:
    preview = preview_import(frame())
    by_name = {column["name"]: column for column in preview["columns"]}
    for header in ("DNI", "NOMBRES_APELLIDOS", "SEXO", "TELEFONO"):
        assert by_name[header]["pii"] is True and by_name[header]["action"] == "discard_pii"
    assert by_name["NOMBRE_COMEDOR"]["suggested_field"] == "name"
    assert preview["row_count"] == 8
    blob = json.dumps(preview, ensure_ascii=False)
    assert not any(value in blob for value in PII_VALUES)
    assert all(set(row) <= set(MAPPING.values()) for row in preview["sample"])


def test_normalize_keeps_only_allowed_fields_and_reports() -> None:
    result = normalize_import(frame(), MAPPING)
    centers, report = result["centers"], result["report"]
    allowed_center_keys = {
        "id",
        "name",
        "district",
        "address",
        "lat",
        "lon",
        "demand_lots",
        "priority_weight",
        "source",
        "demand_origin",
        "users_aggregate",
    }
    assert all(set(center) == allowed_center_keys for center in centers)
    blob = json.dumps(result, ensure_ascii=False)
    assert not any(value in blob for value in PII_VALUES), "se filtró un dato personal"

    # 8 filas: 1 inactiva, 1 duplicada (CP-002), 1 sin nombre → 5 aceptadas
    assert report["rows_total"] == 8 and report["accepted"] == 5
    assert report["inactive_ignored"] == 1 and report["duplicates"] == 1
    assert {r["reason"] for r in report["rejected"]} == {
        "código duplicado «CP-002»",
        "sin nombre institucional",
    }
    assert set(report["pii_removed"]) == {"DNI", "NOMBRES_APELLIDOS", "SEXO", "TELEFONO"}
    assert [c["id"] for c in centers] == ["CP-001", "CP-002", "CP-004", "CP-005", "CP-007"]
    first = centers[0]
    assert first["name"] == "Comedor Ficticio Los Olivos"  # estandarizado
    assert first["source"] == "official" and first["users_aggregate"] == 85
    assert first["priority_weight"] == 1, "prioridad uniforme: no se infiere vulnerabilidad"
    assert first["demand_lots"] is None, "usuarios no equivale automáticamente a demanda"
    assert first["lat"] is None and first["lon"] is None, "el padrón no aporta coordenadas"


def test_declared_demand_rule_is_labelled_as_inferred() -> None:
    rule = {"rations_per_user": 1, "rations_per_lot": 10}
    centers = normalize_import(frame(), MAPPING, rule)["centers"]
    by_id = {c["id"]: c for c in centers}
    assert by_id["CP-001"]["demand_lots"] == 9  # ceil(85 × 1 / 10)
    assert by_id["CP-002"]["demand_lots"] == 6  # ceil(60 / 10)
    assert by_id["CP-004"]["demand_lots"] == 12
    assert all(c["demand_origin"] == "inferred" for c in centers)


@pytest.mark.parametrize("column", ["DNI", "NOMBRES_APELLIDOS", "SEXO", "TELEFONO"])
def test_pii_column_cannot_be_mapped(column: str) -> None:
    for field in ("name", "district", "users_aggregate"):
        with pytest.raises(ImportFileError) as error:
            normalize_import(frame(), {**MAPPING, field: column})
        assert error.value.code == "PII_COLUMN_NOT_ALLOWED"


def test_mapping_errors() -> None:
    with pytest.raises(ImportFileError) as not_allowed:
        normalize_import(frame(), {**MAPPING, "dni": "DNI"})
    assert not_allowed.value.code == "FIELD_NOT_ALLOWED"
    with pytest.raises(ImportFileError) as unknown:
        normalize_import(frame(), {**MAPPING, "district": "NO_EXISTE"})
    assert unknown.value.code == "UNKNOWN_COLUMN"
    with pytest.raises(ImportFileError) as no_name:
        normalize_import(frame(), {"center_id": "CODIGO"})
    assert no_name.value.code == "MISSING_NAME_MAPPING"
    with pytest.raises(ImportFileError) as bad_rule:
        normalize_import(frame(), MAPPING, {"rations_per_user": 1, "rations_per_lot": 0})
    assert bad_rule.value.code == "INVALID_DEMAND_RULE"
    assert "dni" not in ALLOWED_FIELDS and "sexo" not in ALLOWED_FIELDS


def test_corrupt_and_unsupported_files() -> None:
    with pytest.raises(ImportFileError) as corrupt_csv:
        read_table("corrupt.csv", (FIXTURES / "invalid" / "corrupt.csv").read_bytes())
    assert corrupt_csv.value.code == "CORRUPT_FILE"
    with pytest.raises(ImportFileError) as corrupt_xlsx:
        read_table("corrupt.xlsx", (FIXTURES / "invalid" / "corrupt.xlsx").read_bytes())
    assert corrupt_xlsx.value.code == "CORRUPT_FILE"
    with pytest.raises(ImportFileError) as unsupported:
        read_table("padron.pdf", b"%PDF-1.4")
    assert unsupported.value.code == "UNSUPPORTED_FORMAT"
    with pytest.raises(ImportFileError) as empty:
        read_table("vacio.csv", b"CODIGO,NOMBRE\n")
    assert empty.value.code == "EMPTY_FILE"
    with pytest.raises(ImportFileError) as duplicated:
        read_table("dup.csv", b"A,A\n1,2\n")
    assert duplicated.value.code == "DUPLICATE_COLUMNS"


def test_xlsx_import_and_coordinates_validated_only_when_present() -> None:
    table = pd.DataFrame(
        {
            "Código": ["X1", "X2", "X3"],
            "Nombre": ["Centro ficticio uno", "Centro ficticio dos", "Centro ficticio tres"],
            "Latitud": ["-13,05", "", "-95"],
            "Longitud": ["-76,35", "", "-76.3"],
            "DNI": ["ZZ000009", "ZZ000010", "ZZ000011"],
        }
    )
    buffer = io.BytesIO()
    table.to_excel(buffer, index=False)
    loaded = read_table("padron.xlsx", buffer.getvalue())
    mapping = {"center_id": "Código", "name": "Nombre", "lat": "Latitud", "lon": "Longitud"}
    result = normalize_import(loaded, mapping)
    by_id = {c["id"]: c for c in result["centers"]}
    assert (by_id["X1"]["lat"], by_id["X1"]["lon"]) == (-13.05, -76.35)  # coma decimal
    assert by_id["X2"]["lat"] is None and by_id["X2"]["lon"] is None  # ausentes: sin error
    assert by_id["X3"]["lat"] is None  # fuera de rango: se omiten y se avisa
    assert [w["center_id"] for w in result["report"]["row_warnings"]] == ["X3"]
    assert result["report"]["pii_removed"] == ["DNI"]
    assert "ZZ000009" not in json.dumps(result)


def test_number_parsing_helpers() -> None:
    assert parse_number(" 12,5 ") == 12.5 and parse_number("") is None
    assert parse_coordinate("-13.07", "lat") == -13.07
    for bad in ("abc", "NaN", "inf"):
        with pytest.raises(ValueError):
            parse_number(bad)
    with pytest.raises(ValueError):
        parse_coordinate("91", "lat")
    with pytest.raises(ValueError):
        parse_coordinate("-181", "lon")
