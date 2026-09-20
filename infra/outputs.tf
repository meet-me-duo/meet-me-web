output "app_url" {
  value = "https://${local.app_domain}"
}

output "web_bucket_name" {
  value = aws_s3_bucket.web.id
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.web.id
}

output "cloudfront_distribution_arn" {
  value = aws_cloudfront_distribution.web.arn
}

output "web_acl_arn" {
  value = aws_wafv2_web_acl.web.arn
}

output "hosted_zone_arn" {
  value = data.aws_route53_zone.main.arn
}

output "aws_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}
