# #107 × #109 별도 웹 통합 검토

검토 기준은 #109 `95f09c0a98c6538b0f19ed381fdf11a2f5b844d9`에 #107 `de82a7dd84002d76ac5d0a97cf2c4b1a629b1fc0`을 commit 없이 적용한 `/workspace/meet-me-web-107-integration`이다. 게시된 원본 branch와 소스는 변경하지 않았다. 새 commit·push·PR·운영/AI 호출은 수행하지 않았다. 상세 설계는 `/workspace/shared/issue107/web-auth-integration-design.md`에 있다.

## 인증 경계와 충돌 검토

부모가 client의 단일 충돌을 해결해 #109 공통 request와 #107 질문 GET/답변 POST를 함께 보존했다. 공통 `request<T>` 본문, `App.tsx`, `session.ts`, `AccountBoundary.tsx`, `authCookieLock.ts`가 #109 원본과 동일함을 bytes/string으로 대조했다. 별도 token supplier나 익명 fallback을 추가하지 않았다. 신규 두 메서드는 현재 Bearer·쿠키·no-store·locale·Access 만료 거부·fetch/JSON 뒤 계정 epoch 검사를 동일 경로에서 받는다.

계정 전환의 App subtree/cache 경계, 본인 room/viewer cache 경계, question/source/round별 폼 경계를 함께 유지한다. 같은 계정의 토큰 회전은 draft와 동일 작업 UUID를 유지하고 다음 요청만 새 토큰을 사용한다. 계정 변경은 이전 답변·원문·지연 응답을 새 계정으로 옮기지 않는다.

CSS 충돌은 양쪽 additive selector를 그대로 합쳤다. OpenAPI/schema는 어느 branch의 snapshot을 택하지 않았다. 부모가 실제 통합 서버에서 export한 57,137-byte native 명세 SHA-256 `ccb1da582cbdc8bd5fc2d7f3ee400f2a1a09993c06a6a1ebb0505d5315cd24be`를 정확 복사하고 타입을 생성했다. native 25 paths는 게시된 #109 23 paths와 #107 17 paths의 정확한 합집합이다. #110 PR #26 snapshot은 통합하지 않았다. 정적 대조는 `issue-107-web-auth-source-review.json`에 있다.

## 독립 테스트와 fixture 이관

신규 HTTP 28개는 #107 원본 client에서 18 실패/10 통과의 유효 RED를 확보했다. 최초 runtime-only 실행의 dynamic ApiError 타입 표기 문제는 strict typecheck로 발견해 무효로 보존했고, 타입만 수정한 뒤 strict typecheck 통과와 RED를 다시 확보했다. real session expiry 경계는 실제 #109 session 모듈과 합성 clock/transport를 사용했다.

App 수준 real-session 7개는 #107 원본 App에서 계정 subtree 경계 부재를 4 실패/3 통과로 검출했다. 해당 App과 schema를 임시 대입한 뒤 바이트를 정확 복원했고, 실제 #109 App + 통합 client에서는 신규 35개가 모두 통과했다. A→B에서 동일 room/name/role/viewer hint여도 draft/cache를 폐기하고, 이전 POST 200/403이 B를 오염시키지 않으며, 같은 계정 토큰 회전·재시도 UUID·guest MEMBER·guest HOST 로그인 gate·명시 claim·지원 marker를 검사한다. 추가 UI production 수정은 필요하지 않았다. 원본 로그·고정 SHA·유효/무효 RED 구분은 `issue-107-web-auth-integration.json`에 있다.

#109는 HOST 로그인 요건을 추가한다. 기존 #107 HOST room fixture는 익명이어서 새 계약과 충돌했다. 동일 독립 작성자가 별도 통합 복사본의 RoomPage 9개/시간 안내 12개에 기존 #109 `mockRoomAccount(snapshot)` 준비만 추가하고, 새 E2E fixture에 `fulfillAccountRefresh`만 연결했다. 모든 assertion과 기존 시나리오 data는 유지했고, 이 추가를 역치환하면 게시 원본 bytes와 같음을 검사했다. 게시 원본 테스트는 변경하지 않았다. 원본/통합 SHA와 사유는 `issue-107-web-auth-fixture-migration.json`에 있다. 이 hook/refresh scaffold는 실제 인증 증거로 보지 않으며, 신규 real-session HTTP/App 35개가 별도 경계를 담당한다.

## 현재 검증 결과

| 범위 | 결과 | 원본 근거 |
| --- | --- | --- |
| 기존 #107 67 + 신규 통합 35 집중 사례 | 102/102 통과 | `/tmp/issue107-web-integration-focused102.log` |
| Native snapshot와 생성 타입 일치 | 통과 | `/tmp/issue107-web-auth-api-check.log` |
| 전체 TypeScript | exit 0 | `/tmp/issue107-web-auth-typecheck.log` |
| 전체 ESLint | exit 0, warning 0 | `/tmp/issue107-web-auth-lint-final.log` |
| 전체 단위 | 37개 파일, 466/466 통과 | `/tmp/issue107-web-auth-full-unit.log` |
| Production build | 성공, JS 511.65 kB chunk 권고 유지 | `/tmp/issue107-web-auth-build.log` |
| 최종 고정 bundle 전체 브라우저 | 391 통과 / 기존 의도적 skip 1, exit 0, 5.9분 | `/tmp/issue107-web-auth-full-browser-final.log` |

브라우저는 게시 원본의 4173 서버를 재사용하지 않는다. 별도 worktree dist를 127.0.0.1:4175에 띄우고 Chromium desktop/mobile, workers 2, retries 0으로 실행한다. source/test/config/schema 93개와 dist 4개의 실행 전후 SHA-256이 모두 동일했다. 원본 worktree의 HEAD de82와 clean 상태도 다시 확인했다. 상세 게이트·원시 로그 SHA·지문은 `issue-107-web-auth-final-gate.json` 및 `/tmp/issue107-web-auth-hash-verification.json`에 있다. 기존 두 branch의 단독 통과 수치를 통합 통과로 합산하지 않는다.

첫 전체 브라우저 실행에서는 기존 host-creation fixture가 4173 origin을 고정해 별도 4175 서버의 navigation 6개를 차단했다. 이 실행은 중단했으며 200 통과/6 실패/2 중단/1 skip/183 미실행, exit 130 그대로 보존했다(`/tmp/issue107-web-auth-browser-initial-origin-failure.log`). 부모 동의로 통합 복사본의 fixture만 baseURL에서 정확한 허용 origin과 clipboard URL을 얻도록 바꿨고, 외부 origin 차단과 제품 assertion은 유지했다. 해당 desktop/mobile 12개 재실행은 모두 통과했다(`/tmp/issue107-web-auth-browser-origin-corrected.log`). 이 부분 재실행을 전체 통과로 표현하지 않는다. product source와 build bytes는 바뀌지 않았다.

## 한계와 최종 판단

브라우저 API와 auth refresh는 합성 route이고, 신규 App/session unit 역시 HTTP transport만 합성한다. 실제 token verifier, HttpOnly cookie·CORS·DB 소유권·서버 transaction과 Google/Kakao 운영 공급자 성공을 증명하지 않는다. 부모는 실제 격리 서버 source에서 native export 1개와 실제 account 소유권 7개 GREEN을 보고했다. 이 보고와 웹 synthetic 경계의 증거를 구분한다. 결합된 브라우저가 실제 통합 서버를 호출한 native E2E는 여기서 실행하지 않았다. 서버 Gradle도 실행하지 않았다.

최종 통합 source에서 API/type/lint/build, 단위 466개, 고정 bundle 브라우저 391개와 기존 의도적 skip 1개를 확인했다. 초기 중단 실행·선택 12개 재검증·최종 전체 실행을 서로 대체하지 않고 보존했다. 현재 정적 통합 검토와 독립 35개에서 추가 차단 결함은 발견하지 못했다.

이 위임 단계에서는 통합 source에 대한 새 결함 주입은 실행하지 않았다. 기존 게시 source의 #107 component FI와 #109 auth 검증은 별도 증거이며 현재 통합 native 브라우저나 통합 FI의 완료를 뜻하지 않는다. 로컬 통합은 commit하지 않았고 HEAD는 #109 고정 SHA를 유지한다.

## 부모의 최종 통합 소스 결함 주입 보강

초기 설계자 인계 후 구현자가 동결35개 테스트로 실제 통합 `client.ts`에 두 경계 결함을 순차 주입했다. Bearer 생략과 새 계정 epoch 수용을 각각 행동 assertion 실패로 탐지했으며 import/설정 오류는 없었다. 각 실행 후 source를 정확 복원하고 source·test·고정 dist 지문 불변, 복원35/35 GREEN을 확인했다. `issue-107-web-auth-faults.json`이 최신 근거이며 초기 '이번 통합 FI 미실행' 메모는 이 보강 이전 상태다. 소스·테스트 기대값·browser bundle은 최종 전체466/391 검증 때와 동일하다.
