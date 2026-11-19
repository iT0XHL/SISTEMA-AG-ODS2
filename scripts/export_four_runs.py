"""Ejecuta el experimento oficial de cuatro corridas contra la aplicación y guarda la evidencia.

Solo usa la biblioteca estándar: funciona con cualquier Python ≥ 3.10 sin instalar nada.

    python scripts/export_four_runs.py --api http://localhost:8090 --out docs/evidencia

Pasos: asegura el escenario demo (sintético, determinista) → línea base → encola las
semillas 11/22/33/44 con el preset «Estándar» → espera al worker → descarga CSV y JSON.
Las cifras salen del programa en ejecución; este script no calcula ni inventa resultados.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")

    def call(self, method: str, path: str, body: object | None = None) -> tuple[int, bytes]:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(
            self.base + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json"} if data is not None else {},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    def json(self, method: str, path: str, body: object | None = None) -> dict:
        status, raw = self.call(method, path, body)
        payload = json.loads(raw.decode("utf-8")) if raw else {}
        if status >= 400:
            raise SystemExit(f"{method} {path} → {status}: {payload.get('message', payload)}")
        return payload


def fmt(value: float, digits: int) -> str:
    return f"{value:.{digits}f}"


def markdown_table(experiment: dict) -> str:
    lines = [
        "| Corrida | Seed | J | Fitness | Lotes entregados / demandados | Cobertura ponderada "
        "| Distancia km + modalidad | Vehículos | Tiempo CPU s | Generaciones | Factible |",
        "|---|---:|---:|---:|---|---:|---|---:|---:|---:|---|",
    ]
    for row in experiment["runs"]:
        m = row["metrics"]
        lines.append(
            f"| {row['corrida']} | {row['seed']} | {fmt(m['J'], 5)} | {fmt(m['fitness'], 5)} "
            f"| {m['lots_delivered']} / {m['lots_demanded']} "
            f"| {fmt(100 * m['weighted_coverage'], 2)} % "
            f"| {fmt(m['total_km'], 2)} ({m['distance_mode']}) | {m['vehicles_used']} "
            f"| {fmt(m['cpu_seconds'], 2)} | {m['generations_run']} "
            f"| {'sí' if row['feasible'] else 'no'} |"
        )
    b = experiment["baseline"]["metrics"]
    lines.append(
        f"| Línea base | — | {fmt(b['J'], 5)} | {fmt(b['fitness'], 5)} "
        f"| {b['lots_delivered']} / {b['lots_demanded']} "
        f"| {fmt(100 * b['weighted_coverage'], 2)} % "
        f"| {fmt(b['total_km'], 2)} ({b['distance_mode']}) | {b['vehicles_used']} | — | — "
        f"| {'sí' if experiment['baseline']['feasible'] else 'no'} |"
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://localhost:8090", help="URL base de la aplicación")
    parser.add_argument("--out", default="docs/evidencia", help="carpeta de salida")
    parser.add_argument(
        "--scenario-id", default=None, help="escenario ya guardado (por defecto, demo)"
    )
    parser.add_argument("--timeout", type=float, default=300.0)
    args = parser.parse_args()
    api = Api(args.api)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    health = api.json("GET", "/health")
    print(f"Aplicación {health['code_version']} · base de datos {health['database']}")

    if args.scenario_id:
        scenario_id = args.scenario_id
    else:
        scenario = api.json("POST", "/api/v1/scenarios/demo", {})
        created = api.json("POST", "/api/v1/scenarios", scenario)
        scenario_id = created["id"]
        print(f"Escenario demo «{scenario_id}» · hash {created['hash'][:16]}…")
    quoted = urllib.parse.quote(scenario_id)

    started = api.json("POST", "/api/v1/experiments/four-runs", {"scenario_id": scenario_id})
    experiment_id = started["experiment_id"]
    print(f"Experimento {experiment_id} · semillas {started['seeds']}")

    deadline = time.monotonic() + args.timeout
    while True:
        experiment = api.json("GET", f"/api/v1/experiments/{experiment_id}")
        if experiment["status"] != "running":
            break
        if time.monotonic() > deadline:
            raise SystemExit("Tiempo agotado esperando al worker.")
        time.sleep(0.5)
    if experiment["status"] != "completed":
        raise SystemExit(f"El experimento terminó en estado «{experiment['status']}».")

    for extension in ("csv", "json"):
        status, raw = api.call(
            "GET", f"/api/v1/experiments/{experiment_id}/export?format={extension}"
        )
        if status != 200:
            raise SystemExit(f"No se pudo exportar {extension}: HTTP {status}")
        (out / f"cuatro_corridas.{extension}").write_bytes(raw)
    for row in experiment["runs"]:
        status, raw = api.call("GET", f"/api/v1/runs/{row['run_id']}/export?format=csv")
        (out / f"asignaciones_seed{row['seed']}.csv").write_bytes(raw)

    detail = api.json("GET", f"/api/v1/scenarios/{quoted}")
    (out / "escenario.json").write_text(
        json.dumps(detail, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    table = markdown_table(experiment)
    (out / "tabla_cuatro_corridas.md").write_text(table + "\n", encoding="utf-8")
    (out / "resumen.json").write_text(
        json.dumps(experiment, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    sys.stdout.reconfigure(encoding="utf-8")
    print()
    print(table)
    print()
    summary = experiment["summary"]
    print(
        f"J media {fmt(summary['J']['mean'], 5)} · desv. estándar muestral "
        f"{fmt(summary['J']['std'], 5)} · corridas mejores que la línea base: "
        f"{summary['runs_better_than_baseline']}/4"
    )
    print(f"Evidencia guardada en {out.resolve()}")


if __name__ == "__main__":
    main()
