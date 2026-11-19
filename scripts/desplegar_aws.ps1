#Requires -Version 5.1
<#
Despliegue de demostración en AWS (infra/): crea la infraestructura con Terraform, publica la
imagen del backend en ECR, espera a que API y worker estén estables, compila el frontend con la
URL de la API y lo sube a Amplify, y prueba la aplicación. Es idempotente: volver a ejecutarlo
despliega la versión nueva.

Requiere Terraform, AWS CLI v2 y Docker Desktop iniciado (el frontend se compila dentro de
Docker, no hace falta Node.js).

Uso:
  powershell -ExecutionPolicy Bypass -File scripts\desplegar_aws.ps1 -Perfil poscosegran
  ... -SinPreguntar     no pide confirmar el terraform apply
  ... -SoloFrontend     solo recompila y sube el frontend (la infraestructura ya existe)
  ... -Destruir         borra TODA la infraestructura (evita costos al terminar la demo)
#>
[CmdletBinding()]
param(
    [string]$Perfil = "",
    [switch]$SinPreguntar,
    [switch]$SoloFrontend,
    [switch]$Destruir
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tfDir = Join-Path $projectRoot "infra"
$region = "us-east-1"

# El perfil se aplica a todo el proceso: terraform, aws y docker login lo heredan.
if ($Perfil) { $env:AWS_PROFILE = $Perfil }
$env:AWS_DEFAULT_REGION = $region

function Invoke-Paso([string]$descripcion, [scriptblock]$accion) {
    Write-Host "==> $descripcion" -ForegroundColor Cyan
    # Windows PowerShell 5.1 convierte en error fatal cualquier línea que un programa nativo
    # escribe por stderr (avisos de Docker, progreso de docker build/push...). El éxito se
    # decide solo por el código de salida.
    $anterior = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $global:LASTEXITCODE = 0
        & $accion
    } finally {
        $ErrorActionPreference = $anterior
    }
    if ($LASTEXITCODE -ne 0) { throw "Falló: $descripcion" }
}

function Get-Salida([string]$nombre) {
    $valor = & terraform "-chdir=$tfDir" output -raw $nombre
    if ($LASTEXITCODE -ne 0) { throw "No existe la salida de Terraform '$nombre'. ¿Ya se aplicó la infraestructura?" }
    return $valor
}

function Assert-Docker {
    cmd /c "docker info >nul 2>&1"
    if ($LASTEXITCODE -ne 0) { throw "Docker no responde. Inicia Docker Desktop y vuelve a ejecutar." }
}

function Publish-Frontend {
    $apiUrl = Get-Salida "api_url"
    $appId = Get-Salida "amplify_app_id"
    $rama = Get-Salida "amplify_branch"

    # El frontend se compila dentro de Docker (sin Node en tu PC) con la URL de la API incorporada.
    $dist = Join-Path ([IO.Path]::GetTempPath()) "nutriruta-dist"
    if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
    Push-Location $projectRoot
    try {
        Invoke-Paso "docker build del frontend (VITE_API_URL=$apiUrl)" {
            docker build -f backend/Dockerfile --target frontend-dist --build-arg "VITE_API_URL=$apiUrl" --output "type=local,dest=$dist" .
        }
    } finally {
        Pop-Location
    }

    $zip = Join-Path ([IO.Path]::GetTempPath()) "nutriruta-frontend.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    # tar.exe de Windows 10+ (ruta fija: no depender del PATH) escribe rutas con "/"; Compress-Archive de PS 5.1 usa "\" y Amplify no las entiende.
    Write-Host "==> Empaquetando el frontend" -ForegroundColor Cyan
    $archivos = Get-ChildItem $dist -Name
    $tar = Join-Path $env:SystemRoot "System32\tar.exe"
    & $tar -a -cf $zip -C $dist $archivos
    if ($LASTEXITCODE -ne 0) { throw "Falló el empaquetado del frontend" }

    Write-Host "==> Subiendo el frontend a Amplify" -ForegroundColor Cyan
    $despliegue = aws amplify create-deployment --app-id $appId --branch-name $rama --output json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "Falló: amplify create-deployment" }
    & curl.exe -fsS -X PUT -H "Content-Type: application/zip" --data-binary "@$zip" $despliegue.zipUploadUrl
    if ($LASTEXITCODE -ne 0) { throw "Falló la subida del zip a Amplify" }
    aws amplify start-deployment --app-id $appId --branch-name $rama --job-id $despliegue.jobId --output text --query "jobSummary.status" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falló: amplify start-deployment" }

    for ($i = 0; $i -lt 60; $i++) {
        $estado = aws amplify get-job --app-id $appId --branch-name $rama --job-id $despliegue.jobId --query "job.summary.status" --output text
        Write-Host "    Amplify: $estado"
        if ($estado -eq "SUCCEED") { return }
        if ($estado -in @("FAILED", "CANCELLED")) { throw "Amplify terminó con estado $estado" }
        Start-Sleep -Seconds 5
    }
    throw "Tiempo agotado esperando a Amplify"
}

Invoke-Paso "terraform init" { terraform "-chdir=$tfDir" init -input=false -reconfigure }

if ($Destruir) {
    Write-Host "Esto borra TODA la infraestructura de NutriRuta en AWS (base de datos incluida)." -ForegroundColor Yellow
    $destroyArgs = @("-chdir=$tfDir", "destroy")
    if ($SinPreguntar) { $destroyArgs += "-auto-approve" }
    Invoke-Paso "terraform destroy" { terraform @destroyArgs }
    return
}

if ($SoloFrontend) {
    Assert-Docker
    Publish-Frontend
    Write-Host "Frontend publicado: $(Get-Salida 'app_url')" -ForegroundColor Green
    return
}

# --- Etiqueta única por despliegue (fecha + commit): cada versión crea una task definition nueva.
$sha = (git -C $projectRoot rev-parse --short=7 HEAD 2>$null)
if (-not $sha) { $sha = "local" }
$tag = "{0}-{1}" -f (Get-Date -Format "yyyyMMddHHmmss"), $sha

# --- 1. El repositorio ECR tiene que existir antes de subir la imagen.
Invoke-Paso "terraform apply (solo ECR)" {
    terraform "-chdir=$tfDir" apply -input=false -auto-approve "-target=aws_ecr_repository.backend" -var "image_tag=$tag"
}
$repo = Get-Salida "ecr_repository_url"
$registro = $repo.Split("/")[0]

# --- 2. Imagen del backend (API y worker usan la misma).
Assert-Docker

# El pipe se hace en cmd: Windows PowerShell 5.1 re-codifica el texto entre programas nativos
# y ECR rechaza el token alterado con "400 Bad Request".
Invoke-Paso "docker login en ECR" {
    cmd /c "aws ecr get-login-password --region $region | docker login --username AWS --password-stdin $registro"
}
Push-Location $projectRoot
try {
    Invoke-Paso "docker build del backend" {
        docker build --platform linux/amd64 -f backend/Dockerfile --target runtime --build-arg "GIT_COMMIT=$tag" -t "${repo}:$tag" .
    }
} finally {
    Pop-Location
}
Invoke-Paso "docker push" { docker push "${repo}:$tag" }

# --- 3. Resto de la infraestructura con la imagen recién subida.
$applyArgs = @("-chdir=$tfDir", "apply", "-input=false", "-var", "image_tag=$tag")
if ($SinPreguntar) { $applyArgs += "-auto-approve" }
Invoke-Paso "terraform apply" { terraform @applyArgs }

$cluster = Get-Salida "ecs_cluster"
Write-Host "Esperando a que API y worker se estabilicen (la primera vez RDS tarda unos minutos)..."
Invoke-Paso "esperar ECS" { aws ecs wait services-stable --cluster $cluster --services api worker }

# --- 4. Frontend en Amplify (se compila con la URL de la API).
Publish-Frontend

# --- 5. Prueba de humo.
$url = Get-Salida "app_url"
$api = Get-Salida "api_url"
Write-Host "==> Probando $api/health y $url" -ForegroundColor Cyan
$ok = $false
for ($i = 0; $i -lt 20 -and -not $ok; $i++) {
    try {
        $r = Invoke-RestMethod -Uri "$api/health" -TimeoutSec 15
        $web = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
        if ($r.status -eq "ok" -and $web.StatusCode -eq 200) { $ok = $true }
    } catch { Start-Sleep -Seconds 15 }
}
if (-not $ok) { Write-Warning "La aplicación aún no responde OK (puede tardar un par de minutos). API: $api/health. Logs: CloudWatch /ecs/nutriruta" }

Write-Host ""
Write-Host "Aplicación: $url" -ForegroundColor Green
Write-Host "Usuario:    $(Get-Salida 'admin_username')"
Write-Host "Contraseña (se lee de Secrets Manager):"
Write-Host "  aws secretsmanager get-secret-value --secret-id $(Get-Salida 'admin_password_secret') --query SecretString --output text"
if ($Perfil) { Write-Host "  (agrega --profile $Perfil si no tienes AWS_PROFILE en la terminal)" }
Write-Host "Para apagar todo y no pagar: scripts\desplegar_aws.ps1 -Destruir" -ForegroundColor Yellow
