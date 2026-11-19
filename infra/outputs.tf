output "app_url" {
  description = "URL pública de la aplicación (frontend en Amplify)."
  value       = local.web_url
}

output "api_url" {
  description = "URL de la API (API Gateway); el frontend se compila con ella como VITE_API_URL."
  value       = local.api_url
}

output "amplify_app_id" {
  value = aws_amplify_app.frontend.id
}

output "amplify_branch" {
  value = aws_amplify_branch.main.branch_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "admin_username" {
  value = var.admin_username
}

output "admin_password_secret" {
  description = "Contraseña inicial: aws secretsmanager get-secret-value --secret-id <este valor> --query SecretString --output text"
  value       = aws_secretsmanager_secret.admin_password.name
}

output "log_group" {
  value = aws_cloudwatch_log_group.app.name
}
