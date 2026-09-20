# Production deployment

## 구성

- URL: `https://app.meet-me.co.kr`
- API: `https://api.meet-me.co.kr`
- 비공개 S3 + CloudFront Origin Access Control + Route 53 Alias
- ACM 인증서는 CloudFront 요구에 따라 `us-east-1`에 생성한다.
- GitHub Actions는 `production` Environment에서만 OIDC role을 사용한다.

## 현재 상태

2026-09-20에 Terraform을 적용했고 `https://app.meet-me.co.kr`을 공개했다. CloudFront 배포판, WAF와 Route 53 zone은 PricingPlanManager의 `FREE / ACTIVE` 구독에 연결됐다. 계정은 `PAID / ACTIVE`이고 이 구독은 유료 승인이 없는 월 $0 플랜이다.

Free 플랜은 AWS 관리형 캐시·응답 헤더 정책과 전용 WAF Web ACL을 사용해야 한다. 현재 인프라는 이 조건에 맞춰 `Managed-CachingOptimized`, `Managed-SecurityHeadersPolicy`, IP rate-limit WAF 규칙을 사용한다.

## Terraform

기존 백엔드 인프라의 remote state bucket을 재사용하되 state key는 `meet-me-web/production/terraform.tfstate`로 분리한다.

```powershell
terraform -chdir=infra fmt -check
terraform -chdir=infra init -backend-config="bucket=<기존-state-bucket>" -backend-config="region=ap-northeast-2"
terraform -chdir=infra validate
terraform -chdir=infra plan -out=frontend.tfplan
```

승인 후에만 저장된 plan을 적용한다. 출력된 다음 값을 GitHub 저장소 `Settings > Environments > production > Variables`에 등록한다.

```text
AWS_REGION=ap-northeast-2
AWS_DEPLOY_ROLE_ARN=<aws_deploy_role_arn>
WEB_BUCKET_NAME=<web_bucket_name>
CLOUDFRONT_DISTRIBUTION_ID=<cloudfront_distribution_id>
API_BASE_URL=https://api.meet-me.co.kr
```

비밀값은 없으며 AWS Access Key를 만들거나 등록하지 않는다. `production` Environment는 `main` branch만 허용하고 가능하면 required reviewer와 self-review 방지를 켠다.

## 첫 배포 검증

1. GitHub Actions `Deploy production`을 승인해 실행한다.
2. `https://app.meet-me.co.kr`과 직접 `/rooms/<inviteCode>` 진입이 모두 200인지 확인한다.
3. 실제 방 하나를 만들어 HOST cookie가 발급되고, 다른 브라우저가 MEMBER로 참여하는지 확인한다.
4. 요청 Origin이 정확히 `https://app.meet-me.co.kr`이며 credential CORS가 성공하는지 확인한다.
5. HTML은 `no-cache`, 해시 CSS/JS는 `max-age=31536000, immutable`, 보안 헤더와 TLS가 적용됐는지 확인한다.
