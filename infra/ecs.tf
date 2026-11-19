locals {
  image = "${aws_ecr_repository.backend.repository_url}:${var.image_tag}"

  api_url = aws_apigatewayv2_api.main.api_endpoint
  web_url = "https://${aws_amplify_branch.main.branch_name}.${aws_amplify_app.frontend.default_domain}"

  # Mismas variables para API y worker (APP_ENV=production activa las validaciones de la app).
  app_environment = [
    { name = "APP_ENV", value = "production" },
    { name = "COOKIE_SECURE", value = "true" },
    { name = "CORS_ORIGINS", value = local.web_url },
    { name = "ADMIN_USERNAME", value = var.admin_username },
    { name = "ADMIN_NAME", value = "Administrador" },
    { name = "MIN_CENTERS", value = "5" },
    { name = "MAX_CENTERS", value = "50" },
    { name = "MAX_GENERATIONS", value = "1000" },
    { name = "MAX_UPLOAD_MB", value = "5" },
    { name = "MAX_RUN_SECONDS", value = "120" },
    # API Gateway añade la IP real del cliente al final de X-Forwarded-For (un solo salto).
    { name = "TRUSTED_PROXY_HOPS", value = "1" },
    { name = "GIT_COMMIT", value = var.image_tag },
  ]

  app_secrets = [
    { name = "DB_URL", valueFrom = aws_secretsmanager_secret.db_url.arn },
    { name = "ADMIN_PASSWORD", valueFrom = aws_secretsmanager_secret.admin_password.arn },
  ]
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.project}"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "main" {
  name = var.project
}

# ------------------------------------------------------------------------- API
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.task_execution.arn

  container_definitions = jsonencode([{
    name         = "api"
    image        = local.image
    essential    = true
    command      = ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
    portMappings = [{ containerPort = 8000, protocol = "tcp" }]
    environment  = local.app_environment
    secrets      = local.app_secrets
    healthCheck = {
      command     = ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).status == 200 else 1)"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "api"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn   = aws_service_discovery_service.api.arn
    container_name = "api"
    container_port = 8000
  }
}

# ---------------------------------------------------------------------- Worker
# Ejecuta las corridas del algoritmo genético tomándolas de la base de datos, de una en una:
# debe haber exactamente UNA réplica y nunca dos a la vez (de ahí min 0 / max 100 al desplegar).
resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.project}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.task_execution.arn

  container_definitions = jsonencode([{
    name        = "worker"
    image       = local.image
    essential   = true
    command     = ["python", "-m", "app.worker"]
    environment = local.app_environment
    secrets     = local.app_secrets
    stopTimeout = 120 # termina la corrida en curso (MAX_RUN_SECONDS=120) antes de cerrar
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "worker"
      }
    }
  }])
}

resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }
}
