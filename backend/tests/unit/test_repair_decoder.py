"""Pruebas unitarias 4–5 del plan §9.1: reparación y decodificación."""

from __future__ import annotations

from numpy.random import PCG64, Generator

from app.domain.metrics import chromosome_payload, routes_payload, validate_solution
from app.ga.chromosome import (
    REASON_DOMAIN,
    REASON_FLEET,
    REASON_INVENTORY,
    REASON_PACKING,
    Chromosome,
    RepairLog,
)
from app.ga.decoder import decode, first_fit_decreasing
from app.ga.repair import repair_quantities
from tests.conftest import make_problem

FLAT = [[0, 1, 1, 1, 1], [1, 0, 1, 1, 1], [1, 1, 0, 1, 1], [1, 1, 1, 0, 1], [1, 1, 1, 1, 0]]


# ------------------------------------------------------------ 4. reparación
def test_repair_clamps_to_domain_and_logs() -> None:
    problem = make_problem([5, 30, 4, 6], [1, 2, 3, 1], [20, 20], 100, FLAT)
    qty = [9, 45, -3, 6]
    log = repair_quantities(problem, qty)
    # C1: tope d=5; C2: tope max C_v=20 (< d=30); C3: negativo → 0
    assert qty == [5, 20, 0, 6]
    assert log.reductions[REASON_DOMAIN] == {0: 4, 1: 25}
    assert log.lots(REASON_DOMAIN) == 29


def test_repair_respects_inventory_removing_lowest_priority_first() -> None:
    problem = make_problem([10, 10, 10, 10], [3, 1, 2, 1], [50], 22, FLAT)
    qty = [10, 10, 10, 10]  # Σ = 40 > B = 22 → sobran 18
    log = repair_quantities(problem, qty)
    assert sum(qty) == 22 <= problem.inventory
    # menor prioridad primero, desempate por ID: C2 (p=1) se agota, luego C4 (p=1)
    assert qty == [10, 0, 10, 2]
    assert log.reductions == {REASON_INVENTORY: {1: 10, 3: 8}}
    assert log.lots() == 18


def test_repair_respects_fleet_capacity() -> None:
    problem = make_problem([10, 10, 10, 10], [1, 1, 1, 1], [12, 12], 100, FLAT)
    qty = [10, 10, 10, 10]  # Σ = 40 > Σ C_v = 24
    log = repair_quantities(problem, qty)
    assert sum(qty) == 24
    assert REASON_FLEET in log.reductions and log.lots(REASON_FLEET) == 16


def test_repair_is_noop_on_feasible_vector() -> None:
    problem = make_problem([10, 10, 10, 10], [1, 2, 3, 1], [30, 30], 40, FLAT)
    qty = [5, 6, 7, 8]
    log = repair_quantities(problem, qty, RepairLog())
    assert qty == [5, 6, 7, 8] and log.lots() == 0 and not log.reductions


def test_repair_terminates_with_zero_limit() -> None:
    problem = make_problem([10, 10, 10, 10], [1, 2, 3, 1], [30], 0, FLAT)
    qty = [10, 10, 10, 10]
    repair_quantities(problem, qty)
    assert qty == [0, 0, 0, 0]


# --------------------------------------------------------- 5. decodificación
def test_ffd_orders_by_quantity_then_by_position_in_pi() -> None:
    problem = make_problem([8, 8, 8, 8], [1, 1, 1, 1], [10, 10], 100, FLAT)
    qty = [4, 6, 4, 6]
    # π = [C3, C4, C1, C2] → posiciones: C1=2, C2=3, C3=0, C4=1
    position = [2, 3, 0, 1]
    vehicle_of = first_fit_decreasing(problem, position, qty)
    # orden FFD: C4(6, pos 1), C2(6, pos 3), C3(4, pos 0), C1(4, pos 2)
    # C4→V1(6) · C2→V2(6) · C3→V1(10) · C1→V2(10)
    assert vehicle_of == [1, 1, 0, 0]


def test_decode_routes_follow_pi_suborder_and_depot() -> None:
    dist = [
        [0, 2, 3, 4, 5],
        [2, 0, 1, 6, 7],
        [3, 1, 0, 2, 8],
        [4, 6, 2, 0, 3],
        [5, 7, 8, 3, 0],
    ]
    problem = make_problem([8, 8, 8, 8], [1, 1, 1, 1], [10, 10], 100, dist)
    chromosome = Chromosome(perm=[2, 3, 0, 1], qty=[4, 6, 4, 6])
    decoded, log = decode(problem, chromosome)
    assert log.lots() == 0
    assert decoded.routes == [[2, 3], [0, 1]]  # suborden de π dentro de cada vehículo
    assert decoded.loads == [10, 10]
    # V1: D→C3 4 + C3→C4 3 + C4→D 5 = 12 ; V2: D→C1 2 + C1→C2 1 + C2→D 3 = 6
    assert decoded.route_km == [12, 6]
    assert decoded.total_km == 18

    routes = routes_payload(problem, chromosome.qty, decoded)
    assert routes[0]["path"] == ["DEPOT", "C3", "C4", "DEPOT"]
    assert routes[1]["path"] == ["DEPOT", "C1", "C2", "DEPOT"]


def test_decode_skips_centers_with_zero_quantity() -> None:
    problem = make_problem([8, 8, 8, 8], [1, 1, 1, 1], [10, 10], 100, FLAT)
    chromosome = Chromosome(perm=[0, 1, 2, 3], qty=[5, 0, 0, 3])
    decoded, _ = decode(problem, chromosome)
    assert decoded.vehicle_of == [0, -1, -1, 0]
    assert decoded.routes == [[0, 3], []]
    assert decoded.route_km[1] == 0


def test_decode_reduces_one_lot_at_a_time_when_packing_fails() -> None:
    # Σq = 18 ≤ Σ C_v = 20 y ≤ B, pero 6+6+6 no cabe en dos vehículos de 10 → falla FFD
    problem = make_problem([6, 6, 6, 9], [3, 2, 1, 1], [10, 10], 100, FLAT)
    chromosome = Chromosome(perm=[0, 1, 2, 3], qty=[6, 6, 6, 0])
    decoded, log = decode(problem, chromosome)
    # se quita a la menor prioridad (C3, p=1) lote a lote hasta que cabe: 6 → 4
    assert chromosome.qty == [6, 6, 4, 0]
    assert log.reductions == {REASON_PACKING: {2: 2}}
    assert sorted(decoded.loads) == [6, 10]
    assert all(load <= cap for load, cap in zip(decoded.loads, problem.capacities, strict=True))


def test_decode_is_lamarckian_and_idempotent(demo_problem) -> None:
    generator = Generator(PCG64(5))
    for _ in range(200):
        chromosome = Chromosome(
            perm=generator.permutation(demo_problem.n).tolist(),
            qty=[int(generator.integers(0, 40)) for _ in range(demo_problem.n)],
        )
        decoded, _ = decode(demo_problem, chromosome)
        again, log_again = decode(demo_problem, chromosome.copy())
        assert log_again.lots() == 0, "un cromosoma ya reparado no debe requerir reparación"
        assert again.routes == decoded.routes and again.total_km == decoded.total_km


def test_every_decoded_solution_passes_validation_from_scratch(demo_problem) -> None:
    generator = Generator(PCG64(99))
    for _ in range(300):
        chromosome = Chromosome(
            perm=generator.permutation(demo_problem.n).tolist(),
            qty=[int(generator.integers(-5, 60)) for _ in range(demo_problem.n)],
        )
        decoded, _ = decode(demo_problem, chromosome)
        report = validate_solution(
            demo_problem,
            chromosome_payload(demo_problem, chromosome.perm, chromosome.qty),
            routes_payload(demo_problem, chromosome.qty, decoded),
            decoded.total_km,
        )
        assert report["feasible"], [c for c in report["checks"] if not c["ok"]]
        # cada centro con q>0 exactamente una vez; rutas depósito→…→depósito
        visited = [c for route in decoded.routes for c in route]
        assert sorted(visited) == [i for i in range(demo_problem.n) if chromosome.qty[i] > 0]
        assert sum(chromosome.qty) <= demo_problem.inventory


def test_validation_detects_violations(hand_problem) -> None:
    chromosome = {"pi": ["C3", "C1", "C2"], "q": {"C1": 10, "C2": 4, "C3": 4}}
    good_routes = [
        {
            "vehicle_id": "V1",
            "load_lots": 10,
            "path": ["DEPOT", "C1", "DEPOT"],
            "stops": [{"order": 1, "center_id": "C1", "lots": 10}],
        },
        {
            "vehicle_id": "V2",
            "load_lots": 8,
            "path": ["DEPOT", "C3", "C2", "DEPOT"],
            "stops": [
                {"order": 1, "center_id": "C3", "lots": 4},
                {"order": 2, "center_id": "C2", "lots": 4},
            ],
        },
    ]
    assert validate_solution(hand_problem, chromosome, good_routes, 18.0)["feasible"]

    def failing(chrom, routes, km=18.0) -> set[str]:
        report = validate_solution(hand_problem, chrom, routes, km)
        assert not report["feasible"]
        return {c["id"] for c in report["checks"] if not c["ok"]}

    # permutación con repetido
    assert "permutation" in failing({**chromosome, "pi": ["C3", "C1", "C1"]}, good_routes)
    # cantidad por encima de la demanda
    over = {"pi": chromosome["pi"], "q": {"C1": 10, "C2": 9, "C3": 4}}
    assert "quantity_domain" in failing(over, good_routes)
    # inventario excedido (B = 18)
    over_b = {"pi": chromosome["pi"], "q": {"C1": 10, "C2": 8, "C3": 6}}
    assert "inventory" in failing(over_b, good_routes)
    # centro visitado dos veces
    twice = [good_routes[0], {**good_routes[1], "stops": good_routes[1]["stops"] * 2}]
    assert "single_visit" in failing(chromosome, twice)
    # ruta que no vuelve al depósito
    open_route = [good_routes[0], {**good_routes[1], "path": ["DEPOT", "C3", "C2"]}]
    assert "depot_round_trip" in failing(chromosome, open_route)
    # orden contrario a π dentro del vehículo
    swapped = [
        good_routes[0],
        {
            **good_routes[1],
            "path": ["DEPOT", "C2", "C3", "DEPOT"],
            "stops": list(reversed(good_routes[1]["stops"])),
        },
    ]
    assert "pi_suborder" in failing(chromosome, swapped)
    # distancia informada distinta de la recalculada
    assert "distance_recomputed" in failing(chromosome, good_routes, km=17.0)
    # sobrecarga de vehículo
    overloaded = [
        {
            "vehicle_id": "V1",
            "load_lots": 14,
            "path": ["DEPOT", "C1", "C3", "DEPOT"],
            "stops": [
                {"order": 1, "center_id": "C1", "lots": 10},
                {"order": 2, "center_id": "C3", "lots": 4},
            ],
        },
        {
            "vehicle_id": "V2",
            "load_lots": 4,
            "path": ["DEPOT", "C2", "DEPOT"],
            "stops": [{"order": 1, "center_id": "C2", "lots": 4}],
        },
    ]
    assert "vehicle_capacity" in failing(chromosome, overloaded, km=3 + 6 + 5 + 4 + 4)
