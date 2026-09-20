terraform {
  required_version = ">= 1.11.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  backend "s3" {
    key          = "meet-me-web/production/terraform.tfstate"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags { tags = local.tags }
}

data "aws_caller_identity" "current" {}
data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}
data "aws_cloudfront_response_headers_policy" "security" {
  name = "Managed-SecurityHeadersPolicy"
}

locals {
  app_domain   = "app.${var.domain_name}"
  bucket_name  = "meet-me-web-production-${data.aws_caller_identity.current.account_id}"
  oidc_subject = "repo:${var.github_owner}@${var.github_owner_id}/${var.github_repository}@${var.github_repository_id}:environment:production"
  tags         = { Project = "meet-me", Service = "web", Environment = "production", ManagedBy = "terraform" }
}
