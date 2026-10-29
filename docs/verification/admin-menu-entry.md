# 서버 capability 기반 어드민 진입점 검토 (2026-10-29)

기준 main: `476b2e7a6d556b28f8ae47d34a253555d08c86fb`.
별도 브랜치: `feature/admin-menu-entry`. 최신 main의 모바일 변경을 기준에 반영했으며 이 PR의 차이는 어드민 진입점뿐이다. 사용자가 develop→main 후속 반영을 승인했고 게시·CI·배포 결과는 해당 PR에 기록한다.

## 기대 계약과 표시

서버 담당이 확정한 커밋 `2fac654e4d308e04cdfdfd58b29dc9049dd7d23f`의 계약은 GET `/api/auth/me` 최상위 `capabilities.canViewOperations`, POST `/api/auth/refresh`의 `account.capabilities.canViewOperations` boolean이다. 이 위치와 웹 타입·가시성 조건·합성 응답을 대조했다. 서버 담당 검증 결과는 ktlintCheck/assemble/test 성공, 2268 PASS/기존 SKIP 4다. 해당 서버 커밋의 원격/운영 반영은 웹의 검증과 별개다.

웹은 계정의 `capabilities?.canViewOperations === true`일 때만 계정 메뉴의 로그아웃·계정 보안 다음에 `어드민 페이지` 링크(`/operations`)를 표시한다. 누락·false·null·문자열 true·숫자는 허용으로 해석하지 않는다. 같은 계정의 capability 갱신, 다른 계정으로의 전환, 로그아웃을 현재 메모리 세션 상태에 따라 반영한다.

권한 확인을 위해 운영 목록을 미리 조회하지 않는다. 이메일/계정 수/JWT 내용으로 운영자를 추정하지 않으며 capability를 별도 저장소에 캐시하지 않는다. 실제 운영 API의 기존 인증·인가와 401/403 처리를 그대로 유지한다. 계정 allowlist나 서버 설정을 변경하지 않았다.

## 검증

- 계정 메뉴·세션/복구 단위 테스트 55개 통과. 최종 계정 메뉴 단위 20개 재검증 통과.
- 빌드, lint, 타입 검사 통과.
- 데스크톱/모바일 E2E 6개 통과: capability 누락/false/true, 키보드 진입, 메뉴 닫힘, 운영 데이터 사전 조회 없음, 실제 조회의 403 보존.
- 모든 응답은 합성 fixture이며 실제 계정 로그인이나 운영 모임 데이터 조회를 수행하지 않았다.

기존 서버처럼 capability가 누락된 응답은 정상 로그인으로 유지하면서 링크만 숨긴다. 따라서 서버 배포가 늦어도 권한을 추정하지 않는다. 운영자 활성화나 계정 allowlist 변경 완료를 뜻하지 않으며, 실제 API 인가는 서버가 계속 수행한다.
