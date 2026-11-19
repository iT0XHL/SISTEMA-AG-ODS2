# Amplify Hosting sirve el frontend estático (HTTPS incluido). No se conecta a GitHub (no hace
# falta token ni permisos sobre el repo): scripts/desplegar_aws.ps1 compila el frontend con la URL
# de la API y sube el resultado con `aws amplify create-deployment`.
# El navegador habla directo con API Gateway (otro dominio): la sesión viaja como token Bearer
# y el backend permite este origen por CORS.

resource "aws_amplify_app" "frontend" {
  name     = var.project
  platform = "WEB"

  # SPA con BrowserRouter: toda ruta sin extensión de archivo estático devuelve index.html.
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>"
    target = "/index.html"
    status = "200"
  }

  # Mismas cabeceras que ponía nginx. OpenStreetMap exige Referer: se envía solo el origen.
  custom_headers = <<-EOT
    customHeaders:
      - pattern: '**'
        headers:
          - key: Referrer-Policy
            value: strict-origin-when-cross-origin
          - key: X-Content-Type-Options
            value: nosniff
          - key: X-Frame-Options
            value: DENY
  EOT
}

resource "aws_amplify_branch" "main" {
  app_id            = aws_amplify_app.frontend.id
  branch_name       = "main"
  stage             = "PRODUCTION"
  enable_auto_build = false
}
