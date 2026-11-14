"""Prueba unitaria 8 del plan §9.1: validación de datos del escenario y de la matriz."""

from __future__ import annotations

import copy
import math

import pytest

from app.data.demo import generate_demo_scenario
from app.data.matrix import MatrixParseError, parse_matrix_csv
from app.domain.models import build_distance_matrix, build_problem, haversine_km
from app.domain.validators import Limits, validate_scenario
from tests.conftest import FIXTURES, load_fixture


def codes(report: dict, kind: str = "errors") -> set[str]:
    return {issue["code"] for issue in report[kind]}


def test_demo_scenario_is_valid_synthetic_and_deterministic() -> None:
    scenario = generate_demo_scenario()
    report = validate_scenario(scenario)
    assert report["valid"] and report["hash"]
    assert 15 <= len(scenario["centers"]) <= 20
    assert scenario["data_origin"] == "synthetic"
    assert all(c["source"] == "synthetic" for c in scenario["centers"])
    assert all(c["name"].startswith("Centro ficticio") for c in scenario["centers"])
    assert [v["capacity_lots"] for v in scenario["vehicles"]] == [50, 50, 50]
    assert scenario["inventory_lots"] == 135
    # determinista: misma semilla de fixture ⇒ mismo escenario y mismo hash
    assert generate_demo_scenario() == scenario
    assert validate_scenario(generate_demo_scenario())["hash"] == report["hash"]
    assert generate_demo_scenario(fixture_seed=7)["centers"] != scenario["centers"]
    assert "STRAIGHT_LINE_DISTANCES" in codes(report, "warnings")


def test_versioned_fixture_matches_generator() -> None:
    assert load_fixture("demo/scenario.json") == generate_demo_scenario()


@pytest.mark.parametrize(
    ("fixture", "expected"),
    [
        ("duplicate_center_ids", "DUPLICATE_CENTER_ID"),
        ("negative_capacity", "INVALID_CAPACITY"),
        ("zero_capacity", "INVALID_CAPACITY"),
        ("coordinates_out_of_range", "INVALID_LATITUDE"),
        ("coordinates_out_of_range", "INVALID_LONGITUDE"),
        ("zero_inventory", "EMPTY_INVENTORY"),
        ("no_centers", "NO_CENTERS"),
        ("no_vehicles", "NO_VEHICLES"),
        ("missing_demand", "MISSING_DEMAND"),
        ("negative_demand", "INVALID_DEMAND"),
        ("priority_out_of_range", "INVALID_PRIORITY"),
        ("all_zero_demand", "EMPTY_DEMAND"),
        ("haversine_with_matrix", "MIXED_DISTANCE_SOURCES"),
    ],
)
def test_invalid_fixtures_are_rejected(fixture: str, expected: str) -> None:
    report = validate_scenario(load_fixture(f"invalid/{fixture}.json"))
    assert not report["valid"] and report["hash"] is None and report["normalized"] is None
    assert expected in codes(report)
    assert all(issue["message"] and issue["code"] for issue in report["errors"])


def test_nan_and_inf_values_are_rejected(small_scenario) -> None:
    scenario = copy.deepcopy(small_scenario)
    scenario["centers"][0]["lat"] = math.nan
    scenario["centers"][1]["lon"] = math.inf
    scenario["centers"][2]["demand_lots"] = math.nan
    scenario["vehicles"][0]["capacity_lots"] = math.inf
    scenario["inventory_lots"] = math.nan
    found = codes(validate_scenario(scenario))
    assert {
        "INVALID_LATITUDE",
        "INVALID_LONGITUDE",
        "INVALID_DEMAND",
        "INVALID_CAPACITY",
        "INVALID_INVENTORY",
    } <= found


def test_center_count_limits(small_scenario) -> None:
    assert validate_scenario(small_scenario, Limits(min_centers=5, max_centers=50))["valid"]
    too_few = validate_scenario(small_scenario, Limits(min_centers=10, max_centers=50))
    assert "CENTER_COUNT_OUT_OF_RANGE" in codes(too_few)
    too_many = validate_scenario(small_scenario, Limits(min_centers=1, max_centers=5))
    assert "CENTER_COUNT_OUT_OF_RANGE" in codes(too_many)


def test_missing_coordinates_only_block_haversine(small_scenario) -> None:
    scenario = copy.deepcopy(small_scenario)
    scenario["centers"][0]["lat"] = scenario["centers"][0]["lon"] = None
    assert "MISSING_COORDINATES" in codes(validate_scenario(scenario))

    road = load_fixture("synthetic_small/scenario_road.json")
    for center in road["centers"]:
        center["lat"] = center["lon"] = None
    road["depot"]["lat"] = road["depot"]["lon"] = None
    report = validate_scenario(road)
    assert report["valid"], report["errors"]  # con matriz vial las coordenadas son opcionales


def test_structural_scarcity_flag_is_quantified() -> None:
    report = validate_scenario(generate_demo_scenario())
    flag = report["flags"]["structural_scarcity"]
    total = sum(c["demand_lots"] for c in generate_demo_scenario()["centers"])
    assert flag["active"] is True
    assert flag["total_demand"] == total and flag["inventory_lots"] == 135
    assert flag["fleet_capacity"] == 150 and flag["max_deliverable"] == 135
    assert flag["min_unmet_lots"] == total - 135
    assert "STRUCTURAL_SCARCITY" in codes(report, "warnings")


def test_demand_above_vehicle_capacity_is_partial_only(small_scenario) -> None:
    scenario = copy.deepcopy(small_scenario)
    scenario["centers"][0]["demand_lots"] = 60  # mayor que el vehículo más grande (25)
    report = validate_scenario(scenario)
    assert report["valid"]
    assert report["flags"]["partial_only_centers"] == [scenario["centers"][0]["id"]]
    assert "DEMAND_EXCEEDS_VEHICLE" in codes(report, "warnings")
    problem = build_problem(report["normalized"])
    assert problem.upper[0] == 25  # nunca satisfacción completa ficticia


def test_priority_justification_warning_for_non_synthetic_data(small_scenario) -> None:
    scenario = copy.deepcopy(small_scenario)
    scenario["data_origin"] = "declared"
    scenario["priority_criterion"] = None
    for center in scenario["centers"]:
        center["source"] = "declared"
        center["demand_origin"] = "declared"
    scenario["centers"][0]["priority_weight"] = 3
    assert "PRIORITY_NEEDS_JUSTIFICATION" in codes(validate_scenario(scenario), "warnings")
    for center in scenario["centers"]:
        center["priority_weight"] = 1
    assert "PRIORITY_NEEDS_JUSTIFICATION" not in codes(validate_scenario(scenario), "warnings")


# ----------------------------------------------------------------------- matriz
def test_haversine_matrix_is_symmetric_with_zero_diagonal(demo_scenario) -> None:
    ids, matrix, source = build_distance_matrix(validate_scenario(demo_scenario)["normalized"])
    assert source == "haversine" and ids[0] == "DEPOT" and ids[1:] == sorted(ids[1:])
    size = len(ids)
    assert all(matrix[i][i] == 0 for i in range(size))
    assert all(matrix[i][j] == matrix[j][i] for i in range(size) for j in range(size))
    assert all(math.isfinite(km) and km >= 0 for row in matrix for km in row)
    # 1 grado de latitud ≈ 111.19 km
    assert haversine_km(0, 0, 1, 0) == pytest.approx(111.195, abs=0.01)
    assert haversine_km(-13.07, -76.39, -13.07, -76.39) == 0


def test_road_matrix_can_be_asymmetric_and_is_used_verbatim() -> None:
    road = load_fixture("synthetic_small/scenario_road.json")
    report = validate_scenario(road)
    assert report["valid"], report["errors"]
    assert report["summary"]["matrix"]["symmetric"] is False
    assert "STRAIGHT_LINE_DISTANCES" not in codes(report, "warnings")
    problem = build_problem(report["normalized"])
    entry = road["distances"][0]
    ids = ["DEPOT", *sorted(c["id"] for c in road["centers"])]
    a, b = ids.index(entry["from_id"]), ids.index(entry["to_id"])
    assert problem.dist[a][b] == entry["km"]
    assert problem.dist[a][b] != problem.dist[b][a]
    assert problem.distance_mode == "road_matrix"


def _road_with(mutator) -> dict:
    road = load_fixture("synthetic_small/scenario_road.json")
    mutator(road)
    return validate_scenario(road)


def test_road_matrix_validation_errors() -> None:
    assert "MISSING_MATRIX" in codes(_road_with(lambda s: s.update(distances=[])))
    assert "MATRIX_INCOMPLETE" in codes(_road_with(lambda s: s["distances"].pop()))
    assert "NEGATIVE_DISTANCE" in codes(_road_with(lambda s: s["distances"][0].update(km=-1.0)))
    assert "NON_FINITE_DISTANCE" in codes(
        _road_with(lambda s: s["distances"][0].update(km=math.nan))
    )
    assert "NON_FINITE_DISTANCE" in codes(
        _road_with(lambda s: s["distances"][1].update(km=math.inf))
    )
    assert "UNKNOWN_DISTANCE_ID" in codes(
        _road_with(lambda s: s["distances"].append({"from_id": "X99", "to_id": "C01", "km": 1}))
    )
    assert "NONZERO_DIAGONAL" in codes(
        _road_with(lambda s: s["distances"].append({"from_id": "C01", "to_id": "C01", "km": 2}))
    )

    def conflicting(s: dict) -> None:
        first = s["distances"][0]
        s["distances"].append({**first, "km": first["km"] + 5})

    assert "CONFLICTING_DISTANCE" in codes(_road_with(conflicting))


def test_matrix_csv_long_and_square_formats() -> None:
    long_csv = (FIXTURES / "synthetic_small" / "matrix_road_long.csv").read_bytes()
    parsed = parse_matrix_csv(long_csv)
    assert parsed["format"] == "long" and len(parsed["entries"]) == 7 * 6
    assert parsed["ids"][0] == "C01" and "DEPOT" in parsed["ids"]

    square = b"id;DEPOT;C01\nDEPOT;0;2,5\nC01;3,5;0\n"
    parsed = parse_matrix_csv(square)
    assert parsed["format"] == "square"
    assert {(e["from_id"], e["to_id"]): e["km"] for e in parsed["entries"]} == {
        ("DEPOT", "DEPOT"): 0.0,
        ("DEPOT", "C01"): 2.5,
        ("C01", "DEPOT"): 3.5,
        ("C01", "C01"): 0.0,
    }


@pytest.mark.parametrize(
    ("filename", "code"),
    [
        ("matrix_not_square.csv", "MATRIX_NOT_SQUARE"),
        ("matrix_nan_inf.csv", "NON_NUMERIC_DISTANCE"),
    ],
)
def test_matrix_csv_shape_errors(filename: str, code: str) -> None:
    with pytest.raises(MatrixParseError) as error:
        parse_matrix_csv((FIXTURES / "invalid" / filename).read_bytes())
    assert error.value.code == code


def test_matrix_csv_empty_and_malformed() -> None:
    with pytest.raises(MatrixParseError) as empty:
        parse_matrix_csv(b"   \n")
    assert empty.value.code == "EMPTY_FILE"
    with pytest.raises(MatrixParseError) as text_value:
        parse_matrix_csv(b"from_id,to_id,km\nDEPOT,C01,lejos\n")
    assert text_value.value.code == "NON_NUMERIC_DISTANCE"
    with pytest.raises(MatrixParseError) as missing:
        parse_matrix_csv(b"from_id,to_id,km\nDEPOT,C01,\n")
    assert missing.value.code == "EMPTY_DISTANCE"


def test_negative_matrix_csv_is_caught_at_scenario_validation() -> None:
    parsed = parse_matrix_csv((FIXTURES / "invalid" / "matrix_negative.csv").read_bytes())
    road = load_fixture("synthetic_small/scenario_road.json")
    road["distances"] = parsed["entries"]
    found = codes(validate_scenario(road))
    assert {"NEGATIVE_DISTANCE", "MATRIX_INCOMPLETE"} <= found
