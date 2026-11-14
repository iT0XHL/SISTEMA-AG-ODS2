"""Métricas auxiliares, serialización de soluciones y validación desde cero.

``validate_solution`` vuelve a comprobar **todas** las restricciones duras (plan §3.3)
sin reutilizar el decodificador: trabaja solo con el cromosoma y las rutas publicadas.
Ninguna solución se publica si alguna comprobación falla.
"""

from __future__ import annotations

from typing import Any

from app.domain.models import DISTANCE_MODE_LABELS, Problem, Weights
from app.ga.chromosome import Decoded, RepairLog
from app.ga.fitness import components

KM_TOLERANCE = 1e-6


def solution_metrics(
    problem: Problem,
    qty: list[int] | tuple[int, ...],
    decoded: Decoded,
    d_ref: float,
    weights: Weights,
) -> dict[str, Any]:
    """Indicadores con unidad explícita. La unidad de optimización es el lote, no la persona."""
    c = components(problem, qty, decoded.total_km, d_ref, weights)
    delivered = sum(qty)
    with_demand = [i for i in range(problem.n) if problem.demand[i] > 0]
    served = [i for i in with_demand if qty[i] > 0]
    fully = [i for i in with_demand if qty[i] == problem.demand[i]]
    weighted_delivered = sum(p * q for p, q in zip(problem.priority, qty, strict=True))
    return {
        "J": c.j,
        "fitness": c.fitness,
        "U": c.u,
        "R": c.r,
        "H": c.h,
        "lots_delivered": delivered,
        "lots_demanded": problem.total_demand,
        "lots_pending": problem.total_demand - delivered,
        "inventory_lots": problem.inventory,
        "inventory_remaining": problem.inventory - delivered,
        "weighted_demand_total": problem.weighted_demand,
        "weighted_demand_delivered": weighted_delivered,
        "weighted_coverage": 1.0 - c.u,
        "centers_total": problem.n,
        "centers_with_demand": len(with_demand),
        "centers_served": len(served),
        "centers_fully_served": len(fully),
        "centers_served_pct": (len(served) / len(with_demand)) if with_demand else 0.0,
        "high_priority_total": len(problem.high_priority),
        "high_priority_unserved": sum(1 for i in problem.high_priority if qty[i] == 0),
        "vehicles_used": sum(1 for route in decoded.routes if route),
        "vehicles_total": problem.m,
        "total_km": decoded.total_km,
        "d_ref_km": d_ref,
        "distance_mode": problem.distance_mode,
        "distance_mode_label": DISTANCE_MODE_LABELS[problem.distance_mode],
        "vehicle_loads": {problem.vehicle_ids[v]: decoded.loads[v] for v in range(problem.m)},
    }


def routes_payload(
    problem: Problem, qty: list[int] | tuple[int, ...], decoded: Decoded
) -> list[dict[str, Any]]:
    """Rutas por vehículo con IDs reales: ``[depot, …centros…, depot]``."""
    payload = []
    for v in range(problem.m):
        route = decoded.routes[v]
        stops = [
            {
                "order": k + 1,
                "center_id": problem.center_ids[c],
                "lots": qty[c],
            }
            for k, c in enumerate(route)
        ]
        path = (
            [problem.depot_id, *[problem.center_ids[c] for c in route], problem.depot_id]
            if route
            else []
        )
        payload.append(
            {
                "vehicle_id": problem.vehicle_ids[v],
                "capacity_lots": problem.capacities[v],
                "load_lots": decoded.loads[v],
                "km": decoded.route_km[v],
                "used": bool(route),
                "path": path,
                "stops": stops,
            }
        )
    return payload


def assignments_payload(
    problem: Problem, qty: list[int] | tuple[int, ...], decoded: Decoded
) -> list[dict[str, Any]]:
    """Tabla por centro: demanda, asignación, pendiente, vehículo y orden de parada."""
    stop_order: dict[int, int] = {}
    for route in decoded.routes:
        for k, c in enumerate(route):
            stop_order[c] = k + 1
    rows = []
    for i in range(problem.n):
        v = decoded.vehicle_of[i]
        rows.append(
            {
                "center_id": problem.center_ids[i],
                "priority_weight": problem.priority[i],
                "demand_lots": problem.demand[i],
                "assigned_lots": qty[i],
                "pending_lots": problem.demand[i] - qty[i],
                "vehicle_id": problem.vehicle_ids[v] if v >= 0 else None,
                "stop_order": stop_order.get(i),
                "partial_only": problem.demand[i] > problem.max_capacity,
            }
        )
    return rows


def repair_payload(problem: Problem, log: RepairLog) -> dict[str, Any]:
    return {
        "total_lots_removed": log.lots(),
        "by_reason": {
            reason: [
                {"center_id": problem.center_ids[center], "lots": lots}
                for center, lots in sorted(bucket.items())
            ]
            for reason, bucket in log.reductions.items()
        },
    }


def chromosome_payload(
    problem: Problem, perm: list[int], qty: list[int] | tuple[int, ...]
) -> dict[str, Any]:
    return {
        "pi": [problem.center_ids[i] for i in perm],
        "q": {problem.center_ids[i]: qty[i] for i in range(problem.n)},
    }


def validate_solution(
    problem: Problem,
    chromosome: dict[str, Any],
    routes: list[dict[str, Any]],
    reported_total_km: float,
    check_pi_suborder: bool = True,
) -> dict[str, Any]:
    """Comprueba desde cero las restricciones duras sobre los datos publicados."""
    index = {cid: i for i, cid in enumerate(problem.center_ids)}
    pi: list[str] = list(chromosome["pi"])
    q: dict[str, int] = dict(chromosome["q"])
    checks: list[dict[str, Any]] = []

    def add(check_id: str, description: str, ok: bool, detail: str = "") -> None:
        checks.append(
            {"id": check_id, "description": description, "ok": bool(ok), "detail": detail}
        )

    # 1. π es una permutación completa y sin repetidos
    add(
        "permutation",
        "π es una permutación completa de los centros, sin repetidos",
        sorted(pi) == sorted(problem.center_ids) and len(set(pi)) == len(pi),
        f"{len(pi)} genes para {problem.n} centros",
    )

    # 2. dominio de cantidades
    domain_violations = [
        cid
        for cid in problem.center_ids
        if not isinstance(q.get(cid), int)
        or not (0 <= q[cid] <= problem.demand[index[cid]])
        or q[cid] > problem.max_capacity
    ]
    add(
        "quantity_domain",
        "0 ≤ q_i ≤ d_i y q_i ≤ max C_v para todo centro",
        set(q) == set(problem.center_ids) and not domain_violations,
        "sin violaciones" if not domain_violations else f"violaciones: {domain_violations}",
    )

    # 3. inventario
    delivered = sum(v for v in q.values() if isinstance(v, int))
    add(
        "inventory",
        "Σ q_i ≤ B (inventario)",
        delivered <= problem.inventory,
        f"{delivered} ≤ {problem.inventory} lotes",
    )

    # 4. capacidad por vehículo
    vehicle_index = {vid: v for v, vid in enumerate(problem.vehicle_ids)}
    overloaded = []
    for route in routes:
        load = sum(q.get(stop["center_id"], 0) for stop in route["stops"])
        cap = problem.capacities[vehicle_index[route["vehicle_id"]]]
        if load > cap or load != route["load_lots"]:
            overloaded.append(route["vehicle_id"])
    add(
        "vehicle_capacity",
        "La carga de cada vehículo no supera su capacidad C_v",
        not overloaded and len({r["vehicle_id"] for r in routes}) == len(routes),
        "sin violaciones" if not overloaded else f"vehículos en falta: {overloaded}",
    )

    # 5. unicidad de visitas
    visits: dict[str, int] = {}
    for route in routes:
        for stop in route["stops"]:
            visits[stop["center_id"]] = visits.get(stop["center_id"], 0) + 1
    must_visit = {cid for cid in problem.center_ids if q.get(cid, 0) > 0}
    add(
        "single_visit",
        "Cada centro con q_i > 0 se visita exactamente una vez, en un único vehículo",
        set(visits) == must_visit and all(count == 1 for count in visits.values()),
        f"{len(must_visit)} centros con entrega, {sum(visits.values())} paradas",
    )

    # 6. rutas depósito → … → depósito
    bad_paths = [
        r["vehicle_id"]
        for r in routes
        if r["stops"]
        and (
            r["path"][0] != problem.depot_id
            or r["path"][-1] != problem.depot_id
            or r["path"][1:-1] != [s["center_id"] for s in r["stops"]]
        )
    ]
    add(
        "depot_round_trip",
        "Cada ruta usada inicia y termina en el depósito",
        not bad_paths,
        "sin violaciones" if not bad_paths else f"rutas en falta: {bad_paths}",
    )

    # 7. suborden de π dentro de cada vehículo (solo soluciones del AG)
    if check_pi_suborder:
        position = {cid: k for k, cid in enumerate(pi)}
        unordered = []
        for route in routes:
            seq = [position.get(stop["center_id"], -1) for stop in route["stops"]]
            if seq != sorted(seq):
                unordered.append(route["vehicle_id"])
        add(
            "pi_suborder",
            "Dentro de cada vehículo, las paradas respetan el orden relativo de π",
            not unordered,
            "sin violaciones" if not unordered else f"rutas en falta: {unordered}",
        )

    # 8. distancia recalculada desde D
    recomputed = 0.0
    for route in routes:
        recomputed += problem.route_km([index[s["center_id"]] for s in route["stops"]])
    add(
        "distance_recomputed",
        "La distancia total coincide con la recalculada desde la matriz D",
        abs(recomputed - reported_total_km) <= KM_TOLERANCE,
        f"recalculada {recomputed:.6f} km; informada {reported_total_km:.6f} km",
    )

    return {"feasible": all(check["ok"] for check in checks), "checks": checks}
