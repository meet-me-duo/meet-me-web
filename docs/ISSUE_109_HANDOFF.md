# 서버 #109 연결 웹 인계

로컬 웹 구현·검증 완료. 실제 Google/Kakao 공급자 로그인과 운영 활성화는 미검증이다. 기존 프로젝트·앱 설정과 실제 runtime secret 입력은 별도 사용자 작업이며 이 세션에서 비밀값을 읽거나 출력하지 않았다.

## 기준과 동작

- 깨끗한 최신 원격 main `9b183978d5987f8fa8a5f02d542b17181e4929b4`에서 local `feature/issue-109-account-archive`를 만들었다. 웹에는 develop이 없으며 고유 branching 지침을 따랐다. 서버 기준은 develop `3232128bb1d0886c987e378a787633bd2aee6341`이다.
- Google/Kakao 로그인, 로그인 필수 방 생성, 계정 프로필 이름 사용, 일반 게스트 참여, 명시적 게스트 기록 연결과409충돌, 본인 HOST 방 아카이브 및30일 정리 예정 시각을 제공한다. 기존 게스트 HOST는 로그인·명시 연결 전까지 HOST 명령을 제공하지 않는다.
- Access/계정은 메모리에만 두며 HttpOnly/Secure Refresh cookie를 사용한다. exact-Origin 검증·회전·기기별/전체 로그아웃은 서버 계약이다. Refresh/logout은 지원 브라우저의 Web Locks로 탭 간 직렬화한다. 미지원 환경의 보장은 탭 내부 singleflight다.
- 만료 계정은 API 요청 전에 인증 오류로 중단하여 게스트 cookie로 우회하지 않는다. 계정 경계 변경 때 cache와 화면 상태를 비우며 이전 계정의 늦은 fetch/JSON decode와 Refresh 응답을 차단한다. API는 cache no-store, mutation 자동 재시도 없음이다.
- 이름·이메일·초대 링크만으로 자동 연결하지 않는다. claim은 사용자 클릭과 서버의 계정+유효한 강한 게스트 소유 증명을 요구한다. #108의 실제 선택 암호 adapter 결합은 원래 #108 세션의 통합 범위다.
- 생성 요청에서 서버가 무시하는 legacy `host_display_name`을 생략한다. 긴 정상 Unicode 계정 이름이 해당 구 필드의 UTF16 검증으로 거부되지 않게 하며 실제 HOST 이름은 서버의 검증된 계정에서만 결정한다.

## 최종 검증

| 검증 | 결과 |
| --- | --- |
| 전체 단위 테스트 | 29파일364개 통과 |
| 타입·ESLint·production build·api:check | 모두 통과 |
| 최종 production bundle browser | 384 scheduled 중383통과·기존 의도적 skip1·실패/재시도0 |
| 실제 격리 Spring/PostgreSQL18/Redis8/OIDC/JWKS native browser | 12개 통과·API route mock0·외부 요청0 |
| 최종 runtime bundle | `index-By9lmPRX.js`; 검증 전후 source/config/schema/fixture/dist SHA 불변 |
| 서버 생성 OpenAPI | 23paths, SHA256 `924b0683f5f48de3fe3fd3d1d130c6212a511912db31b284f9e697ba840fd19e` |

독립 테스트 설계·frozen RED/GREEN·결함 주입/정확 복구·교차 검토는 `.tdd`에 보존했다. 최초 ClaimConflict typed fixture의 무효 RED는 이력에 남기고 수정 후 독립 회귀 GREEN으로 구분한다. Unicode 이름의 기존 직렬화 기대값3곳은 서버의 계정 권한 계약에 맞춰 명시적으로 supersede했으며 trim·1~50 Unicode codepoint 검증은 유지했다. 로그와 테스트 임시 credential은 커밋하지 않는다.

최종 source/dist 및 실행 증거는 [최종 manifest](verification/issue-109-web-final-manifest.json), [E2E](verification/issue-109-e2e-account-fixtures.json), [native](verification/issue-109-native.json), [native provenance](verification/issue-109-native-provenance.json)에 있다. 브라우저는 Chromium 데스크톱/모바일 emulation이며 실제 운영 공급자 성공을 뜻하지 않는다.

## 실행과 원격 경계

lockfile 기준 설치 후 `corepack pnpm api:check`, `lint`, `typecheck`, `test`, `build`, `test:e2e`로 재현한다. 명세 갱신은 격리 서버를 지정한 `OPENAPI_URL=http://localhost:8080/v3/api-docs corepack pnpm api:snapshot`을 사용한다. Native는 서버의 테스트 main `AuthEndToEndPostgresTestKt`와 localhost5173 웹을 띄우고 `node scripts/verify-account-native.mjs`를 실행한다. 이 스크립트는 실제 공급자 endpoint를 거부한다.

사용자의 후속 명시 승인에 따라 독립 리뷰 통과 후 commit·feature push·Draft PR·정확 head CI 확인을 진행한다. 기존 workflow는 feature/PR에서 운영 deploy를 실행하지 않는다. merge/auto-merge/main배포/운영DB/Secret 변경은 승인 범위 밖이다. 원격 commit/PR/CI 결과는 Git 이력과 최종 인계 receipt를 기준으로 한다. 전체 목표는 서버#109에 연결하며, 내장 goal API가 없어 파일로 기록했다.
