# Despliegue en AWS (demostración)

```
Usuario ──HTTPS──► CloudFront ──┬─ /api/*, /health ─► ALB ─► ECS Fargate: api (+ worker) ─► RDS PostgreSQL
                                └─ resto ───────────► Amplify Hosting (frontend estático)
```

- **Un solo dominio** (`https://xxxx.cloudfront.net`): la cookie de sesión funciona sin CORS. Entre siempre por esa URL, no por `*.amplifyapp.com`.
- **API y worker** usan la misma imagen (ECR). El worker debe ser una sola réplica: ejecuta las corridas del algoritmo genético tomándolas de la base de datos.
- **Sin NAT**, RDS `db.t4g.micro` privada, sin backups: costo aproximado **USD 35–45/mes** mientras esté encendido. Al terminar la demo, ejecute *destroy* (paso 6).
- Las contraseñas (BD y administrador) se generan y viven en Secrets Manager. La app arranca con `APP_ENV=production`.

## Pasos manuales (una sola vez)

Se usa un único usuario IAM con `AdministratorAccess` (aquí `poscosegran-deploy`, perfil `poscosegran`), tanto en tu PC como en GitHub Actions. No hay rol OIDC.

### 1. Perfil de AWS en tu PC
```powershell
$env:AWS_PROFILE = "poscosegran"
aws sts get-caller-identity      # debe mostrar user/poscosegran-deploy
```
Herramientas: [AWS CLI v2](https://aws.amazon.com/cli/) y [Terraform ≥ 1.10](https://developer.hashicorp.com/terraform/install).

### 2. Bucket para el state de Terraform
```powershell
cd infra/bootstrap
terraform init
terraform apply        # escriba "yes"
terraform output       # anote tf_state_bucket
```
(Alternativa sin Terraform: los dos comandos `aws s3api` que figuran al inicio de `infra/bootstrap/main.tf`.)

### 3. Secrets y variables en GitHub
Repositorio → Settings → Secrets and variables → Actions.

**Secrets** (pestaña *Secrets*): crea una access key nueva para `poscosegran-deploy` (IAM → Users → Security credentials → Create access key) o usa la que ya tenga, y guárdala:

| Secret | Valor |
|---|---|
| `AWS_ACCESS_KEY_ID` | Access key ID |
| `AWS_SECRET_ACCESS_KEY` | Secret access key |

**Variables** (pestaña *Variables*):

| Variable | Valor |
|---|---|
| `AWS_REGION` | `us-east-1` |
| `TF_STATE_BUCKET` | salida `tf_state_bucket` del paso 2 |

> La clave tiene permisos de administrador: no la compartas ni la subas al repositorio. Al terminar la demo, bórrala en IAM.

### 4. Desplegar
Cualquiera de las dos:
- Hacer push a `main`: cuando el workflow **CI** termine en verde se ejecuta **Deploy AWS**.
- Actions → **Deploy AWS** → *Run workflow* → `deploy` (no espera al CI).

El primer despliegue tarda ~15–20 min (RDS y CloudFront). Hace, en orden: crea ECR → construye y sube la imagen → `terraform apply` → espera a `api` y `worker` → compila el frontend y lo publica en Amplify → prueba `/health`. La URL final queda en el resumen del job.

### 5. Entrar
```bash
aws secretsmanager get-secret-value --secret-id nutriruta/admin_password --query SecretString --output text
```
Usuario `admin` y esa contraseña, en la URL `app_url` (`terraform output app_url` o resumen del job). La cuenta se crea una sola vez al primer arranque; cambiar el secreto después no cambia la contraseña ya creada (use `python -m app.users` dentro de la tarea o destruya y recree).

### 6. Apagar todo (evita costos)
Actions → **Deploy AWS** → *Run workflow* → `destroy`.
(El bucket de state queda; no cuesta. Para quitarlo: vacíelo y ejecute `terraform destroy` en `infra/bootstrap`.)

## Operación
- **Logs:** CloudWatch → grupo `/ecs/nutriruta` (streams `api/…` y `worker/…`).
- **Redeploy sin cambios:** *Run workflow* → `deploy`.
- **Local:** `cd infra && terraform init -backend-config="bucket=<tf_state_bucket>" -backend-config="region=us-east-1" && terraform plan -var image_tag=<sha>`.
- **Si CloudFront tarda o `/health` da 403:** el ALB solo acepta el encabezado secreto que añade CloudFront; no hay acceso directo al ALB por diseño.
- **Subredes:** se usan las de la VPC por defecto en `us-east-1a/b`. Si su cuenta no tiene VPC por defecto, créela (`aws ec2 create-default-vpc`) o ajuste `availability_zones`.
- **Límites conocidos:** el ALB usa HTTP hacia CloudFront (tráfico dentro de AWS); el rate limit usa memoria del proceso (una sola tarea `api`).
