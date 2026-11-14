"""Generador determinista del escenario DEMO (plan §2.1 modo DEMO, HU-01).

Todo lo que produce es **sintético**: nombres «Centro ficticio NN», coordenadas
dentro de un área ilustrativa, demandas y prioridades simuladas. No usa nombres
reales con coordenadas inventadas ni representa stock de ninguna institución.

La semilla del generador (``fixture_seed``) es independiente de la semilla
evolutiva del AG.
"""

from __future__ import annotations

from typing import Any

from numpy.random import PCG64, Generator

DEFAULT_FIXTURE_SEED = 2026
DEFAULT_DEMO_CENTERS = 18
DEMO_DEPOT = {"id": "DEPOT", "name": "Depósito ficticio", "lat": -13.07, "lon": -76.39}
DEMO_INVENTORY = 135
DEMO_VEHICLES = 3
DEMO_VEHICLE_CAPACITY = 50

# Área ilustrativa (rectángulo en grados). Se descarta la esquina suroeste para que los
# puntos ficticios no caigan sobre el mar en el mapa base.
LAT_RANGE = (-13.12, -13.01)
LON_RANGE = (-76.40, -76.27)
ZONES = ("Zona ilustrativa Norte", "Zona ilustrativa Centro", "Zona ilustrativa Sur")
PRIORITY_VALUES = (1, 2, 3)
PRIORITY_PROBABILITIES = (0.5, 0.3, 0.2)
DEMAND_RANGE = (6, 16)


def _in_excluded_corner(lat: float, lon: float) -> bool:
    return lon < -76.37 and lat < -13.09


def demo_scenario_id(n_centers: int, fixture_seed: int) -> str:
    if n_centers == DEFAULT_DEMO_CENTERS and fixture_seed == DEFAULT_FIXTURE_SEED:
        return "demo-cañete-001"
    return f"demo-cañete-n{n_centers}-s{fixture_seed}"


def generate_demo_scenario(
    n_centers: int = DEFAULT_DEMO_CENTERS,
    fixture_seed: int = DEFAULT_FIXTURE_SEED,
    inventory_lots: int | None = None,
    n_vehicles: int = DEMO_VEHICLES,
    vehicle_capacity: int = DEMO_VEHICLE_CAPACITY,
) -> dict[str, Any]:
    """Escenario sintético reproducible: mismo ``(n_centers, fixture_seed)`` ⇒ mismo escenario."""
    if n_centers < 1:
        raise ValueError("n_centers debe ser ≥ 1")
    rng = Generator(PCG64(fixture_seed))
    centers = []
    for k in range(1, n_centers + 1):
        while True:
            lat = round(float(rng.uniform(*LAT_RANGE)), 5)
            lon = round(float(rng.uniform(*LON_RANGE)), 5)
            if not _in_excluded_corner(lat, lon):
                break
        demand = int(rng.integers(DEMAND_RANGE[0], DEMAND_RANGE[1] + 1))
        priority = int(rng.choice(PRIORITY_VALUES, p=PRIORITY_PROBABILITIES))
        span = LAT_RANGE[1] - LAT_RANGE[0]
        zone = ZONES[min(2, int((LAT_RANGE[1] - lat) / span * 3))]
        centers.append(
            {
                "id": f"C{k:02d}",
                "name": f"Centro ficticio {k:02d}",
                "district": zone,
                "address": None,
                "lat": lat,
                "lon": lon,
                "demand_lots": demand,
                "priority_weight": priority,
                "source": "synthetic",
                "demand_origin": "synthetic",
                "users_aggregate": None,
            }
        )
    return {
        "scenario_id": demo_scenario_id(n_centers, fixture_seed),
        "label": f"Escenario sintético para evaluación ({n_centers} centros)",
        "data_origin": "synthetic",
        "distance_mode": "haversine_demo",
        "distance_source": None,
        "depot": dict(DEMO_DEPOT),
        "inventory_lots": DEMO_INVENTORY if inventory_lots is None else inventory_lots,
        "vehicles": [
            {"id": f"V{v:02d}", "capacity_lots": vehicle_capacity} for v in range(1, n_vehicles + 1)
        ],
        "centers": centers,
        "distances": [],
        "data_license": "Datos sintéticos generados por NutriRuta AG; sin restricciones de uso.",
        "notes": (
            "Coordenadas, demandas y prioridades son de prueba; no representan centros reales "
            "ni estadísticas de Cañete."
        ),
        "priority_criterion": "Prioridades simuladas al azar con fines de demostración.",
        "demand_rule": None,
        "fixture_seed": fixture_seed,
    }
