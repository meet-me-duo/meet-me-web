# #22 / JIN-71 독립 리뷰와 로컬 검증

2026-10-15 UTC. 로컬 브랜치 `feature/22-host-input-after-creation`과 서버 `feature/22-host-input-contract-tests`의 미커밋 변경이다. commit/push/PR/merge/배포/운영 데이터/보안 설정 변경은 수행하지 않았다. 원격 기준과 수치·원시 로그 경로는 [구조화 증거](issue-22-local.json)에 기록한다.

위 문장은 로컬 검증 완료 시점의 기록이다. 이후 사용자 2026-10-15 10:30 KST 승인으로 같은 검증 소스의 commit/push/PR·원격 CI 확인을 진행한다. 실제 게시 SHA·CI 결과는 각 PR 본문과 Linear JIN-71에서 확인하며 merge·배포·운영/보안 변경은 승인 범위에 포함하지 않는다. 서버 보조 [이슈111](https://github.com/meet-me-duo/meet-me-server/issues/111)은 같은 웹22/JIN-71의 테스트만 추적한다.

## 독립 검토와 수정

구현자와 별개의 `review_contract`, `review_web` 에이전트가 소스·diff·테스트 기대·SHA 및 실제 XML/원시 로그를 읽기 전용으로 검토했다. 리뷰어는 코드 수정이나 테스트 재실행을 하지 않았다. 서버 리뷰는 제품 코드가 배포 기준 `91eb2505ddf6b4db549a5bc2b8b07f11e514d0b0`과 같고 DB 제약과 기존 권한·마감·추천·재분석 검사가 실행됐음을 대조했다. 웹 리뷰는 독립 수용 기준을 제시하고 보완 후 최종 8개 파일 SHA를 직접 재계산했다.

최종 소스/테스트/API 8개 지문 묶음은 `ecea54680f84953585bc7e3366f562f3d1feb15666ca62304c22bc1091649953`이다. 최종 독립 검토에서 이 변경의 추가 필수 수정은 없다. 아래 기존 서버 위험이 해소됐다는 의미는 아니다.

| 필수 발견 | 반영 및 검증 |
| --- | --- |
| 최초 HOST 임시 입력이 마감 전환 때 사라짐 | 최초 입력도 메모리 draft 경계에 포함. 읽기 전용·원문 공백 보존, 자동 PUT 없음, 새로고침/방 이동/viewer 변경/접근 거부 후 삭제를 검증. |
| 응답 유실을 생성/저장 실패로 단정 | 네트워크·5xx·408은 결과 미확인으로 표시. 생성 재시도 중복 방 가능성과 기존 방 저장 확인/재시도를 구분. 알려진 4xx 거부와 별도 검증. |
| 저장 응답 유실 후에도 HOST 미제출을 단정 | 저장 시도 이후 미제출 확정 안내를 숨김. 오류·재시도 진행 중·복구 후 상태를 검증. |
| 본인 GET이 저장을 확인한 뒤에도 미확인 오류가 남음 | GET 원문이 시도한 저장 원문과 같을 때만 오류 해소. 추가 PUT 없이 복구하며 이후 입력한 draft는 유지. GET 404/503은 확인으로 취급하지 않음. |

리뷰 수용 테스트 26개는 첫 구현의 정확한 SHA 스냅샷에서 19 RED/기존 7 GREEN, 수정 후 26 GREEN이었다. 초기 기능 테스트 5개는 원격 baseline에서 3 RED/기존 2 GREEN이었다. 고의 결함은 초기 기능 4종과 리뷰 보완 5종 모두 assertion으로 탐지했고, 최종 바이트 복원 후 GREEN을 확인했다. 실제 remount 시 draft 삭제, 401/403/404 후 재접근 복구, 408도 최종 수용 기준에 포함한다. 상세 로그와 fault 결과는 JSON을 따른다.

## 남은 기존 계약 불일치와 적용 선택지

**P2: 데드라인 도달 후 scheduler 마감 전의 제출 접수 가능성.** 서버 [PRD Rule 4](/workspace/meet-me-server/docs/PRD.md:273)는 데드라인 도달 전까지만 수정을 허용한다. 기존 [SubmissionService](/workspace/meet-me-server/src/main/kotlin/com/meetme/server/submission/application/service/SubmissionService.kt:46)는 `CLOSED`를 검사하고, 저장 후 자동 마감은 예상 인원 충족일 때만 수행한다. [DeadlineClosureScheduler](/workspace/meet-me-server/src/main/kotlin/com/meetme/server/meetingroom/application/service/DeadlineClosureScheduler.kt:18)는 기본 60초 간격으로 마감한다. 따라서 시간은 지났지만 아직 `OPEN`인 구간에서 PUT이 접수될 수 있다. 이번 변경 전부터 있는 PRD와 구현의 불일치이며 새 정책의 공백으로 취급하지 않는다.

신규 시간 마감 회귀는 합성 DB의 시간을 지난 뒤 scheduler를 직접 실행하여 HOST 미제출 0·1·2명 결과와 **CLOSED 이후** 거부를 확인한다. 실제 시각 경계에서 scheduler 실행 전 PUT의 거부를 입증하지 않는다. 웹 mock의 마감 회귀도 실제 서버의 이 경합을 검증하지 않는다.

선택지는 (1) 이번 로컬 웹 분리와 테스트만 유지하고 기존 위험을 후속 서버 수정으로 명시하거나, (2) 원격 반영 전에 별도 서버 범위로 기존 PRD의 시간 경계를 원자적으로 강제하고 격리 DB·동시성 TDD를 추가하는 것이다. 이번 단계에서는 제품 서버 코드를 바꾸거나 임의의 유예 정책을 만들지 않았다. 원격 반영 자체는 아직 승인 범위 밖이다.

추가 제한: 생성 POST의 성공 응답을 잃었을 때 기존 API에는 멱등 재생 키가 없다. 진행 중 클릭 잠금과 성공 응답 캐시는 검증했으나 새로고침/재요청 전체에 걸친 중복 방 방지를 주장하지 않는다. 응답 유실 안내는 이 한계를 정확히 표시한다. 실제 backend와 브라우저를 연결한 종단 흐름, HTTPS cookie/CORS, 실기기, 유료 모델·운영 검증은 별도다.

## 서버 기존 skip 4개

전체 XML과 현재 소스·기준 소스 SHA를 대조했다. 아래 소스는 모두 변경 전과 동일하고 opt-in 조건이 충족되지 않았다. 신규 9개는 모두 실제 실행됐으며 새 skip은 없다.

| 클래스 · 테스트 | 실행하지 않은 이유 |
| --- | --- |
| `CandidateScenarioLiveProbeTest` · `bounded live Gemini semantic probe()` | `MEETME_CANDIDATE_LIVE_PROBE=true` assumption 불충족. API key 읽기 전에 종료. 실제 유료 Gemini 호출은 이번 로컬 범위 밖. |
| `Issue92OpenApiExportIntegrationTest` · `verify correction public schemas then export actual native OpenAPI JSON()` | 클래스 opt-in `MEETME_ISSUE92_EXPORT_OPENAPI=true` 불충족. 선택적 correction schema 검사와 native OpenAPI export 미실행. |
| `CorrectionRoundRequestPresencePostgresTest` · `capture actual native schema for debugging explicitly marked unvalidated()` | 메서드 opt-in `MEETME_ISSUE92_CAPTURE_OPENAPI=true` 불충족. 검증용이 아닌 debug schema capture 미생성. |
| `Issue83OpenApiExportIntegrationTest` · `export actual generated OpenAPI JSON after Issue 83 GREEN()` | 클래스 opt-in `MEETME_ISSUE83_EXPORT_OPENAPI=true` 불충족. 선택적 GREEN 이후 native OpenAPI export 미실행. |

별도 실제 OpenAPI/schema 검사 6개는 통과했다. 이것이 위 skip의 모든 assertion을 대신한다는 주장은 하지 않는다. 이번 작업은 서버 API와 웹 OpenAPI/생성 타입을 변경하지 않는다.

## 최종 검증

| 검증 | 실제 결과 |
| --- | --- |
| 웹 API 생성 정합 · lint · build(타입 검사 포함) | PASS |
| 웹 전체 단위 | 18파일 / 308 PASS |
| 리뷰 수용 단위 | 26 PASS (전체308에 포함) |
| 집중 mock browser desktop/mobile | 12 PASS |
| 전체 mock browser desktop/mobile | 383 PASS / 기존 skip1 / 실패0 / flaky0 / retries0 |
| 서버 격리 PostgreSQL 대상 | 32 PASS, 신규9 포함 |
| 서버 전체 `ktlintCheck assemble test` | 111suite / 659 PASS / 기존 skip4 / 실패0 / 오류0 |

브라우저 skip1은 기존 `mobile layout keeps primary action inside viewport`의 desktop 프로젝트 제외다(`e2e/landing.spec.ts:38`). 모바일 실행은 통과했다. 전체 browser는 고정 빌드로 4.8분 실행했고, 종료 후 소스8파일과 dist SHA를 대조했다. 로컬 Chromium 경로만 지정한 임시 Playwright 설정은 증거 폴더에 보관한 뒤 저장소에서 제거했다. 기존 CI·의존성·설정은 바꾸지 않았다.

최종 실행 결과와 고정 빌드 지문은 [구조화 증거](issue-22-local.json)의 `checks`와 `fixed_build_sha256`를 따른다. 서버 테스트/제품 바이트는 기존 전체 gate 이후 동일하여 재실행하지 않았으며, 서버 659 PASS/기존 skip 4를 새 실행으로 중복 집계하지 않았다. 웹 검사는 독립 리뷰의 수정이 반영된 최종 소스에서 다시 실행했다.
