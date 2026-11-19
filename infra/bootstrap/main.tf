# Bootstrap (se ejecuta UNA vez, a mano, con el perfil AWS que ya usa el proyecto).
# Crea solo el bucket S3 donde Terraform guarda su state (lo necesita GitHub Actions).
# Su propio state es local (infra/bootstrap/terraform.tfstate).
#
# Alternativa sin Terraform:
#   aws s3api create-bucket --bucket nutriruta-tfstate-<ACCOUNT_ID> --region us-east-1
#   aws s3api put-bucket-versioning --bucket nutriruta-tfstate-<ACCOUNT_ID> --versioning-configuration Status=Enabled

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
  type    = string
  default = "nutriruta"
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = var.project, ManagedBy = "terraform-bootstrap" }
  }
}

data "aws_caller_identity" "current" {}

locals {
  state_bucket = "${var.project}-tfstate-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "state" {
  bucket        = local.state_bucket
  force_destroy = false
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "tf_state_bucket" {
  description = "Variable de GitHub TF_STATE_BUCKET."
  value       = aws_s3_bucket.state.bucket
}

output "aws_region" {
  description = "Variable de GitHub AWS_REGION."
  value       = var.region
}
