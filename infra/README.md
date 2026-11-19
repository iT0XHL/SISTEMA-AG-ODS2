# Despliegue en AWS (demostración)

```
Usuario ──► Amplify (frontend, HTTPS)
   └──HTTPS──► API Gateway ──VPC Link──► ECS Fargate: api + worker ──► RDS PostgreSQL
```

- **Frontend en Amplify**, sin conectarlo a GitHub (no hace falta token): el script compila el frontend dentro de Docker con `VITE_API_URL` apuntando a la API y sube el resultado con `aws amplify create-deployment`.
- **API en ECS Fargate detrás de API Gateway** (HTTPS sin dominio propio; VPC Link + Cloud Map, sin ALB ni NAT). Se evita CloudFront porque AWS exige verificar la cuenta antes de crear distribuciones.
- **Sesión por token.** Amplify y API Gateway son dominios distintos, así que las cookies serían "de terceros" (Safari y las ventanas privadas las bloquean). Por eso el login devuelve además el token, el frontend lo guarda en `sessionStorage` y lo envía como `Authorization: Bearer`; el backend acepta ambos (cookie en local con nginx, token en AWS) y permite el origen de Amplify por CORS (`CORS_ORIGINS`).
- **API y worker** usan la misma imagen (ECR). El worker debe ser una sola réplica: ejecuta las corridas del algoritmo genético tomándolas de la base de datos.
- RDS `db.t4g.micro` privada, sin backups: costo aproximado **USD 25–30/mes** mientras esté encendido. Al terminar la demo, ejecute `scripts\desplegar_aws.ps1 -Destruir`.
- Las contraseñas (BD y administrador) se generan y viven en Secrets Manager. La app arranca con `APP_ENV=production` y `TRUSTED_PROXY_HOPS=1` (el rate limit usa la IP real que añade API Gateway).

## Desplegar (un solo comando)

Requisitos en tu PC: [Terraform ≥ 1.10](https://developer.hashicorp.com/terraform/install), [AWS CLI v2](https://aws.amazon.com/cli/) y **Docker Desktop iniciado** (el frontend se compila dentro de Docker; no hace falta Node.js). Se usa un único usuario IAM con `AdministratorAccess` (aquí el perfil `poscosegran`).

```powershell
powershell -ExecutionPolicy Bypass -File scripts\desplegar_aws.ps1 -Perfil poscosegran
```

El script hace, en orden: `terraform init` → crea el repositorio ECR → construye y sube la imagen del backend → `terraform apply` (te pide escribir `yes`; con `-SinPreguntar` no) → espera a que `api` y `worker` estén estables → compila el frontend con la URL de la API y lo sube a Amplify → prueba la API y la página → imprime la URL y cómo leer la contraseña.

La primera vez tarda ~10–15 min (sobre todo RDS). Volver a ejecutarlo despliega la versión nueva.

| Opción | Efecto |
|---|---|
| `-Perfil <nombre>` | perfil de AWS CLI a usar (si no, el de `AWS_PROFILE`) |
| `-SinPreguntar` | aplica Terraform sin pedir confirmación |
| `-SoloFrontend` | solo recompila y sube el frontend (la infraestructura ya existe) |
| `-Destruir` | borra toda la infraestructura (**hazlo al terminar la demo** para no pagar) |

### Entrar a la aplicación
```powershell
aws secretsmanager get-secret-value --secret-id nutriruta/admin_password --query SecretString --output text --profile poscosegran
```
Usuario `admin` y esa contraseña, en la URL que imprime el script (`terraform output app_url` en `infra/`; la API está en `api_url`). La cuenta se crea una sola vez al primer arranque; cambiar el secreto después no cambia la contraseña ya creada (use `python -m app.users` dentro de la tarea o destruya y recree).

> **Estado local.** Terraform guarda su estado en `infra/terraform.tfstate`, que contiene las contraseñas generadas y está en `.gitignore`. No lo borres mientras la infraestructura exista: sin él, `-Destruir` no sabe qué borrar. No se usa GitHub Actions para desplegar.

## Operación
- **Logs:** CloudWatch → grupo `/ecs/nutriruta` (streams `api/…` y `worker/…`).
- **Redeploy:** volver a ejecutar `scripts\desplegar_aws.ps1`.
- **Si el login falla con error de red/CORS:** `CORS_ORIGINS` de la API debe ser exactamente la URL de Amplify (`terraform output app_url`); si cambió, vuelva a ejecutar el script. Si la API da 503, la tarea `api` aún no está registrada en Cloud Map o no pasó el health check: mire CloudWatch (`/ecs/nutriruta`).
- **Subredes:** se usan las de la VPC por defecto en `us-east-1a/b`. Si su cuenta no tiene VPC por defecto, créela (`aws ec2 create-default-vpc`) o ajuste `availability_zones`.
- **Límites conocidos:** API Gateway corta las respuestas a los 30 s (las corridas son asíncronas y la interfaz hace polling, así que no afecta); el rate limit usa memoria del proceso (una sola tarea `api`).
