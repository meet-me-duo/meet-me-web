data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.oidc_subject]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "meet-me-web-production-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "ListWebBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.web.arn]
  }
  statement {
    sid       = "PublishWebAssets"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
  }
  statement {
    sid       = "InvalidateDistribution"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.web.arn]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "meet-me-web-production-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
