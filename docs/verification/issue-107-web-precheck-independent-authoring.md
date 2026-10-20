# #107 제출 전 확인 — 독립 웹 테스트 작성 기록

2026-10-17 UTC. 테스트 작성자는 제품 코드·기존 테스트 기대값·원격 브랜치를 변경하지 않았다. 근거는 승인된 `ISSUE_107_PRE_SUBMIT_DESIGN.md`·TEST_SPEC, 독립 설계 리뷰와 부모가 전달한 D1/D2·수정 라운드·blind 대체의 확정 계약이다. 구현 코드를 기대값의 근거로 사용하지 않았다.

## 공개 oracle과 범위

| 새 테스트 | 수 | 독립 관찰 |
| --- | ---: | --- |
| `src/api/client.precheck.test.ts` | 16 | 명시 UUID/CAS 명령, 비공개 GET, 쿠키/Bearer·no-store, 자동 재시도/guest fallback 없음, JSON decode 뒤 계정 epoch |
| `src/pages/RoomPage.precheck.test.tsx` | 29 | 저장≠완료, 상태별 복원, CLEAR+accepted 완료, 전체 제안 명시 확정, 직접 수정, 취소·실패·조회 오류, 응답 유실, 충돌, 타 계정·마감 경계 |
| `src/pages/RoomPage.precheck-correction.test.tsx` | 3 | 새 protocol이어도 CLOSED+기존 OPEN correction은 기존 round/revision PUT. cohort 외 편집·신규 참여 금지 |
| `src/components/SubmissionCheckPanel.lifecycle.test.tsx` | 7 | GET 복구 뒤 같은 UUID 재전송, 옛 GET 폐기, 로컬 초안 보존·타 탭 충돌 안내, unmount·room 단조·HTTP abort·private error |
| `src/components/GuestParticipation.precheck.test.tsx` | 2 | PRE_SUBMIT blind는 원문 저장·확인 뒤 반영 가능성만 안내하고 READ_OWN을 부여하지 않음. LEGACY 대조 |
| `src/components/SubmissionCheckPanel.draft.test.tsx` | 1 | 이전 accepted가 있어도 미저장 새 초안을 제출 완료로 표시하지 않음 |
| `src/pages/RoomPage.precheck-privacy.test.tsx` | 2 | 신규 protocol 타인 raw=null은 비공개 안내. LEGACY 시간표 안내 보존 |
| `src/components/SubmissionCheckPanel.close.test.tsx` | 1 | 실제 조기 마감 확인 오류 뒤 두 번째 요청이 끝나기까지 중복 마감 잠금 유지 |
| `src/pages/RoomPage.precheck-protocol.test.tsx` | 1 | 미래 protocol JSON을 LEGACY로 낮추지 않고 지원 불일치 안내·본인 조회/쓰기0 |
| `src/components/SubmissionCheckPanel.draft-races.test.tsx` | 3 | 다른 탭 저장 뒤 재편집/새 질문 직접 수정의 초안 보존, 오래된 private snapshot의 확정 미반영 오표시 금지 |
| `src/components/SubmissionCheckPanel.correction-snapshot.test.tsx` | 2 | 명시 `accepted.confirmation_source=LEGACY_CORRECTION`인 적용본을 옛 CLEAR/CLOSED_BEFORE 검사와 혼동하지 않음. revision 역전·같은 원문 대조 |
| `e2e/precheck.spec.ts` | 22 | 고정 빌드의 desktop/mobile 실제 Chromium, same-origin 합성 transport. pending/reload/terminal/명확·넓은 의도/키보드 선택/blind/500자 경계 |

`submission_complete`는 현재 candidate의 확인 완료, `accepted`는 별도의 마지막 확인 완료본이다. 마감 시 최초 미확인은 미반영, 수정 확인 중이면 이전 accepted 사용이라는 승인 정책을 적용했다. 완료 인원은 CLEAR 후 집계하며 AI나 답변 대기로 마감을 연장하지 않는다. 브라우저 테스트는 이 정책의 표시/명령 경계를 확인하며 서버 동시성·DB 원자성을 증명하지 않는다.

마감 후 기존 correction 라운드가 저장한 최신 accepted는 서버의 명시 `confirmation_source=LEGACY_CORRECTION`로 구분한다. 서버가 실제 accepted version 연결로 판정하며 candidate와 accepted의 별도 revision 숫자·텍스트·옛 check status로 추정하지 않는다. 신규 accepted fixture에는 `PRECHECK`를 명시했다. 기존 PRECHECK accepted+실제 pending 수정의 미반영 안내 대조는 그대로 유지했다.

## RED 근거와 보정 이력

- 최초 API16+RoomPage29는 컴파일 후 throw skeleton의 미구현 행동으로 RED였다. correction3 중 두 회귀가 RED, DB-CLOSED guest 대조는 PASS였다. blind2 중 새 protocol 문구는 RED, LEGACY 대조는 PASS였다. 미저장 draft의 무조건 완료 제목은 별도의 유효 chronological RED로 확인했다.
- 이후 공개 DTO의 `check.id`·`question.id`가 UUID임을 대조해 일부 합성 fixture를 보정했다. 동작 기대값은 유지했다. 이 변경으로 원래 API/UI 파일의 RED 지문은 무효이며, 이전 요약은 `issue-107-web-precheck-original-red-withdrawn.json`에 보존했다.
- 뒤이어 승인된 `accepted.confirmation_source` 필드를 기존 fixture에 명시했다. 이 metadata 보정으로 변경된 UI/draft/browser 파일의 지문도 재수집했다. 수정 전 chronological 기록은 과거 지문만의 근거이며 현재 지문의 chronological RED로 재사용하지 않는다.
- 현재 UUID·accepted provenance 유효 파일을 byte-for-byte 복사한 `/tmp/meetme-web-precheck-frozen-skeleton`에서 타입 검사 후 API/card throw skeleton과 새 blind 문구 누락을 재구성했다. **54 요구 실패 + LEGACY 대조 1 PASS**를 수집했다. 이 결과는 구현 후 fixture 보정에 따른 **재구성 skeleton 검증**이며 최초 시간순 TDD RED로 소급하지 않는다. 실제 제품 작업트리는 변경하지 않았다.
- 보충 lifecycle의 첫 타 탭 assert는 React Query observer 알림 전에 실행돼 무효였다. 최신 서버 원문이 표시된 후 검사하도록 동기화하고, 항상 편집기 표시를 강제하는 대신 필요하면 명시적으로 편집기를 다시 열어 초안이 유지되는지 검사했다. 최종 oracle의 사전 chronological RED는 주장하지 않는다. 고정된 해당 oracle은 위 재구성 skeleton과 별도 독립 결함 주입 대상이다.
- 독립 최종 리뷰 후 조기 마감 잠금·미지원 protocol·초안 재편집 두 경합·오래된 개인 snapshot의 확정 미반영 안내를 추가했다. 모두 별도 파일의 chronological RED다. 마감 테스트 최초의 임의 오류 코드 `EARLY_CLOSE_REQUIRED`는 유효 경로가 아니므로 제외하고 실제 공개 `EARLY_CLOSE_CONFIRMATION_REQUIRED`로 재실행했다. protocol 테스트는 모임 제목이 지원 오류 정규식과 우연히 일치하지 않도록 제목 fixture를 보정한 뒤 재실행했다.
- 브라우저 초기 test timeout은 RED에서 제외했다. 이후 명시 visibility assertion을 사용했다. 정상 빌드 초회 21/22에서 첫 페이지의 1초 대기가 짧아 실패한 건도 제품 결함으로 집계하지 않았다. 일반 5초 assertion 대기로 보정하고 대표 skeleton assertion RED와 전체 GREEN을 다시 수집했다.
- 상세 지문·명령·실패명은 `.tdd/red/issue-107-web-precheck*.json`, 원본 로그·JSON은 로컬 `.codex/tdd-evidence/issue-107-web-precheck*`에 있다. 최종 실행 증거는 별도 `issue-107-web-precheck-independent-final.json`에 기록한다.

## 해석 한계와 후속

이 테스트의 provider 응답은 합성 JSON이다. `주말 아무 때나` 등의 합성 CLEAR는 그 응답을 임의 질문/원문 변환 없이 처리함만 증명하며 실제 모델 오탐·미탐을 평가하지 않는다. 실제 모델 호출 0, 외부 OAuth 공급자 호출 0이다. 합성 transport 브라우저 검증과 별도로 로컬 OIDC/JWKS·실제 Spring/PG/Redis/proof를 연결한 native 실행을 준비했다. 초회 실행은 실제 로그인·guest201/proof·저장202/current·worker 전 미완료를 부분 확인했으며, 하네스의 Node Response 상태 접근·201 기대값·진행 함수 이름 충돌을 보정했다. 이후 최종 서버 Admission/NUL/nullproof 및 실제 deadline scheduler 경로가 포함된 고정 스냅샷에서 전체 native **12/12 PASS**를 확인했다. source7·runtime manifest·native 빌드 지문은 실행 전후 동일했고 API route mock0·외부 요청0이었다. 초기 deadline tick 누락 실패는 `.codex/tdd-evidence/issue-107-native-browser-final-first-failure.{json,log}`에 보존했다. 실제 scheduler를 한 번 실행하고 동일 CLOSED/frozen 기대값을 유지했으며 SQL로 마감 상태를 강제하지 않았다. 실제 proof·Bearer 우선순위·DB 멱등성·마감/AI 경합·최종 batch 검증은 별도 native 증거와 서버 독립 검증으로 구분한다. p50/p95·정확도·유료 비용을 추정 실적으로 기록하지 않는다.

독립 최종 리뷰/FI 담당에게 epoch/late JSON, 늦은 mutation callback, 원문 저장 직후 거짓 완료, 선택 즉시 자동 POST, 조회 오류 숨김, stale revision, 로컬 draft 소실, 마감 후 쓰기, CLOSED correction 분기 누락을 전달했다. native OpenAPI 생성 뒤 타입 동기화·전체 기존 게이트·정확 HEAD CI·게시/병합은 부모와 구현 담당 범위다. 이 작성자는 commit/push/PR/merge를 실행하지 않았다.

최종 generated alias/CSS 빌드의 합성 browser **22/22 PASS**, alias 이후 단위 **67/67 PASS**를 다시 확인했다. native의 합성 CLEAR/질문 verdict는 실제 모델의 의미 판정 정확도 증거가 아니다. 범위·지문·실행 근거는 `issue-107-web-precheck-independent-final.json`과 `issue-107-native-browser.json`을 참조한다.

최종 서버 포맷 후에도 같은 native script/oracle로 12/12 재PASS했다. canonical native JSON은 최종 런타임을 가리키며 이전 PASS는 `issue-107-native-browser-before-final-format.json`에 보존했다. 전체 기존 gate는 부모/구현 담당의 별도 증거를 참조하고 신규 검사 수를 중복 합산하지 않는다.
