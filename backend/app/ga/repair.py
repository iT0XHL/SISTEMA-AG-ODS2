"""Reparación de cantidades: garantiza dominio e inventario **antes** de decodificar.

Reglas (plan §3.2):

1. Limitar cada ``q_i`` al dominio ``[0, min(d_i, max_v C_v)]``.
2. Mientras ``Σq > B`` o ``Σq > Σ C_v``: quitar un lote al centro de **menor
   prioridad** con cantidad positiva (desempate por orden fijo de ID).

La reparación es *lamarckiana*: modifica el vector ``qty`` recibido, de modo que
el cromosoma publicado es factible por sí mismo. Cada lote retirado queda
registrado en el ``RepairLog`` para distinguir variación genética de corrección
de factibilidad.
"""

from __future__ import annotations

from app.domain.models import Problem
from app.ga.chromosome import (
    REASON_DOMAIN,
    REASON_FLEET,
    REASON_INVENTORY,
    RepairLog,
)


def clamp_to_domain(problem: Problem, qty: list[int], log: RepairLog) -> None:
    """Recorta ``q_i`` a ``[0, min(d_i, max C_v)]``. Solo registra los recortes hacia abajo."""
    upper = problem.upper
    for i in range(problem.n):
        value = qty[i]
        if value < 0:
            qty[i] = 0
        elif value > upper[i]:
            log.add(REASON_DOMAIN, i, value - upper[i])
            qty[i] = upper[i]


def reduce_lowest_priority(problem: Problem, qty: list[int], lots: int) -> list[tuple[int, int]]:
    """Retira ``lots`` lotes, uno a uno, del centro de menor prioridad con cantidad positiva.

    Equivale exactamente al bucle lote a lote del plan (el centro de menor prioridad
    se agota antes de pasar al siguiente), pero se ejecuta por bloques. Devuelve
    ``[(centro, lotes_retirados), ...]``.
    """
    removed: list[tuple[int, int]] = []
    remaining = lots
    for i in problem.reduction_order:
        if remaining <= 0:
            break
        if qty[i] > 0:
            take = min(qty[i], remaining)
            qty[i] -= take
            remaining -= take
            removed.append((i, take))
    return removed


def repair_quantities(problem: Problem, qty: list[int], log: RepairLog | None = None) -> RepairLog:
    """Aplica dominio + límite de inventario/flota. Termina siempre (Σq decrece)."""
    log = log if log is not None else RepairLog()
    clamp_to_domain(problem, qty, log)
    limit = problem.delivery_limit
    excess = sum(qty) - limit
    if excess > 0:
        # El límite activo determina el motivo registrado.
        reason = REASON_INVENTORY if problem.inventory <= problem.fleet_capacity else REASON_FLEET
        for center, lots in reduce_lowest_priority(problem, qty, excess):
            log.add(reason, center, lots)
    return log
