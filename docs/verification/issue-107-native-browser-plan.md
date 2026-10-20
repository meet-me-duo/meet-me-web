# #107 격리 실제 backend/browser — 독립 시나리오 준비

2026-10-17 UTC. **최종 실행 12/12 PASS.** 상세 실행 증거는 `issue-107-native-browser.json`이다. 단위/브라우저 합성 transport와 별도로 실제 HTTP·DB·proof를 검증했다. 아래 표는 고정된 독립 oracle이다.

## 실행 경계

- 실제 Spring HTTP·PostgreSQL·Redis·RS256 검증·로컬 OIDC/JWKS 공급자 대역, 실제 `/participants`·`/guest-records/reaccess`·HttpOnly proof cookie를 사용한다. 공급자의 의미 응답과 실행 barrier만 합성이다.
- 기존 `AuthEndToEndPostgresTest`·`OperatorNativeBrowserServer`의 loopback 검증을 재사용한다. 운영 보안 필터/소유권 resolver를 우회하거나 브라우저에 임의 사용자 헤더·가짜 토큰을 넣지 않는다. 실제 로그인 대역에서 발급한 토큰은 메모리에만 보관한다.
- 제안 포트는 API `localhost:18920`, 웹 `localhost:18921`, 별도 test-only control `localhost:18922`다. 실제 확정 포트/실행 명령은 harness 담당자가 전달한다. 모든 주소가 loopback인지 먼저 확인하고 외부 브라우저 요청은 차단·계수한다. 운영·실제 OAuth·유료 모델 요청은 0이어야 한다.
- test-only control은 fixture 인증 마커/실제 API·웹 origin을 반환하는 health, rooms-only reset, 합성 provider verdict/barrier, worker `runOne`, barrier release, 실제 `DeadlineClosureScheduler.closeDueRooms()` 1회 실행, 안전한 합성 DB 상태 확인만 제공한다. 마감 시각 경과는 즉시 쓰기를 거부하고, 물리적 방 마감은 실제 scheduler tick에서 이루어지므로 두 경계를 구분한다. 운영 API 경로에 추가하지 않는다. 브라우저 API route 응답 대체는 0이다.
- native 스크립트는 실패 시 단계·고정 오류 코드만 기록한다. 응답 본문·token·cookie·OAuth callback URL·인증 헤더를 오류 로그에 출력하지 않는다.

## 공개 행동별 시나리오

| 순서 | 실제 실행 | 독립 oracle |
| --- | --- | --- |
| N01 | 실제 로컬 Google 로그인 → 격리 fixture 방 준비 → 별도 브라우저 guest 이름/암호 참여 → 원문 제출, worker 미실행 | POST202, 원문 PG 보존·candidate revision1, accepted 없음·완료 false. 같은 카드 loading, 명확한 마감 경고. 완료·다른 참여자 대기 오표시0. 방 생성 UI 자체는 이 검사의 범위가 아님 |
| N02 | 합성 NEEDS_CHOICE를 worker 게시 → A/B 클릭 → 전체 수정본 확인 → 명시 확정 → 재검사 CLEAR | 질문/선택지는 본인만 조회. 첫 선택만으로 POST0, 확정 후 answer202·새 immutable candidate1개, 재검사 중 미완료. CLEAR 후 정확 accepted와 UI 완료 일치 |
| N03 | 다른 모호 입력 → 직접 수정 → 전체 새 원문 명시 제출 → CLEAR | 사용자 입력 그대로 새 revision, 자동 치환0. 기존 원문/새 입력 계보 보존. 합성 CLEAR를 실제 모델 정확도 증거로 기록하지 않음 |
| N04 | `주말 아무 때나 가능` → 합성 CLEAR | 입력 범위 그대로 accepted, 불필요 질문0. 이 시나리오는 브라우저의 범위 축소/추가 질문을 검증하며 모델 의미 판정을 평가하지 않음 |
| N05 | 최초 입력의 provider barrier 진입 → HOST 실제 수동 마감 또는 deadline 경과·쓰기409·실제 scheduler 1회 실행 → barrier release | 마감 즉시 완료, 최초 미확인 accepted 없음·이번 결과 미반영, 지연 CLEAR가 accepted/frozen batch를 바꾸지 않음. 새 answer/retry/start 거부. 두 명 미만이면 부족 상태 |
| N06 | 참여자 두 명 실제 CLEAR → 한 명 새 수정과 다른 최초 입력 pending → HOST 마감 → 지연 응답 release | frozen batch는 두 기존 accepted만 포함. 수정자는 이전 완료본 적용·최신 수정 미반영을 구분, 최초 미확인자는 미반영. 원문·횟수·동결 상태를 안전한 test-control DB 확인과 실제 private GET으로 대조 |
| N07 | 보호 원문을 원래 guest 세션으로 조회, 별도 브라우저 정답/오답 암호로 재접근 | 실제 VERIFIED만 본인 check/질문 접근, 오답 오류의 타인 원문/질문/답변0. HOST/같은 이름/초대 링크만으로 본인 조회 권한 획득0 |
| N08 | 무암호 기록에 다른 브라우저 REPLACE_ONLY → blind 대체 | 본인 검사 GET403, 원문/질문/답변0, UI 본인 질문 GET0. blind 대체는 저장·확인 뒤 반영 가능성 안내만 제공하고 완료/권한 승격0. 실제 proof cookie에 HttpOnly 확인 |
| N09 | 유효 guest proof cookie + invalid Bearer의 실제 GET/명령 | guest fallback 없이401. 응답에 원문/질문/답변/타인 성공 outcome0 |
| N10 | guest의 질문 표시/작업 대기 중 같은 브라우저 실제 계정 로그인·로그아웃 | auth epoch 뒤 옛 원문·질문·답변·query cache가 화면에 복구되지 않음. 계정 우선 소유권을 실제 GET으로 확인. delayed JSON decode 자체는 독립 단위/FI 증거로 별도 유지 |
| N11 | 새로고침 및 두 탭 같은 expected revision 제출 | reload GET만으로 복원·자동 POST0. 새 candidate는 하나, 패자409·로컬 초안 보존·명시 충돌 안내. 다른 탭 원문이 늦은 응답으로 덮이지 않음 |

## 준비물과 완료 기록

필요한 서버 공개 빈은 `PreSubmissionCheckWorker.runOne()`과 합성 `PreSubmissionCheckProvider`다. 독립 서버 `PreSubmissionCheckWorkerPostgresTest`의 actual RSA/proof·AtomicReference verdict·CountDownLatch 패턴을 소비한다. DB·OIDC·control은 매 실행마다 격리하고 정리한다. rooms-only reset은 로그인 account/session을 보존하거나 새 로그인 흐름을 명시한다.

실행 기록에는 source SHA/dirty fingerprint, 빌드 artifact digest, 서버 실행 설정의 비밀 아닌 범위, 실제 API status·시나리오 통과/실패, provider call 수, 외부 요청/route mock 수, 미검증 경계를 남긴다. 합성 usage의 비용·지연을 실모델 p50/p95나 정확도로 보고하지 않는다. 네 기능 최종 결합·마이그레이션·backend 전체 gate는 부모 최종 검증과 연결한다.

## native 초회 진단

최종 production 스냅샷의 첫 실행에서 N01~04, N11, N05 수동 마감까지 6 checks가 통과했다. deadline 시각 경과·쓰기409 뒤 physical CLOSED를 즉시 기대한 하네스는 실제 60초 scheduler가 비활성인 격리 fixture에서 실패했다. 제품 결함으로 집계하지 않는다. 실제 `DeadlineClosureScheduler.closeDueRooms()`를 별도 control `/room/run-deadline-closure`로 한 번 실행한 뒤 동일 CLOSED/frozen oracle을 유지한다. 상태를 CLOSED로 SQL 변조하지 않는다. 원본 실패는 로컬 `.codex/tdd-evidence/issue-107-native-browser-final-first-failure.{json,log}`에 보존한다.

## 최종 실행 결과

2026-10-17T19:26:14.757Z 실제 Spring/PG/Redis/RS256·로컬 OIDC/JWKS·실제 guest proof 경로에서 **12/12 PASS**. N05 수동/시각 마감을 별도 검사했다. source7/runtime manifest/native asset digest가 실행 전후 같았다. API routeMocks0, 외부 요청0, 실제 모델0, 외부 OAuth 공급자0, 운영 접근0. runtime manifest SHA256 `03bb749dad1461b5096a17c7a6bc0dd76bb4fbd437bfb176ac75d7ce044ce9a0`. 질문 판정은 합성 provider이며 모델 오탐·미탐·비용·지연을 평가하지 않았다.

서버 최종 포맷 정리로 source/runtime 지문이 바뀐 뒤 동일 스크립트·동일 기대값으로 다시 **12/12 PASS**했다. 이전 PASS는 `issue-107-native-browser-before-final-format.json`에 보존했다. 웹의 기존 전체 gate는 구현 담당이 별도로 unit620 PASS 및 browser426 중425 PASS·기존skip1·실패/retry0으로 확인했으며 신규67/22는 그 안에 포함되어 중복 합산하지 않는다.
