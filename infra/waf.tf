resource "aws_wafv2_web_acl" "web" {
  provider    = aws.us_east_1
  name        = "meet-me-web-production"
  description = "Free-plan-compatible baseline protection for Meet Me"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "IpRateLimit"
    priority = 0

    action {
      block {}
    }

    statement {
      rate_based_statement {
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300
        limit                 = 2000
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "IpRateLimit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "meet-me-web-production"
    sampled_requests_enabled   = true
  }
}
