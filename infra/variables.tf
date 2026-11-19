variable "region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "nutriruta"
}

variable "image_tag" {
  description = "Tag de la imagen del backend en ECR (el workflow pasa el SHA del commit)."
  type        = string
  default     = "latest"
}

variable "availability_zones" {
  description = "AZ cuyas subredes de la VPC por defecto se usan (evita us-east-1e, sin soporte del VPC Link)."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "admin_username" {
  description = "Usuario inicial de la aplicación. La contraseña se genera y vive en Secrets Manager."
  type        = string
  default     = "admin"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "worker_cpu" {
  type    = number
  default = 512
}

variable "worker_memory" {
  type    = number
  default = 1024
}

variable "log_retention_days" {
  type    = number
  default = 7
}
