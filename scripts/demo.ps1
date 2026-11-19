# NutriRuta AG — equivalente de `make demo` para Windows (PowerShell).
#   powershell -ExecutionPolicy Bypass -File scripts\demo.ps1
# Levanta el stack con Docker Compose, espera a que responda y ejecuta las cuatro corridas
# oficiales (semillas 11, 22, 33 y 44) sobre el escenario demo sintético.

param(
    [string]$AppUrl = "http://localhost:8090",
    [switch]$SkipRuns
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "Construyendo y levantando los contenedores..."
docker compose up -d --build --wait
if ($LASTEXITCODE -ne 0) { throw "docker compose no pudo levantar el stack." }

Write-Host "Esperando a la aplicacion en $AppUrl ..."
$ready = $false
foreach ($attempt in 1..60) {
    try {
        $health = Invoke-RestMethod -Uri "$AppUrl/health" -TimeoutSec 3
        if ($health.status -eq "ok") { $ready = $true; break }
    } catch { Start-Sleep -Seconds 1 }
}
if (-not $ready) { throw "La aplicacion no respondio en $AppUrl. Revise 'docker compose logs'." }
Write-Host "Aplicacion lista (version $($health.code_version))."

if (-not $SkipRuns) {
    $env:PYTHONIOENCODING = "utf-8"
    python scripts/export_four_runs.py --api $AppUrl --out evidencia
    if ($LASTEXITCODE -ne 0) { throw "No se pudieron ejecutar las cuatro corridas." }
}

Write-Host ""
Write-Host "Listo. Abra $AppUrl en el navegador."
