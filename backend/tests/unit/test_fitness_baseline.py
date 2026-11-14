"""Prueba unitaria 6 del plan §9.1: fitness recalculado a mano (3 centros, 2 vehículos).

Fixture ``hand_problem``:
    C1: d=10, p=3 · C2: d=8, p=1 · C3: d=6, p=2 · V1=V2=10 lotes · B=18
    km: D–C1=3, D–C2=4, D–C3=5, C1–C2=2, C1–C3=6, C2–C3=3   →  Σ p·d = 30 + 8 + 12 = 50

Línea base (prioridad desc.: C1, C3, C2):
    C1 ← 10 en V1 · C3 ← 6 en V2 · C2 ← min(8, inventario restante 2) = 2 en V2
    V1: D→C1→D = 6 km · V2 (vecino más cercano): D→C2 (4) →C3 (3) →D (5) = 12 km
    D_ref = 18 km
"""

from __future__ import annotations

import pytest

from app.baselines.nearest_neighbor import nearest_neighbor_order
from app.baselines.priority_greedy import compute_baseline
from app.domain.metrics import solution_metrics
from app.domain.models import Weights
from app.ga.chromosome import Chromosome
from app.ga.fitness import (
    components,
    evaluate,
    fitness_from_j,
    high_priority_unserved,
    relative_distance,
    unmet_weighted_demand,
)
from tests.conftest import make_problem

W = Weights()  # 0.75 / 0.20 / 0.05


def test_baseline_by_hand(hand_problem) -> None:
    baseline = compute_baseline(hand_problem)
    assert baseline.qty == (10, 2, 6)
    assert baseline.decoded.routes == [[0], [1, 2]]
    assert baseline.decoded.loads == [10, 8]
    assert baseline.decoded.route_km == [6, 12]
    assert baseline.d_ref == 18
    assert baseline.d_ref_is_convention is False
    c = components(hand_problem, baseline.qty, baseline.decoded.total_km, baseline.d_ref, W)
    assert c.u == pytest.approx(6 / 50)  # solo faltan 6 lotes de C2 (p=1)
    assert c.r == pytest.approx(1.0)  # la línea base define R = 1
    assert c.h == 0
    assert c.j == pytest.approx(0.75 * 0.12 + 0.20 * 1.0)  # 0.29
    assert c.fitness == pytest.approx(1 / 1.29)


def test_fitness_by_hand(hand_problem) -> None:
    d_ref = compute_baseline(hand_problem).d_ref
    # π = [C3, C1, C2] ; q = (C1: 10, C2: 4, C3: 4)
    individual = evaluate(hand_problem, Chromosome([2, 0, 1], [10, 4, 4]), d_ref, W)
    # FFD: C1(10)→V1 ; empate C3/C2 (4) → primero C3 por π ; ambos a V2
    assert individual.decoded.routes == [[0], [2, 1]]
    # V1: 3+3 = 6 ; V2: D→C3 5 + C3→C2 3 + C2→D 4 = 12
    assert individual.decoded.total_km == 18
    assert individual.u == pytest.approx((3 * 0 + 1 * 4 + 2 * 2) / 50)  # 0.16
    assert individual.r == pytest.approx(18 / 18)
    assert individual.h == 0
    assert individual.j == pytest.approx(0.75 * 0.16 + 0.20 * 1.0 + 0.05 * 0)  # 0.32
    assert individual.fitness == pytest.approx(1 / 1.32)
    assert individual.repair.lots() == 0


def test_higher_j_means_lower_fitness(hand_problem) -> None:
    d_ref = compute_baseline(hand_problem).d_ref
    good = evaluate(hand_problem, Chromosome([2, 0, 1], [10, 4, 4]), d_ref, W)
    # deja sin entrega al único centro de prioridad 3 → H = 1 y U sube
    bad = evaluate(hand_problem, Chromosome([2, 0, 1], [0, 8, 6]), d_ref, W)
    assert bad.h == 1
    assert bad.u == pytest.approx(30 / 50)
    # V1: C2(8) ; V2: C3(6) → 8 + 10 = 18 km → R = 1
    assert bad.j == pytest.approx(0.75 * 0.6 + 0.20 * 1.0 + 0.05 * 1.0)  # 0.70
    assert bad.j > good.j and bad.fitness < good.fitness
    # monotonía estricta de la transformación
    values = [0.0, 0.1, 0.32, 0.7, 1.5, 10.0]
    fits = [fitness_from_j(j) for j in values]
    assert fits == sorted(fits, reverse=True) and all(0 < f <= 1 for f in fits)


def test_component_edge_cases() -> None:
    flat = [[0, 1, 1], [1, 0, 1], [1, 1, 0]]
    no_high = make_problem([5, 5], [1, 2], [10], 10, flat)
    assert high_priority_unserved(no_high, [0, 0]) == 0.0  # sin centros p=3 no hay división
    zero_demand = make_problem([0, 0], [3, 3], [10], 10, flat)
    assert unmet_weighted_demand(zero_demand, [0, 0]) == 0.0  # denominador max(1, 0)
    assert high_priority_unserved(zero_demand, [0, 0]) == 0.0  # sin demanda no hay desatención
    with pytest.raises(ValueError):
        relative_distance(10.0, 0.0)


def test_dref_convention_when_baseline_has_no_trips() -> None:
    flat = [[0, 1, 1], [1, 0, 1], [1, 1, 0]]
    problem = make_problem([5, 5], [1, 2], [10], 0, flat)  # B = 0 → sin viajes
    baseline = compute_baseline(problem)
    assert baseline.decoded.total_km == 0
    assert baseline.d_ref == 1.0 and baseline.d_ref_is_convention is True


def test_nearest_neighbor_order() -> None:
    dist = [
        [0, 5, 1, 4],
        [5, 0, 2, 9],
        [1, 2, 0, 9],
        [4, 9, 9, 0],
    ]
    problem = make_problem([1, 1, 1], [1, 1, 1], [10], 10, dist)
    # desde el depósito: C2 (1) → C1 (2) → C3 (9)
    assert nearest_neighbor_order(problem, [0, 1, 2]) == [1, 0, 2]
    assert nearest_neighbor_order(problem, []) == []


def test_baseline_partial_delivery_when_no_vehicle_fits() -> None:
    flat = [[0, 1, 1, 1], [1, 0, 1, 1], [1, 1, 0, 1], [1, 1, 1, 0]]
    problem = make_problem([7, 7, 7], [3, 2, 1], [10, 6], 100, flat)
    baseline = compute_baseline(problem)
    # C1: 7→V1(3 libres) · C2: 7 no cabe en V1(3) ni V2(6) → parcial 6 en V2 (más espacio)
    # C3: 7 no cabe → parcial 3 en V1
    assert baseline.qty == (7, 6, 3)
    assert baseline.decoded.loads == [10, 6]


def test_metrics_report_units_and_counts(hand_problem) -> None:
    baseline = compute_baseline(hand_problem)
    metrics = solution_metrics(hand_problem, baseline.qty, baseline.decoded, baseline.d_ref, W)
    assert metrics["lots_delivered"] == 18 and metrics["lots_demanded"] == 24
    assert metrics["lots_pending"] == 6 and metrics["inventory_remaining"] == 0
    assert metrics["weighted_coverage"] == pytest.approx(1 - 0.12)
    assert metrics["centers_served"] == 3 and metrics["centers_fully_served"] == 2
    assert metrics["vehicles_used"] == 2 and metrics["total_km"] == 18
    assert metrics["vehicle_loads"] == {"V1": 10, "V2": 8}
    assert metrics["distance_mode"] == "road_matrix"
