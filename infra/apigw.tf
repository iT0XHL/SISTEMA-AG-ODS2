# API Gateway HTTP API: da HTTPS sin dominio propio (la cookie de sesión es Secure) y entra a las
# tareas por VPC Link + Cloud Map, sin ALB. Sirve TODO: la API (/api/*, /health) y el frontend
# (la imagen «web» lo incluye), así el navegador ve un solo origen y no hace falta CORS.

resource "aws_apigatewayv2_api" "main" {
  name          = "${var.project}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_vpc_link" "main" {
  name               = "${var.project}-api"
  subnet_ids         = data.aws_subnets.default.ids
  security_group_ids = [aws_security_group.vpclink.id]
}

resource "aws_apigatewayv2_integration" "main" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = aws_service_discovery_service.api.arn
  connection_type        = "VPC_LINK"
  connection_id          = aws_apigatewayv2_vpc_link.main.id
  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.main.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 100
    throttling_burst_limit = 200
  }
}

# Cloud Map: API Gateway encuentra la IP de la tarea aunque cambie en cada despliegue.
resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "${var.project}.interno"
  vpc  = data.aws_vpc.default.id
}

resource "aws_service_discovery_service" "api" {
  name = "api"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"

    dns_records {
      type = "SRV"
      ttl  = 10
    }
  }
}
