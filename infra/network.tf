# VPC por defecto, sin NAT (ahorra ~USD 32/mes). Cadena de confianza:
#   API Gateway --(VPC Link)--> tareas ECS :8000 --> RDS :5432
# Las tareas usan IP pública solo para descargar la imagen y leer los secretos;
# solo aceptan tráfico del VPC Link, y la base de datos no es pública.

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "availability-zone"
    values = var.availability_zones
  }
}

# El VPC Link solo es el conector de API Gateway: lo que protege a la API es el grupo de las tareas.
resource "aws_security_group" "vpclink" {
  name        = "${var.project}-vpclink"
  description = "VPC Link de API Gateway hacia la API"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "tasks" {
  name = "${var.project}-tasks"
  # La descripción de un grupo de seguridad no se puede cambiar sin reemplazarlo; se conserva
  # el texto original para poder actualizarlo en el sitio (ahora el origen es el VPC Link).
  description = "Tareas ECS: API solo desde el ALB"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "API desde el VPC Link de API Gateway"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.vpclink.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name        = "${var.project}-db"
  description = "PostgreSQL solo desde las tareas"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.tasks.id]
  }
}
