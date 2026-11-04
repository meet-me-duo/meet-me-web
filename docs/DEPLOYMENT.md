# Production deployment

## 구성

- URL: `https://app.meet-me.co.kr`
- API: `https://api.meet-me.co.kr`
- 비공개 S3 + CloudFront Origin Access Control + Route 53 Alias
- ACM 인증서는 CloudFront 요구에 따라 `us-east-1`에 생성한다.
- GitHub Actions는 `production` Environment에서만 OIDC role을 사용한다.

## 모임별 링크 제목 전환 계획 (2026-11-04, 미적용)

`/rooms/<22자 invite_code>`의 최초 HTML을 기존 서버가 생성하고 공개 `purpose`만
`Meet me - 모임 이름`으로 넣는다. `/`의 `Meet me — 스마트 일정 조율`은 그대로다.
이미지나 참여자·입력 원문은 추가하지 않는다. 기존 주소/방을 그대로 사용하며 migration은 없다.
웹에서 이동한 경우에는 공개 방 조회를 바탕으로 탭 제목도 갱신한다.

서버는 **고정 주소** `https://app.meet-me.co.kr/index.html`만 읽는다. 요청의 Host,
forwarded 헤더, 쿠키, Authorization, query는 이 요청과 canonical 생성에 사용하지 않는다.
해당 주소는 반드시 기존 S3 behavior에 남겨 순환 호출을 막는다. 제목 HTML과 shell을
서버 메모리에 캐시하지 않는다. 전체 shell 요청은 3초/256KiB로 제한하고 redirect·비 HTML·
잘못된 shell·shell 장애는 정보 없는 503/no-store로 끝낸다. 모임이 없거나 삭제됐거나 이름 조회가 실패하면 기본 제목의
정상 SPA를 200으로 제공하므로 기존 오류 화면은 JS가 처리한다. `/rooms/*`는 중첩 경로도
일치하므로 `/rooms/<code>/nested` 등은 이름 조회 없이 기본 SPA를 제공한다.

선택 이유: JS 실행 전 제목을 읽는 공유 크롤러와 브라우저 모두 같은 HTML을 받으며
SSR 프레임워크, Lambda, 새 컴퓨팅 인프라나 이미지 저장소가 필요 없다.
비용/제약: 모임 HTML마다 기존 서버 DB 조회와 공개 shell GET이 추가되고 초기 응답이
Web origin에 의존한다. WAF의 IP별 제한에는 서버 outbound IP의 shell GET이 모인다.
대규모 트래픽 최적화는 별도 검토하며 이 변경에서 WAF/권한을 완화하지 않는다.

### 로컬 검증과 남은 게이트

- Server의 `ktlintCheck assemble test`는 종료 코드 0, 23분 40초다. 355 suites / 2,753 tests 중
  2,736 PASS, 17 SKIP, 실패·오류 0이며 신규 회귀 14개도 통과했다.
- Web의 최종 단위 925개, api:check·lint·typecheck·build, evidence preflight 3개가 통과했다.
  시스템 Chromium 151에서 브라우저 회귀 635 PASS / 1 SKIP와 evidence 6 PASS다.
  지정 Chromium 153 다운로드는 네트워크 정책 403으로 차단됐다. 차단 확인 후 추가 다운로드 시도나 정책 변경은 하지 않았다.
- 깨끗한 Server develop `9db8c067305e19d37f668de5c9648e179955adbc`에서 최초 Python 실패 대상
  34개 메서드는 모두 통과했다. Java 17·Alpine 준비 후 관련 Node 7개도 통과했고,
  AR15·AR16·AR24와 credential-refresh 전체 스크립트는 기준·feature 양쪽에서 순차 통과했다.
  같은 기준 소스의 제한된 동시 부하에서는 원래 15초 installer timeout과 AR15 실패가 재현됐다.
  운영 코드·assertion·timeout은 수정하지 않았다.
- Compose secret-fidelity는 기준·feature 모두 종료 코드 0이다. 이전 실패 표시는 연결 명령 묶음의
  종료 코드 1을 Compose에 잘못 귀속한 보고 오류였으며, 뒤의 credential-refresh fixture timeout과 구분한다.
- **수정하지 않은 Nginx runtime 검사는 환경 제약으로 미통과다.** 기준에서도 config 모드 0600으로
  읽기 거부가 발생했다. 임시 0644 보정 후 localhost health 요청은 환경 HTTP 프록시에서 403을 받았고,
  같은 임시 컨테이너의 로컬 직접 요청은 200이었다. 임시 권한은 원복하고 프록시·네트워크 정책은 유지했다.
  이후 임시 로컬 사본에서 비밀정보 없는 config만 0644로 두고 고정 localhost wget에만 `-Y off`를
  적용한 검사는 종료 코드 0(2.3초)으로 통과했다. assertion·timeout·capability는 유지했고 사본은 삭제했다.
  이 결과는 로컬 환경 보정의 검증이며 추적 fixture 변경이나 운영 Nginx 검증을 뜻하지 않는다.
- 최초 feature 배포 계약 결과는 Node 415개 중 10 FAIL, Python 424개 중 1 FAIL / 37 ERROR로 보존한다.
  **현재 feature의 전체 Python·Node 배포 계약은 이후 재실행하지 않았다.** 집중·기준 비교 결과만으로
  전체 배포 계약이나 CI 통과를 주장하지 않는다. ARM64 Built Image·정확 HEAD 원격 CI,
  운영 서버 outbound/TLS/DNS·CloudFront 전환·실제 Kakao 미리보기 검증은 미실행이다.

아래 단계는 **준비된 운영 계획**이며 이번 로컬 작업에서 실행하지 않는다.

1. `[AGENT/SHARED]` Web 배포의 자산 업로드에서 `s3 sync --delete` 제거를 먼저 배포한다.
   기존 해시 자산을 보존하고 새 자산 업로드 후 index.html을 교체한다. 이전 shell·열린 탭의
   해시 파일이 배포 중 사라지지 않도록 즉시 정리/lifecycle 삭제를 추가하지 않는다.
   보존 자산의 저장 비용과 향후 정리 정책은 별도 검토한다.
2. `[SHARED]` 필수 CI·리뷰와 별도 승인을 거쳐 서버를 배포한다. 기존 Nginx의 HTTPS
   `location /`가 이미 `/rooms/**`를 앱으로 전달하므로 프록시 설정을 추가하지 않는다.
   서버의 `/rooms/<가상 code>`와 `/rooms/<가상 code>/nested`를 쿠키 없이 확인한다.
   현 단계는 로컬 mock 검증이며 운영 서버 outbound TLS/DNS/접근·실제 API 기능은 미검증이다.
3. `[USER/SHARED]` Web Terraform의 CloudFront distribution에 기존 API HTTPS origin
   (`api.meet-me.co.kr`, HTTPS only/443, TLSv1.2)를 추가하고 S3 기본 behavior보다 우선하는
   **ordered behavior `/rooms/*`**를 준비·plan·검토한 뒤 승인받아 적용한다.
   GET/HEAD만 허용하고 `Managed-CachingDisabled`를 지정한다. Min/Default/Max TTL은
   모두 0이어야 한다. 기존 보안 응답 헤더 정책과 HTTPS 강제는 유지한다.
   origin path는 비우고 query/cookie/Authorization/Origin/viewer Host는 전달하지 않는다.
   User-Agent별 분기나 새 viewer rewrite를 추가하지 않는다. 기존 403/404 SPA error
   mapping은 유지하되 모임 누락은 서버가 200으로 처리하고 shell 장애는 503으로 구분한다.
   `/index.html`, `/assets/*`, 홈페이지와 다른 SPA 경로는 기존 S3 origin에 둔다.
4. `[SHARED]` behavior 배포 완료 후 `/rooms/*` 캐시를 invalidate한다. 두 모임의 최초 HTML
   title/og:title/canonical과 각각 다른 이름, 없는/삭제된 방, 중첩 경로, GET/HEAD,
   일반 브라우저·Kakao UA의 동일 응답, no-store 및 JS/CSS 200을 확인한다.
   `/`는 원래 제목인지 확인한다. 실제 방 이름을 운영 검증에 사용하려면 별도 허용된 방을
   사용하며 생성·참여·제출·모델 호출은 이 smoke에 포함하지 않는다.
5. `[SHARED]` 문제가 생기면 `/rooms/*` ordered behavior를 제거/비활성화해 기존 S3 SPA로
   돌리고 해당 경로를 invalidate한다. DB 변경이 없으므로 데이터 rollback은 필요 없다.

CloudFront의 **Minimum TTL > 0은 origin의 no-store도 무시할 수 있다**.
따라서 Cache-Control만으로 전환하지 않는다.
[캐시 정책 설명](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cache-key-understand-cache-policy.html),
[behavior 순서·경로 패턴](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html).
카카오가 이미 수집한 링크 미리보기는 별도 캐시 갱신 후 새 메시지로 다시 확인해야 하며,
기존 메시지 자동 갱신은 보장하지 않는다. 이 계획은 무료 구독의 origin/behavior 허용 및
정책 적용 가능성까지 운영에서 검증했다는 의미가 아니다. 적용 전 현재 구독 제약을 확인한다.

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

### #77 제출 집계 표시의 배포 순서

사용자가 서버 배포 후 Web 배포를 승인했다. 이번 변경은 서버 제출 집계의 운영 배포·계약 검증 완료를 담당자로부터 확인한 뒤 Web의 정상 develop 통합·main 승격·배포를 진행한다. 기존 다른 기능의 웹 선배포 기록을 이번 변경에 적용하지 않는다. 해당 완료 신호 전에는 Web Draft PR/정확 HEAD CI까지 준비하고 병합·배포 게이트를 유지한다.

신 웹은 구 서버의 집계 누락을0으로 추정하지 않고 미확인으로 표시한다. 새 서버의 required/non-null 집계는 기존 웹이 무시할 수 있는 추가 응답 필드다. 승인된 기존 GitHub production 파이프라인을 사용하며 보호 설정·비밀값·인프라를 변경하지 않는다. 운영 smoke는 공개 HTML/해시 자산/SPA GET과 모든 API를 미리 합성 처리한 실제 운영 번들 렌더만 사용한다. 실제 로그인·운영 방 생성/입력/모델 호출은 수행하지 않는다.

1. GitHub Actions `Deploy production`을 승인해 실행한다.
2. `https://app.meet-me.co.kr`과 직접 `/rooms/<inviteCode>` 진입이 모두 200인지 확인한다.
3. 방 생성·참여 등 쓰기 기능은 로컬/테스트 API로 검증한다. 운영 데이터 쓰기는 별도 명시적 승인 범위에서만 수행하며 운영 smoke의 기본 절차에 포함하지 않는다.
4. 요청 Origin이 정확히 `https://app.meet-me.co.kr`이며 credential CORS가 성공하는지 확인한다.
5. HTML은 `no-cache`, 해시 CSS/JS는 `max-age=31536000, immutable`, 보안 헤더와 TLS가 적용됐는지 확인한다.

## 자연어 전용 입력 변경의 검증·배포 순서

이 기능의 운영 smoke는 테스트 방 생성·참여·제출·수정·확정 등 운영 데이터 쓰기를 하지 않는다. 기존 배포 파이프라인을 사용하며 인프라·자격증명·권한·신뢰 설정은 변경하지 않는다. 출판·배포는 작업의 명시적 승인 범위, 필수 CI, 독립 리뷰와 아래 호환성 조건을 충족한 후 수행한다.

| 조합 | 요청·응답 및 검증 범위 |
| --- | --- |
| 기존 서버 + 신 웹 | `raw_text`만 전송하고 manual을 생략하면 기존 DTO의 빈 배열 기본값을 사용한다. 일반 자연어·500 코드포인트는 기존 service에서도 허용한다. 구 응답의 수동 배열은 신 웹에서 사용하지 않는다. 운영 OpenAPI GET·기준 소스 ab7917e·서버 baseline RED의 200 및 웹 목 API 회귀로 확인한다. |
| 신 서버 + 구 웹 | nonempty manual은 자연어 유무와 관계없이 400 `SUBMISSION_MANUAL_AVAILABILITY_UNSUPPORTED`로 거부한다. 구 웹은 이 코드를 모르므로 서버 `detail`을 표시한다. `detail`에 새로고침 후 자연어 재입력 안내가 필요하며 실제 구 운영 번들을 목 API로 확인한다. 실패 시 데이터·revision·인원·마감 불변은 서버 GREEN으로 검증한다. |
| 신 서버 + 신 웹 | ECMAScript trim 후 1~500 코드포인트의 raw_text-only 요청과 deprecated 빈 수동 응답을 사용한다. legacy null·미반영·HOST/MEMBER 경계와 후보/확정 시간은 승인 계약의 목 API로 검증하고 서버 GREEN 및 생성 OpenAPI와 대조한다. |

배포 순서는 **웹 선배포 → 실제 운영 웹 번들의 목 API 검증 → 서버 배포**로 한다. 구 서버가 생략 manual을 처리하는 호환성을 먼저 확인해야 한다. 선배포 순서만으로 오래 열린 탭이나 캐시된 구 웹이 사라지지는 않으며 서버의 nonempty manual 거부·읽을 수 있는 안내는 계속 필요하다.

전환 중 차이도 분리한다. 신 웹은 JS trim 후 요청하지만 구 서버의 Kotlin trim은 `U+001C..001F`를 추가로 제거한다. 이 문자만 입력하면 신 웹에서는 비어 있지 않아도 구 서버는 400을 반환할 수 있고, 원문 양끝에 있으면 재조회 원문·길이가 달라진다. FEFF 양끝과 일반 500/501 Unicode 코드포인트 경계는 신 웹이 전송 전에 정규화·검증한다. 구 서버 배포 구간의 기존 legacy 수동 값은 계속 옛 matching에 쓰이며 신 서버 전환 후 새 분석부터 안전 미반영 규칙을 적용한다. 이미 저장된 후보·확정 결과는 자동 재계산하지 않는다.

1. 서버가 GREEN 후 제공한 로컬 생성 OpenAPI의 경로와 SHA-256을 확인한다. PUT 자연어 필수·오류 코드·deprecated 빈 수동 배열, GET legacy nullable 원문, HOST NO_MATCH 미반영 조회와 nullable 원문을 검토한다. 후보·확정 `time_ranges`가 유지되는지 확인한다.
2. 실제 서버 파일을 `openapi/meet-me.openapi.json`에 동기화하고 `api:generate` 후 `api:check/lint/typecheck/test/build/test:e2e`를 모두 실행한다. 운영 `api:snapshot`으로 미배포 계약을 덮어쓰지 않는다. ECMAScript trim 문자집합과 내부 공백·500/501 코드포인트 회귀를 서버 결과와 대조한다.
3. desktop·Pixel 7 에뮬레이션에서 production build를 preview하고 모든 API를 목 처리한다. 자연어 제출·재조회·수정, 빈 입력·500/501 이모지, 실패 시 원문/revision 보존, legacy null과 자동 저장 없음, 입력 격자 부재, HOST/MEMBER 원문 경계, 후보·확정 시간 표시 및 가로 넘침을 확인한다.
4. 승인된 출판 범위에서 feature 브랜치를 commit/push하고 기본 draft PR을 준비한다. 실제 `verify` CI와 독립 리뷰 및 웹 선배포 순서를 확인한 후 ready/merge한다. `main` merge는 자동 운영 배포를 유발하므로 배포 단계와 함께 처리한다.
5. 기존 `Deploy production` 실행의 SHA·URL·성공 상태를 확인한다. 운영 HTML·해시 JS/CSS·직접 SPA 경로·캐시/보안 헤더는 읽기 전용 GET으로 확인하고 배포된 자산이 해당 빌드에 대응하는지 확인한다.
6. 운영 번들 자체는 새 브라우저 context에서 `https://app.meet-me.co.kr/rooms/<가상 22자 코드>`로 열어 확인한다. **탐색 전에** Playwright 라우팅을 설치한다. 모든 API 요청은 결정적인 목 응답으로 처리하고, 정의되지 않은 API·다른 origin 요청·허용하지 않은 경로·비 GET 외부 요청은 abort한다. 네트워크 continue는 해당 웹 origin의 공개 HTML/JS/CSS/이미지 GET에만 허용한다. 실제 참여 쿠키나 운영 원문은 사용하지 않는다.
7. 그 번들에서 3번의 입력·legacy·권한·시간 표시 사례와 위 호환성 매트릭스를 재현하고 desktop/mobile 캡처, 자산 URL·SHA, 목 요청 body 및 차단된 요청 목록을 증거로 남긴다. 임시 스크립트·캡처는 `test-results/`에만 저장한다. 목 서버 외부로 나간 API 요청이 있으면 검증을 실패 처리한다. 운영 API 기능·DB·실기기 검증으로 오인하지 않도록 검증 범위를 보고한다. 웹 운영 번들 확인 후에 서버 배포 단계로 진행한다.

## #17 / 서버 #92 조건 수정 라운드의 배포 전 게이트

현재는 feature 검증·Draft PR 준비 단계이며 main 병합·운영 배포는 실행하지 않는다. 아래는 후속 배포 검토 계획이다.

| 조합 | 확인된 범위와 남은 제한 |
| --- | --- |
| 새 웹 + 구 서버 | 새 round/capability/context 필드가 없으면 복구 명령을 숨기고 기존 저장 입력·후보·결과를 읽는다. 현재 검증은 기존 타입/소스와 결정적인 legacy mock unit/browser 사례다. 실제 운영 backend 연결 검증으로 주장하지 않는다. |
| 새 웹 + 새 서버 | 실제 서버 생성 OpenAPI와 native 타입 일치, 수정 round/revision 요청, HOST/cohort 권한, 새 분석 ID·조율 버전·본인 context 분리, 중복 요청/실패/미저장 입력/확정 보호를 각각 검증해야 한다. 로컬 mock UI와 서버 PostgreSQL 검증은 별도 근거이며 하나의 실제 browser/backend 통합 성공으로 합쳐 보고하지 않는다. |
| 열린 구 웹 + 새 서버 OPEN 라운드 | 구 웹은 public COLLECTING만 보고 이전 편집·마감·참여 화면을 표시할 수 있다. round/revision 없는 수정 PUT은409이고 기존 close는200 no-op이다. 서버의 데이터·후보 보호와 구 웹의 정상 사용 가능성은 다르다. 양방향 기능 PASS나 구 웹/구 서버로의 rollback 안전을 주장하지 않는다. |

웹 선배포는 새로 방문하는 사용자를 준비시키지만 이미 열린 탭과 캐시된 구 번들을 교체하지 못한다. **배포 게이트는 미완료**다. 오래 열린 클라이언트의 새로고침/업데이트 안내와 운영자가 이를 확인할 절차, 새 서버 OPEN 응답을 받은 정확한 구 번들의 mock 재현을 마련해 검토해야 한다. 서버가409 detail에 업데이트 안내를 제공하는지, 구 클라이언트가 원문을 자동으로 버리거나 새 분석을 반복하지 않는지 실제 구 번들로 확인한다. 현재 클라이언트에는 강제 업데이트나 최소 버전 협상 API가 없어 교체 보장을 추정하지 않는다.

게이트가 해소되고 별도 배포 승인을 받은 뒤 웹 선배포 → 실제 웹 자산 SHA/legacy fallback 목 검증 → 서버 배포 순서를 검토한다. 운영 smoke는 공개 HTML/JS/CSS와 SPA 경로를 읽기 전용 GET으로 확인하고, 탐색 전에 모든 API를 합성 응답으로 차단·대체한다. 생성·참여·원문 저장·라운드 열기·분석·확정 등 운영 데이터 쓰기, 실제 참가자 쿠키/원문, Gemini 호출은 포함하지 않는다. 실제 운영 기능 통합 또는 실기기 Safari 검증의 대용으로 보고하지 않는다.
