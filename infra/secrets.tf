# Contraseñas generadas por Terraform (sin caracteres especiales para que sean seguras en una URL).
# La app en producción exige admin >= 12 caracteres y que DB_URL no use la contraseña de demo.

resource "random_password" "db" {
  length  = 28
  special = false
}

resource "random_password" "admin" {
  length  = 20
  special = false
}

# Secreto compartido CloudFront -> ALB: el ALB rechaza lo que no lo traiga.
resource "random_password" "origin_secret" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db_url" {
  name                    = "${var.project}/db_url"
  recovery_window_in_days = 0 # demo: permite recrear con el mismo nombre tras un destroy
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id = aws_secretsmanager_secret.db_url.id
  secret_string = format(
    "postgresql+psycopg://%s:%s@%s:%d/%s",
    aws_db_instance.main.username,
    random_password.db.result,
    aws_db_instance.main.address,
    aws_db_instance.main.port,
    aws_db_instance.main.db_name,
  )
}

resource "aws_secretsmanager_secret" "admin_password" {
  name                    = "${var.project}/admin_password"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "admin_password" {
  secret_id     = aws_secretsmanager_secret.admin_password.id
  secret_string = random_password.admin.result
}
