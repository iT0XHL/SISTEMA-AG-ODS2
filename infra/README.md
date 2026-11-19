# Despliegue en AWS (demostración)

```
Usuario ──HTTPS──► CloudFront ──┬─ /api/*, /health ─► ALB ─► ECS Fargate: api (+ worker) ─► RDS PostgreSQL
                                └─ resto ───────────► Amplify Hosting (frontend estático)
```

- **Un solo dominio** (`https://xxxx.cloudfront.net`): la cookie de sesión funciona sin CORS. Entre siempre por esa URL, no por `*.amplifyapp.com`.
- **API y worker** usan la misma imagen (ECR). El worker debe ser una sola réplica: ejecuta las corridas del algoritmo genético tomándolas de la base de datos.
- **Sin NAT**, RDS `db.t4g.micro` privada, sin backups: costo aproximado **USD 35–45/mes** mientras esté encendido. Al terminar la demo, ejecute `scripts\desplegar_aws.ps1 -Destruir`.
- Las contraseñas (BD y administrador) se generan y viven en Secrets Manager. La app arranca con `APP_ENV=production`.

## Desplegar (un solo comando)

Requisitos en tu PC: [Terraform ≥ 1.10](https://developer.hashicorp.com/terraform/install), [AWS CLI v2](https://aws.amazon.com/cli/), Node.js y **Docker Desktop iniciado**. Se usa un único usuario IAM con `AdministratorAccess` (aquí el perfil `poscosegran`).

```powershell
powershell -ExecutionPolicy Bypass -File scripts\desplegar_aws.ps1 -Perfil poscosegran
```

El script hace, en orden: `terraform init` → crea el repositorio ECR → construye y sube la imagen del backend → `terraform apply` (te pide escribir `yes`; con `-SinPreguntar` no) → espera a que `api` y `worker` estén estables → compila el frontend y lo sube a Amplify → prueba `/health` → imprime la URL y cómo leer la contraseña.

La primera vez tarda ~15–20 min (RDS y CloudFront). Volver a ejecutarlo despliega la versión nueva.

| Opción | Efecto |
|---|---|
| `-Perfil <nombre>` | perfil de AWS CLI a usar (si no, el de `AWS_PROFILE`) |
| `-SinPreguntar` | aplica Terraform sin pedir confirmación |
| `-SoloFrontend` | solo recompila y sube el frontend |
| `-Destruir` | borra toda la infraestructura (**hazlo al terminar la demo** para no pagar) |

### Entrar a la aplicación
```powershell
aws secretsmanager get-secret-value --secret-id nutriruta/admin_password --query SecretString --output text --profile poscosegran
```
Usuario `admin` y esa contraseña, en la URL que imprime el script (`terraform output app_url` en `infra/`). La cuenta se crea una sola vez al primer arranque; cambiar el secreto después no cambia la contraseña ya creada (use `python -m app.users` dentro de la tarea o destruya y recree).

> **Estado local.** Terraform guarda su estado en `infra/terraform.tfstate`, que contiene las contraseñas generadas y está en `.gitignore`. No lo borres mientras la infraestructura exista: sin él, `-Destruir` no sabe qué borrar. No se usa GitHub Actions para desplegar.

## Operación
- **Logs:** CloudWatch → grupo `/ecs/nutriruta` (streams `api/…` y `worker/…`).
- **Redeploy:** volver a ejecutar `scripts\desplegar_aws.ps1`.
- **Si CloudFront tarda o `/health` da 403:** el ALB solo acepta el encabezado secreto que añade CloudFront; no hay acceso directo al ALB por diseño.
- **Subredes:** se usan las de la VPC por defecto en `us-east-1a/b`. Si su cuenta no tiene VPC por defecto, créela (`aws ec2 create-default-vpc`) o ajuste `availability_zones`.
- **Límites conocidos:** el ALB usa HTTP hacia CloudFront (tráfico dentro de AWS); el rate limit usa memoria del proceso (una sola tarea `api`).
