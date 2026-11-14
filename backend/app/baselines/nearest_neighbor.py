"""Orden de visita por vecino más cercano (parte de la línea base determinista)."""

from __future__ import annotations

from app.domain.models import Problem


def nearest_neighbor_order(problem: Problem, centers: list[int]) -> list[int]:
    """Ordena ``centers`` partiendo del depósito y yendo siempre al más cercano.

    Desempate determinista por orden fijo de ID (índice menor primero).
    """
    pending = sorted(centers)
    route: list[int] = []
    current = 0  # nodo del depósito en la matriz
    while pending:
        row = problem.dist[current]
        nxt = min(pending, key=lambda c: (row[c + 1], c))
        pending.remove(nxt)
        route.append(nxt)
        current = nxt + 1
    return route
