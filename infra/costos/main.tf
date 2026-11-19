# Control de costos: presupuesto mensual del proyecto + detección de anomalías en la cuenta.
# Es un Terraform APARTE del despliegue (estado local propio): `desplegar_aws.ps1 -Destruir` no
# lo borra, así las alertas siguen activas cuando la infraestructura ya no existe.
#   cd infra/costos ; terraform init ; terraform apply

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  description = "Valor de la etiqueta Project que llevan todos los recursos del despliegue."
  type        = string
  default     = "nutriruta"
}

variable "alert_email" {
  description = "Correo que recibe las alertas. Va en terraform.tfvars (no se versiona)."
  type        = string
}

variable "anomaly_monitor_arn" {
  description = "ARN del monitor de anomalías por servicio de la cuenta: aws ce get-anomaly-monitors --query \"AnomalyMonitors[?MonitorType=='DIMENSIONAL'].MonitorArn\" --output text"
  type        = string
}

variable "budget_usd" {
  description = "Límite mensual del proyecto, en USD."
  type        = number
  default     = 10
}

variable "anomaly_threshold_usd" {
  description = "Una anomalía de gasto por encima de este impacto (USD) genera aviso."
  type        = number
  default     = 2
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "${var.project}-costos", ManagedBy = "terraform" }
  }
}

# Para filtrar el presupuesto por proyecto, la etiqueta Project debe estar activa en Billing.
# (Los datos por etiqueta aparecen en el presupuesto hasta ~24 h después de activarla.)
resource "aws_ce_cost_allocation_tag" "project" {
  tag_key = "Project"
  status  = "Active"
}

resource "aws_budgets_budget" "project" {
  name         = "${var.project}-mensual"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = [format("user:Project$%s", var.project)]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }

  depends_on = [aws_ce_cost_allocation_tag.project]
}

# Anomalías de gasto en TODA la cuenta, por servicio. AWS solo permite un monitor por servicio
# por cuenta (ya existe el predeterminado, "Default-Services-Monitor"), así que se reutiliza y
# solo se añade una suscripción con un umbral bajo: la predeterminada avisa a partir de USD 100
# y +40 %, demasiado alto para una cuenta de demostración.
resource "aws_ce_anomaly_subscription" "account" {
  name             = "${var.project}-anomalias"
  frequency        = "DAILY"
  monitor_arn_list = [var.anomaly_monitor_arn]

  subscriber {
    type    = "EMAIL"
    address = var.alert_email
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = [tostring(var.anomaly_threshold_usd)]
    }
  }
}

output "budget" {
  value = "${aws_budgets_budget.project.name}: USD ${var.budget_usd}/mes"
}

output "anomaly_alerts" {
  value = "Resumen diario si una anomalía supera USD ${var.anomaly_threshold_usd}"
}
