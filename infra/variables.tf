variable "aws_region" {
  description = "Primary AWS region."
  type        = string
  default     = "ap-northeast-2"
}

variable "domain_name" {
  description = "Existing Route 53 public zone."
  type        = string
  default     = "meet-me.co.kr"
}

variable "github_owner" {
  description = "GitHub organization name."
  type        = string
  default     = "meet-me-duo"
}

variable "github_owner_id" {
  description = "Immutable GitHub organization ID used by the customized OIDC subject."
  type        = number
  default     = 319248346
}

variable "github_repository" {
  description = "GitHub repository name."
  type        = string
  default     = "meet-me-web"
}

variable "github_repository_id" {
  description = "Immutable GitHub repository ID used by the customized OIDC subject."
  type        = number
  default     = 1341255220
}
