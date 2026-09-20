# 브랜치와 배포 흐름

## 기본 원칙

- `main`은 항상 배포 가능한 상태로 유지한다.
- 장기 유지 브랜치인 `develop`은 두지 않는다.
- 모든 변경은 짧게 유지하는 `feature/*` 브랜치에서 작업한 뒤 Pull Request로 `main`에 병합한다.
- 현재는 별도의 프론트엔드 스테이징 환경을 운영하지 않는다.

이 방식은 소규모 팀의 불필요한 병합 단계를 줄이면서도 PR과 CI로 운영 브랜치를 보호하기 위한 결정이다.

## 작업 흐름

1. 최신 `main`에서 작업 브랜치를 만든다.

   ```powershell
   git switch main
   git pull --ff-only
   git switch -c feature/<topic>
   ```

2. 로컬에서 변경 사항을 구현하고 관련 검사를 실행한다.

   ```powershell
   corepack pnpm api:check
   corepack pnpm lint
   corepack pnpm typecheck
   corepack pnpm test
   corepack pnpm build
   corepack pnpm test:e2e
   ```

3. 브랜치를 원격에 올리고 `main`을 대상으로 Pull Request를 만든다.

   ```powershell
   git push -u origin feature/<topic>
   ```

4. 필수 CI 작업인 `verify`가 성공하고 대화가 정리된 뒤 병합한다.
5. 병합 후 더 이상 필요하지 않은 feature 브랜치는 삭제한다.

## `main` 보호 규칙

`main`에는 다음 보호 규칙을 적용한다.

- 직접 푸시하지 않고 Pull Request를 통해서만 변경한다.
- 브랜치는 최신 `main`을 반영한 상태여야 한다.
- GitHub Actions의 `verify` 작업을 반드시 통과해야 한다.
- 강제 푸시와 브랜치 삭제를 허용하지 않는다.
- 현재는 필수 승인자 수를 `0`으로 둔다. 리뷰는 권장하지만 2인 팀의 단독 작업을 막지는 않는다.

팀 규모나 변경 위험이 커지면 필수 승인자를 1명 이상으로 조정한다.

## 배포

`main`에 변경이 들어오면 CI와 운영 배포 워크플로가 실행된다. 운영 배포 대상은 `https://app.meet-me.co.kr`이며, 실제 배포 승인은 GitHub의 `production` Environment 정책을 따른다.

feature 브랜치에서는 운영 배포가 실행되지 않는다.

## 스테이징 환경을 두지 않는 이유

현재는 개발 인원이 적고 로컬 확인과 PR CI만으로 변경을 검증할 수 있으므로 별도의 프론트엔드 스테이징 환경을 유지하지 않는다. 프론트엔드만 복제하고 운영 API에 연결한 환경은 운영 데이터를 변경할 위험이 있으며, 완전한 통합 스테이징으로 보기 어렵다.

다만 로컬과 운영은 다음 조건에서 차이가 날 수 있으므로 배포 후 기본 동작을 확인한다.

- 운영 환경변수와 API 주소
- HTTPS, 쿠키와 CORS
- CloudFront 캐시와 SPA 직접 진입
- 실제 모바일 기기 동작

다음 요구가 생기면 프론트엔드와 백엔드를 함께 포함하는 스테이징 환경 도입을 다시 검토한다.

- 비개발자가 배포 전 URL로 검수해야 하는 경우
- 프론트엔드와 백엔드 변경을 함께 통합 테스트해야 하는 경우
- 운영 배포의 빈도나 장애 위험이 커진 경우
- 로컬에서 재현되지 않는 쿠키, CORS 또는 캐시 문제가 반복되는 경우
