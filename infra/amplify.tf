# Amplify Hosting solo sirve los archivos estáticos del frontend. No se conecta a GitHub
# (no hace falta token): el workflow sube `frontend/dist` con `aws amplify create-deployment`.
# Los usuarios entran por la URL de CloudFront (mismo origen para /api y la SPA).

resource "aws_amplify_app" "frontend" {
  name     = var.project
  platform = "WEB"

  # SPA con BrowserRouter: toda ruta sin extensión devuelve index.html.
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>"
    target = "/index.html"
    status = "200"
  }
}

resource "aws_amplify_branch" "main" {
  app_id            = aws_amplify_app.frontend.id
  branch_name       = "main"
  stage             = "PRODUCTION"
  enable_auto_build = false
}

locals {
  amplify_domain = "${aws_amplify_branch.main.branch_name}.${aws_amplify_app.frontend.default_domain}"
}
