# Implementation log

## 2026-10-06 — UX #13 main 기준 필수 CI 연결 재확인

- main 반영 head `ba824042f7bc51a3b649cc424620b8987e79cf05`의 [CI](https://github.com/meet-me-duo/meet-me-web/actions/runs/37397252142)는 unit94/E2E257+skip1·flaky0으로 성공했다. 그러나 push 직후 옛 stacked base의 synthetic merge ref를 체크아웃했다. 로그는 `Merge ba82404 into a853310`이며 base를 main으로 전환한 뒤 GitHub의 strict required verify가 현재 병합 기준에서 BLOCKED로 남았다.
- API 조회에서 실제 main `c177661f0aeeee8759bc226b4c4d10f90a7d4c4b`, feature behind0, mergeable=true, required verify app15368·strict=true와 원래 권한 규칙을 확인했다. 설정/보호 규칙 우회는 하지 않는다. 이 기록만 정상 커밋·push해 이미 main으로 전환한 PR에서 새 synchronize CI를 실행하고 정확한 최신 SHA와 main 기준 체크가 연결된 CLEAN 상태를 확인한 뒤 승인된 병합을 수행한다.
- 제품/src/CSS/API/테스트/CI 설정 내용은 변경하지 않는다. 기존 성공 SHA·CI 로그와 모든 부모 커밋은 보존한다. 운영 데이터 쓰기·서버/인증/권한 변경 없음. Commit/PR: 동일 기록 커밋 및 PR #16.

## 2026-10-06 — UX #13 운영 웹 배포 승인 및 최신 main 반영

- 사용자가 PR #14·#15·#16의 순차 main 병합과 운영 웹 배포를 명시적으로 승인했다. #14의 main CI/CD 성공과 #15의 정확한 head CI(unit63/E2E223+skip1, flaky0) 후 #15를 main에 병합했다. 기준 main은 `c177661f0aeeee8759bc226b4c4d10f90a7d4c4b`이며 해당 CI/CD 성공을 확인한 뒤에만 #16을 병합한다.
- 최신 main을 기존 #13 브랜치에 일반 병합해 원본/부모 이력을 보존했다. Worklog의 #12/#13 기록 충돌은 양쪽 기록을 모두 보존했다. 제품/src/CSS/API/정책 파일의 내용은 기존 검증본과 동일하며 #12의 검증된 제출 완료 버튼 높이 정밀도 보완만 상속했다. 동일한 최근 모임 높이 보완은 이미 양쪽에 있어 main 대비 #13 diff에서 제거된다.
- base를 main으로 바꾸고 #13 생성 폼/통합 회귀만 표시하는 diff와 새 정확한 head CI를 재확인한다. 최종 main 배포 완료 뒤 실제 배포 HTML/JS/CSS를 PC/mobile·320/390/1440에서 탐색 전 API 목으로 검증한다. 공개 앱 GET만 허용하고 운영 데이터 쓰기·실제 참여 쿠키·서버 변경·인증/권한 설정 변경은 없다. 실제 AI/backend/DB/실기기 Safari 미검증은 유지한다. Commit/PR: 동일 병합 커밋 및 PR #16.

## 2026-10-06 — UX #13 CI 버튼 높이 측정 정밀도 보완

- 최초 최종 head `b4af5c1c5cc6e6a98da66da6f2a0e3efe99a2f44`의 [CI](https://github.com/meet-me-duo/meet-me-web/actions/runs/37393534744)는 success, unit94, E2E256 passed·1 flaky·기존 skip1이었다. 기존 최근 모임 긴 제목 테스트의 44px 버튼 높이가 Chromium에서 43.999969482421875로 보고되어 경계 검사에서 재시도했다. 생성 폼·API 실패와 구분한다.
- 44px 기준을 유지하면서 computed min-height도 44 이상임을 직접 검증하고 bounding box 측정을 0.001 CSS pixel 정밀도로 정규화한다. 페이지의 가로 넘침·10개 제목·버튼·320/390/1440 화면 검증은 유지한다. 제품/CSS/CI retry·정책은 변경하지 않는다.
- 해당 테스트를 desktop/mobile 각 5회씩 총10회·retry0으로 실행해 전부 통과하고 lint/diff 검사도 통과했다. ignored `test-results/geometry-followup-2026-10-06/`에 증거를 보존한다. 새 정확한 head의 전체 CI를 다시 추적한다. Commit/PR: 동일 커밋 예정.

## 2026-10-06 — UX #13에 부모 CI 테스트 동기화 반영

- #12의 확인창 테스트 동기화 보완 `a707239f56192faba5a64319f343da628fc10ce2`를 병합으로 반영했다. 이 병합의 변경은 `e2e/submission-flow.spec.ts`와 양쪽 기록을 보존한 Worklog뿐이며 제품·생성 폼·API·CI 정책 파일은 그대로다. 테스트 파일은 부모와 정확히 일치하고 #13 부모 대비 diff에는 이 #12 보완이 나타나지 않는다.
- 보완 전 이 브랜치의 전체 로컬 unit94/E2E257+skip1·실패/flaky0 결과와 부모의 수정 테스트 retry0 반복30회/lint 통과 근거를 구분한다. 새 정확한 #13 head의 전체 verify CI를 게시 후 확인한다. 최종 병합·배포·auto-merge는 승인 범위 밖이다. Commit/PR: 동일 병합 커밋 예정.
## 2026-10-06 — UX #12 배포 전 CI 높이 정밀도 보완

- 승인된 #14 → #15 → #16 순차 main 병합·운영 웹 배포에서 #14 main/CD 성공 후 최신 main을 일반 병합했다. head `d2cda0672cc603e789b6285ed6d4168689420ad0`의 [CI](https://github.com/meet-me-duo/meet-me-web/actions/runs/37396057919)는 success이나 최근 모임과 제출 완료 화면의 모바일 버튼 높이 측정이 43.999969482421875로 보고되어 E2E221 passed·2 flaky·기존 skip1이었다.
- 44px 기준과 실제 computed min-height 44 이상 검증을 유지하고 bounding box만 0.001 CSS pixel 정밀도로 정규화했다. 최근 모임 검사는 이미 #13에서 검증한 동일 보완이다. 제품/CSS/API/CI retry·보호 규칙은 변경하지 않는다.
- 해당 최근 모임·MEMBER 제출 편집 사례를 PC/mobile·320/390/1440에서 각 5회, 총40회 retry0으로 전부 통과하고 lint/diff 검사도 통과했다. ignored `test-results/deploy-geometry-2026-10-06/`에 증거를 보존하며 새로운 정확한 head의 전체 CI를 다시 확인한다. 서버 및 사용자 문서 변경은 보존한다. Commit/PR: 동일 커밋 및 PR #15.

## 2026-10-06 — UX #12 CI 확인창 테스트 동기화 보완

- 최초 게시 head `adbf9365f068e7a63230644ac0f63bef5e58b239`의 [CI](https://github.com/meet-me-duo/meet-me-web/actions/runs/37392525132)는 completed/success였지만 전체 E2E는 219 passed·4 flaky·기존 skip 1이었다. 로컬 전체 223 passed·flaky 0과 달라 CI 로그를 조사했다. 같은 조기 마감 사례의 두 dialog handler가 첫 비동기 확인창을 동시에 처리해 `Cannot accept dialog which is already handled`가 발생했다.
- 테스트에서 취소 확인창의 발생·내용 검증·dismiss 완료를 명시적으로 기다린 뒤 다음 accept handler를 등록한다. 기존 오류/실제 인원·마감 문구·COLLECTING 유지·confirm_early body·MEMBER 권한·외부 요청 없음 assertions는 모두 유지한다. 제품/API 및 CI retry/정책 변경 없음.
- 해당 회귀를 desktop/mobile 각 1440/320/390에서 5회씩 총 30회, retry 0으로 실행해 전부 통과했다. ignored `test-results/dialog-followup-2026-10-06/`에 증거를 보존한다. lint/diff 검사 통과. 새 head의 전체 verify CI를 다시 추적하고 이 수정은 #13에 부모 병합으로 전달해 #13 diff에 섞이지 않게 한다. Commit/PR: 동일 커밋 예정.

## 2026-10-06 — UX #13 stacked 코드 로컬 재검증 완료

- 실제 병합 작업 트리에서 API/lint/typecheck/unit **94개**/build/전체 mock E2E **257개 통과 + 기존 skip 1개**를 순차 재실행했다. 모든 명령 exit 0, unexpected/flaky 0. 독립 strictPort 4303와 ignored `test-results/publish-stack-13-2026-10-06/`에 증거를 보존한다.
- 제품·회귀 테스트는 최신 통합 인계 파일과 정규화 비교해 일치한다. #13 직접 부모 대비 변경 범위를 확인했고 원본 이슈 커밋과 앞 이슈 이력을 보존한다. GitHub 정확한 head SHA의 verify는 게시 후 추적한다. 실제 AI/운영 backend/DB/실모바일 Safari 미검증 유지. Commit/PR: 동일 병합 커밋 예정.

## 2026-10-06 — UX #12 stacked 코드 로컬 재검증 완료

- 실제 병합 작업 트리에서 API/lint/typecheck/unit **63개**/build/전체 mock E2E **223개 통과 + 기존 skip 1개**를 순차 재실행했다. 모든 명령 exit 0, unexpected/flaky 0. 독립 strictPort 4302와 ignored `test-results/publish-stack-12-2026-10-06/`에 증거를 보존한다.
- 제품·회귀 테스트는 최신 통합 인계 파일과 정규화 비교해 일치한다. #12 직접 부모 대비 변경 범위를 확인했고 원본 이슈 커밋과 앞 이슈 이력을 보존한다. GitHub 정확한 head SHA의 verify는 게시 후 추적한다. 실제 AI/운영 backend/DB/실모바일 Safari 미검증 유지. Commit/PR: 동일 병합 커밋 예정.

## 2026-10-05 — UX #12 귀속 보완 및 독립 브랜치 재검증 완료

- 통합 중 원본 보존 제한을 해제하고 #12/#13 귀속 보완만 원본 feature worktree에서 마무리하라는 추가 위임을 확인했다. 적용 전 HEAD/branch/status/ref/diff 및 변경·신규 파일 SHA-256을 재확인했고 최초 인계와 모두 동일해 사용자 추가 변경이나 충돌이 없었다. #11·main/develop·서버는 수정하지 않았다. 이번 보완은 미커밋이며 커밋·push·PR·merge·배포 없음.
- #12 최소 보완: 저장 클릭 시 raw_text를 mutation 인자로 고정하고 latestInput ref를 textarea change에서 갱신한다. 성공 응답은 현재 입력이 요청 당시 텍스트와 같을 때만 복원하며, 추가 편집이 있으면 editing을 유지해 완료 화면으로 숨기지 않는다. 저장 중 textarea 편집을 허용하고 수정 취소/중복 저장은 계속 잠근다. 저장본으로 다시 되돌린 뒤에도 폼은 유지되고 명시 취소 또는 다음 정상 저장으로 완료 화면에 복귀한다.
- 신규 단위 2건은 기존 저장본 있음/첫 제출 두 흐름에서 요청 body, 저장 중 편집·취소 잠금·응답 후 원문 보존·동일 텍스트로 되돌리기·명시 취소·후속 저장을 검증한다. 신규 E2E 6건은 두 프로젝트의 1440/320/390폭에서 같은 흐름을 확인한다. 기존 성공·실패·원문·legacy·500 Unicode 코드포인트 검증은 유지한다.
- submission-flow mock의 고정 4242 origin/복사 기대값을 실행 설정 baseURL로 계산한다. HOST 후보 버튼 선택자는 정확한 두 기존 표현 `Plan A/B/C로 확정` 또는 #11 적용 후 `Plan A/B/C 선택`만 허용하고 HOST=1/MEMBER=0 검증을 유지한다. #11의 CandidateCard/부분 결과/dirty/개인정보 문구/후속 GET 실패 분리는 이 단독 브랜치에 복사하지 않았다. #13 생성 폼/CSS/utility도 섞지 않았다.
- 이번 보완 파일은 RoomPage.tsx, RoomPage.test.tsx, e2e/submission-flow.spec.ts 및 본 Worklog뿐이다. 이전 #12 변경 파일 경계는 유지했다. 추가 원본 diff는 task-6/owned-followups/에 별도 보존한다.
- 이 브랜치 자체에서 API 일치/lint/typecheck/unit **56개**/build/전체 mock E2E **187개 통과·기존 skip 1개**를 순차 실행했다. 모든 명령 exit 0, unexpected/flaky 0. ignored `test-results/submission-followup-2026-10-05/`와 독립 strictPort 4282를 사용했고 다른 서버는 재사용·종료하지 않았다. git diff --check 통과. 기존 Zod 주석 경고만 유지된다.
- #11/#12/#13 최종 통합본도 필수 검사·unit 94개·전체 E2E 257개+기존 skip 1개를 재실행해 모두 통과했다. #12의 두 신규 단위·6개 E2E를 통합본에도 반영했으며 제품 API/정책 변경은 없다. 최종 aggregate 증거는 task-6/integration/test-results/aggregate-followup-2026-10-05/이다.
- 원본 #11·web main/develop·서버 기존 implementation_plan.md 변경의 해시를 최종 재확인한다. 실제 AI/운영 backend/DB/실모바일 Safari 미검증 유지. 로컬 PR 준비 완료이며 #11이 반영된 최신 main에서 #12의 공통 RoomPage 충돌을 의미적으로 반영·재검증한 뒤 독립 PR로 처리한다. PR 게시/commit/push/merge/배포는 이번 범위에 포함하지 않는다.

## 2026-10-05 — UX #12 제출 후 공유·대기·상태 갱신 구현 완료

- 승인: 부모 대화 `01a0f13c-c38d-764e-994b-900a645ca035`에서 사용자의 `추천대로 진행해`, 기존 PC gh 경로 사용에 대한 `진행해`를 확인한 위임이다. 이번 범위는 [#12](https://github.com/meet-me-duo/meet-me-web/issues/12)의 로컬 구현·검증·기록까지다. 이슈를 기존 gh로 읽고 원격 main을 읽기 전용 확인했으며 새 인증·권한·Git 전역 설정은 변경하지 않았다.
- 작업 위치: `C:/Users/jinhy/Documents/Codex/2026-10-05/task-4/submission-flow`, 브랜치 `feature/12-submission-share-and-wait`, HEAD 및 기준 main `d9724d56205705647062da29c6e333a255152cd3`. 모든 구현은 미커밋 상태다. 커밋·푸시·PR·병합·배포는 수행하지 않았다.
- 사전 확인: 상위 AGENTS.md, 웹 README와 ARCHITECTURE/BRANCHING/DEPLOYMENT/기존 Worklog, 사용자 .agents/skills의 orchestration/orca-cli discovery stub, 서버 AGENTS와 PRD의 공개·마감 정책, #11 worktree Worklog 및 task-3 인계를 읽었다. Orca 관리 상태나 다중 에이전트는 사용하지 않았다. 웹의 main 기반 feature 규칙을 적용했다.
- 제출 완료 또는 재방문에서는 수정 폼 대신 `조건 제출을 완료했어요`를 먼저 표시한다. 주최자는 초대 링크 공유를 주행동으로, 참여자는 `입력 마감을 기다려 주세요`를 안내한다. 저장한 원문·revision과 `내 조건 수정`은 아래 보조 영역에 둔다. 명시적으로 수정하고 취소하면 저장된 원문으로 돌아오며, 저장 성공 후 완료 화면으로 복귀한다. 저장 요청 중에는 입력·취소를 잠가 중간 편집이 완료 화면 뒤에 숨지 않도록 했다. legacy null 입력은 기존 재입력 화면과 자동 저장 없음 정책을 유지한다.
- 마감 조건은 목표 인원(주최자 포함), 자동 마감 시간, 직접 마감을 실제 설정에 따라 표시한다. 인원과 시간 동시 설정은 모두 표시하고 먼저 충족되는 조건에 마감된다고 설명한다. 목표 인원을 현재 참여·제출 수로 표현하거나 추정하지 않는다. 조기 마감 확인은 기존 오류 응답의 실제 제출 수와 설정 값을 사용하고 기존 확인·부분 결과 확정 정책을 유지한다.
- READY 및 READY_WITH_WARNINGS의 참여한 HOST/MEMBER도 5초 간격으로 기존 room GET을 조회한다. ANALYZING 2초와 COLLECTING 5초는 유지하고 CONFIRMED 등 종료 상태에서는 interval을 중단한다. 기존 Query의 포커스 재조회·숨겨진 탭 interval 중지·요청 signal 취소를 유지한다. 일시적인 재조회 오류에는 마지막 화면과 편집 상태를 유지하고 다시 확인 버튼을 제공한다. 401/403/404는 캐시된 주최자 행동을 숨기는 기존 오류 경계로 처리한다.
- 헤더·제출 완료·결과의 링크 복사는 동일한 컴포넌트로 성공 메시지를 제공한다. 실패에는 성공을 표시하지 않고 선택 가능한 읽기 전용 링크를 제공한다. 공유 주소는 기존 roomLink의 현재 origin+공개 방 경로만 사용해 query/hash를 제외한다. 주소 보관·권한 한계 안내는 주행동 뒤에 배치했다.
- 변경: `src/pages/RoomPage.tsx`, `src/styles.css`, `src/pages/RoomPage.test.tsx`, 기존 `e2e/submission.spec.ts`, 신규 `e2e/submission-flow.spec.ts`, 본 로그. 기존 제출 E2E는 저장본 복원 후 `내 조건 수정`을 명시적으로 선택하도록 수정했으며 원문/500 코드포인트/legacy/실패 보존 검증은 유지했다. CandidateCard, 생성 폼 #13, API 타입·계약·서버는 변경하지 않았다.
- RED: 기존 코드에서 새 완료/마감 단위 5건 실패·기존 46건 통과를 확인했다. 기존 production build의 MEMBER READY→CONFIRMED 회귀도 1440/320/390 세 폭에서 모두 실패했다. 실패 trace/맥락은 `test-results/submission-flow-2026-10-05/e2e-output/`에 보존한다. sandbox 실행의 테스트 종료 정리가 지연돼 중단했고, 그 preview 종료 전 첫 후속 실행은 포트 사용 오류로 끝났다. 종료 확인 후 승인된 로컬 브라우저 실행으로 검증했으며 제품 실패와 구분한다. pnpm exec의 초기 실행 경로 오류도 실제 테스트 실행으로 계산하지 않았다.
- GREEN: 새 desktop mock 회귀 30건 통과 후 전체 검증했다. 최종 `corepack pnpm api:check`, `lint`, `typecheck`, `test`(54건), `test:e2e --config test-results/submission-flow-2026-10-05/playwright.config.ts --output test-results/submission-flow-2026-10-05/final-output`(production build 포함) 모두 통과했다. 최종 desktop/mobile E2E는 **181건 통과·기존 조건부 skip 1건**, 실패·flaky 0건이다. `git diff --check`도 통과했다. build의 기존 Zod 주석 제거 경고만 남았다. 설치된 의존성은 기존 경로를 읽는 로컬 junction으로 사용하되 .tmp/.vite 캐시는 이 worktree에 분리했다. lockfile 및 제품 설정은 변경하지 않았다.
- 새 mock E2E 60건은 두 프로젝트에서 1440/320/390, HOST/MEMBER, 반복 수정·취소·새로고침·뒤로 가기, 마감의 인원/시간/동시/직접 설정, 복사 성공/실패 및 공개 URL 정규화, 마감 오류·조기 마감 거절/확인, 일시 조회 실패와 복구, READY/READY_WITH_WARNINGS→CONFIRMED 및 종료 후 polling 중단을 확인한다. API는 탐색 전에 로컬 mock으로 처리하고 외부 origin과 정의되지 않은 API를 차단한다. 운영 모임·실제 쿠키·DB는 사용하지 않았다.
- 캡처: 최종 `final-output/`의 완료 화면에서 HOST/MEMBER와 1440/320/390 모두 확인했다. 수평 넘침 및 버튼 잘림 없음, 완료 화면 버튼 높이 44px 이상이다. 320 참여자 제목의 외톨이 글자 줄바꿈은 짧고 실제 수집 상태에 맞는 문구로 수정해 다시 전체 검사했다. 실기기 Safari·실제 서버 상태 전파는 이번 로컬 mock 검증 범위 밖이다.
- 증거 경로: `test-results/submission-flow-2026-10-05/playwright.config.ts`, `api-check.log`, `final-lint.log`, `final-typecheck.log`, `final-test.log`, `final-e2e.log`, `e2e-report.json`, `final-output/`. 최종 JSON의 expected=181/skipped=1/unexpected=0/flaky=0을 확인했다. 이전 1차 전체 결과는 `full-e2e.log`/`full-output/`, 작은 회귀는 `targeted.log`/`targeted-output/`에 별도로 보존했다.
- 보존: 원본 웹 main은 clean이며 #11의 `task-3/accuracy` 미커밋 파일 목록은 인계와 동일하다. #11 파일을 수정·복사·reset하거나 이번 브랜치에 섞지 않았다. 서버는 기존 사용자 수정 `implementation_plan.md`만 남아 있고 서버 파일은 건드리지 않았다. 원격 작업과 운영 데이터 생성은 없다. 현재 차단 사항 없음.
- 남은 통합 위험: #11과 RoomPage의 SubmissionPanel/ResultPanel, CSS, RoomPage 단위·기존 제출 E2E 및 Worklog가 겹친다. 향후 승인된 통합에서 #11의 dirty/저장 중 편집 보존/PUT 성공과 후속 GET 실패 분리/원문 공개 안내를 유지하면서 #12 완료·편집 상태를 결합해야 한다. 특히 #12의 저장 중 textarea 잠금과 무조건 완료 복귀를 그대로 채택하면 #11의 저장 중 추가 편집 흐름을 바꾸므로, #11의 요청 텍스트 비교 및 dirty 보존을 우선해 완료 전환을 결정해야 한다. #11의 결과 문구·부분 결과 정책을 보존한 ResultPanel에 CopyRoomLink를 적용하고, #11 회귀의 복원/저장 후 textbox 접근은 명시적 수정 동선에 맞춰야 한다. 실제 통합·통합 후 검증은 이번에 수행하지 않았다. #13은 별도 feature 작업으로 남긴다.

## 2026-10-05 — UX #13 모바일 제목 귀속 보완 및 독립 재검증 완료

- 추가 위임에 따라 기존 #13 원본 feature worktree의 보완을 마무리했다. 적용 전 원본 상태·diff/신규 파일 SHA-256이 최초 인계와 일치했고 사용자 추가 변경·충돌이 없었다. 다른 이슈 브랜치/main/develop/서버는 변경하지 않았다. 미커밋 상태이며 commit/push/PR/merge/배포 없음.
- 통합 화면 QA의 320px 생성 첫 단계에서 마지막 ‘요’ 한 글자만 줄바꿈되는 문제를 h1 `모임 기본 정보를 입력해 주세요`→`모임 기본 정보` 한 줄 문구 변경으로 해결했다. 자동/직접 마감·default14일·inclusive 날짜→exclusive API 계약·요청 body·CSS/utility/기존 테스트는 추가 변경하지 않았다. #11/#12 RoomPage/저장/공유 테스트는 섞지 않았다. 추가 변경 파일은 LandingPage.tsx 및 본 Worklog뿐이다.
- 본 브랜치 자체 API 일치/lint/typecheck/unit **77개**/build/전체 mock E2E **149개 통과·기존 skip 1개**, 모든 명령 exit 0, unexpected/flaky 0. 독립 4283 strictPort, ignored test-results/create-followup-2026-10-05/를 사용했다. 320/390/1440 생성 화면은 기존 키보드/44px/가로 넘침 검증을 유지했고 제목 보완 화면을 재확인했다. git diff --check 통과. 기존 Zod 주석 경고만 유지된다.
- 최종 aggregate도 unit 94개·전체 E2E 257개+기존 skip 1개 및 필수 검사를 재실행해 모두 통과했다. API/제품 정책/실제 backend/AI/운영 데이터/실모바일 Safari 검증 범위는 확대하지 않았다. 로컬 PR 준비 완료이며 #11→#12 이후 최신 main의 CSS/Worklog를 보존해 별도 #13 PR로 처리한다. 게시·merge·배포는 아직 수행하지 않는다.

## 2026-10-05 — UX #13 생성 폼 단순화 로컬 구현·검증

- 승인 범위는 [#13](https://github.com/meet-me-duo/meet-me-web/issues/13)의 로컬 구현·전체 검증·기존 Worklog 기록이다. 상위 `C:/Users/jinhy/AGENTS.md`, 웹 README·ARCHITECTURE·BRANCHING·기존 Worklog 및 관련 `.agents/skills` 목록을 확인했다. #11 Worklog와 CSS diff, 서버의 `FRONTEND_HANDOFF.md`, `RoomLifecycleService.kt`, `MeetingRoom.kt`, `shared/domain/time/TimeModels.kt`의 날짜/마감 계약을 읽기 참고했다. 웹에 별도 AGENTS나 작업에 적용할 프로젝트 skill은 없었다.
- 기준 HEAD/main은 `d9724d56205705647062da29c6e333a255152cd3`. 별도 브랜치는 `feature/13-simplify-create-form`, worktree는 `C:/Users/jinhy/Documents/Codex/2026-10-05/task-5/create-form`이다. main/develop·서버 문서·다른 worktree를 수정하지 않았고 #11의 미커밋 변경과 #12의 별도 `task-4/submission-flow` 작업을 보존했다. 커밋·push·PR·merge·배포 및 운영 데이터 생성은 수행하지 않았다.
- 생성 2단계에서 자동/직접 마감을 native radio로 먼저 구분한다. 자동에서만 인원/시간 checkbox를 보여주며 하나 이상 선택하게 한다. 두 조건을 선택하면 **주최자를 포함한 목표 인원 제출 또는 지정 한국 시각 중 먼저 충족**되면 마감한다는 요약을 표시한다. 직접 마감은 자동 조건 없이 주최자가 마감한다. 전환·이전 이동에서 인원/시간 입력은 보존하지만 직접 모드의 요청은 `expected_participants=null`, `submission_deadline=null`, `manual_only=true`로 정규화한다. 서버의 OR 종료 의미와 조기 마감 정책은 변경하지 않았다. 제출 중 방식·이전·취소·생성 버튼을 잠근다.
- 기본 탐색 기간은 서울의 오늘부터 마지막 날까지 실제 ISO 날짜로 표시하며 날짜 편집은 `기간 변경`으로 펼친다. 기본값/기본값 복귀의 요청은 기존 `search_start_date=null`, `search_end_date=null`을 유지하고 서버가 생성 시각의 서울 날짜를 기준으로 DEFAULTED 14일을 결정한다. 변경 시 사용자가 선택하는 마지막 날을 포함하며 API에는 그 다음 날짜를 보내 기존 exclusive end를 유지한다. 시작일부터 포함 마지막 날까지 1~31일을 검증한다. 잘못된 날짜·한쪽 누락·역순·32일은 차단한다. 화면 기본 날짜는 30초 주기 및 visibility 복귀에 갱신하며 변경 날짜는 보존한다. API snapshot·타입·서버/제품 정책은 수정하지 않았다.
- 모바일 모임 방식 세 개를 48px 한 줄 선택 묶음으로 바꾸고 선택한 방식 설명만 보여준다. 생성 폼에 한정된 스타일로 카드 여백, 날짜/설명 글자, 이전·다음·생성·기간 변경·취소 터치 영역을 정리했다. native radio의 방향키/Tab/Enter, 선택 테두리·focus, 단계 제목 focus와 이전 시 이름 focus, 날짜 오류의 aria-invalid/설명 연결을 검증했다. 랜딩 hero·패럴랙스는 수정하지 않았다.
- 변경 파일은 `src/pages/LandingPage.tsx`, `src/styles.css`, 신규 `src/utils/createRoom.ts`·`createRoom.test.ts`·`e2e/create-form.spec.ts`, 기존 radio 전환에 맞춘 `e2e/landing.spec.ts`, 본 기록이다. 기존 `RoomPage`·공유/대기 테스트는 수정하지 않았다.
- `api:check`, lint, typecheck, unit **77개**(신규 날짜/마감 31개 포함), build가 통과했다. 전체 Playwright desktop/mobile **149개 통과·기존 desktop 조건부 skip 1개**, unexpected/flaky 0개다. 공식 test:e2e의 build+Playwright 경로와 동일한 검증을 전용 ignored 설정의 4263 서버에서 수행했다. 최종 명령은 `corepack pnpm exec node node_modules/@playwright/test/cli.js test --config test-results/create-form-2026-10-05/playwright.config.ts`이며 완료된 build 뒤 순차 실행했다. Node 24.11.0/pnpm 10.17.1, lockfile 고정 의존성과 Microsoft Edge desktop/Pixel 7 에뮬레이션을 사용했다. build의 기존 Zod 주석 경고는 유지된다.
- 신규 E2E 28개는 기본 null/null·서울 자정 표시 갱신, 인원/시간/직접 전환과 재전환, 이전과 취소, 오류와 제출 재시도, 하루·31일·32일 거부·윤년·연말, UTC/LA/서울 브라우저 시간대, 320/390/1440폭의 키보드·44px 이상 버튼·한 줄 모임 방식·가로 넘침을 검증한다. 단위 테스트는 월말·윤년·UTC/서울 날짜 경계·DST offset 입력과 기본14일 포함/배타 경계도 확인한다. 신규 fixture는 탐색 전에 모든 API를 목 처리하고 외부 origin 요청을 abort한다. 실제 서버/운영 API를 호출하지 않았다.
- 첫 실행에서 같은 worktree build와 E2E가 겹쳐 `dist` 재생성 중 기존 제출 테스트 2개가 페이지 404로 실패했다. 실패 context/trace/screenshots는 `test-results/create-form-2026-10-05/first-run-output/`에 보존했다. 코드 수정 없이 순차 전체 재실행에서 두 테스트를 포함한 전부가 통과했다. Windows sandbox가 테스트 종료 후 preview를 종료하지 못해 마지막 리포트 저장이 지연되었으며, 전용 4263 preview의 PID/명령을 확인한 뒤 해당 프로세스만 종료했다. 최종 runner exit 0과 JSON stats를 확인했으며 다른 worktree 프로세스는 건드리지 않았다. 의존성 복사 중 pnpm 링크가 손실된 준비 문제는 별도 로컬 store로 frozen install하여 해결했고 lockfile은 바꾸지 않았다.
- 최종 증거: `test-results/create-form-2026-10-05/playwright.config.ts`, `e2e-report.json`, `e2e-output/`의 320/390/1440 기본/날짜/자동/직접 화면. animation 완료 뒤 스크롤을 처음으로 맞춘 캡처를 시각 확인해 입력·날짜·요약·버튼의 겹침/수평 잘림이 없음을 확인했다. `git diff --check`도 통과했다. 전용 preview는 종료했다.
- 남은 통합 위험: #11/#12와 `src/styles.css`·본 Worklog를 함께 통합할 때 각 단계 내용을 보존하고 합쳐진 코드의 회귀 검증을 다시 해야 한다. #11 CSS 변경과 본 생성 폼 CSS는 서로 다른 구역이며 본 단계는 RoomPage를 변경하지 않는다. 실제 모바일 Safari/기기 및 실제 백엔드 통합은 검증하지 않았으며 이번 범위의 로컬 구현 차단 사항은 없다.

## 2026-10-05 — 최근 모임 게시·배포 승인 확인

- 사용자가 이 작업 대화에서 직접 `승인`을 보냈다. 직전 제시 범위는 `meet-me-duo/meet-me-web`의 최근 모임 복귀와 두 미반영 사유 한국어 안내를 각각 독립 PR로 진행하는 이슈 생성·연결, 커밋·푸시·PR 생성·main 병합·`app.meet-me.co.kr` 배포다. 기존 자동 승인 거절 이후 새 직접 승인을 확인했으며 인프라·권한·정책은 변경하지 않는다. 운영 데이터 쓰기는 수행하지 않는다.
- 원격 main은 기준 `90908b6`과 일치하고 이 worktree HEAD `615cc4c`와 companion HEAD `5708f81`은 clean이었다. 최근 모임 이슈 #7은 열린 상태이며 feature 원격 브랜치와 PR은 없었다. Companion을 먼저 게시·배포·검증하고 이 기능을 독립 PR로 진행한다.
- 최신 코드의 `api:check/lint/typecheck/test/build/test:e2e`를 다시 실행해 모두 통과했다. 단위 테스트 46개, desktop/mobile E2E 103개 통과와 기존 조건부 skip 1개다. 다른 worktree의 preview를 재사용하지 않도록 ignored 임시 설정에서 이 worktree cwd와 전용 4178 서버를 명시했다. 공식 설정·서버 파일은 수정하지 않았다. 이 증거는 `test-results/anonymous-return-implementation-2026-10-04/publish-runs/`에 보존한다.
- Companion 이슈 [#8](https://github.com/meet-me-duo/meet-me-web/issues/8)와 PR [#9](https://github.com/meet-me-duo/meet-me-web/pull/9), 최근 모임 PR [#10](https://github.com/meet-me-duo/meet-me-web/pull/10)을 게시했다. 두 PR 본문은 기존 내용·Closes 링크를 보존하고 사용자가 요청한 정확한 H2 `변경사항` / `검증` 구조로 수정한 뒤 재조회했다.
- Companion PR head `c52c59e`의 첫 verify는 기존 RoomPage 입력 화면 단위 테스트가 textbox를 1초 내에 찾지 못해 실패했다. 같은 코드의 실패 job 재실행은 전체 통과했고 main merge 뒤 verify와 deploy도 통과했다. 제품/테스트 코드나 CI 정책을 바꾸지 않았으며 간헐적 실패 기록은 [CI run](https://github.com/meet-me-duo/meet-me-web/actions/runs/37276503185)에 남아 있다.
- Companion main merge 커밋은 `50dd973fb2b89f5aa7e881e320131294d505364e`, [운영 deploy run](https://github.com/meet-me-duo/meet-me-web/actions/runs/37277173075)은 성공이다. 공개 정적 GET에서 루트·가상 방 직접 경로의 동일 HTML과 `index-vu2jYeAK.js`/`index-BQRR7iip.css`, HTML no-cache 및 해시 자산 immutable·보안 헤더를 확인했다. 배포 로그의 자산명과 일치하며 JS SHA-256은 `d9876fa1e5ecb797a0a22f0f4822ac8e22a35892e47281cad2fd00f6c74fa453`다.
- 실제 운영 번들의 새 desktop/mobile context에서 기존 자연어 입력·구 서버 fixture·nullable legacy·두 사유·HOST/MEMBER 경계·PARTIAL 후보 0개·unknown fallback·후보/확정 시간을 검증해 40개가 통과했다. 탐색 전에 API 목과 웹 GET 허용 목록을 설치했고 실제 참여 쿠키·운영 데이터 쓰기는 없었다. 첫 smoke는 검증 스크립트가 `/candidates/unapplied-inputs`를 허용 목록에서 빠뜨려 안전 차단으로 실패했으며 제품 결함으로 분류하지 않는다. 허용 목록 수정 뒤 최종 실행의 차단 요청·pageerror는 0개다. 실패 증거와 최종 report/screenshots, 자산 SHA는 companion worktree의 `test-results/conditional-reason-2026-10-04/`에 보존한다. 완료 커밋/run URL/검증 결과를 부모에게 전달해 서버 배포 gate를 열 수 있음을 알렸다.
- 최신 main `50dd973`을 최근 모임 PR에 merge했다. RoomPage의 두 기능은 자동 병합됐고 작업 기록 충돌은 양쪽 기록을 모두 보존해 해결했다. main 대비 변경은 최근 모임 구현·테스트와 기록뿐이다. 통합 코드의 `api:check/lint/typecheck/test/build/test:e2e` 모두 통과, 단위 46개와 desktop/mobile E2E 121개 통과·기존 skip 1개다. 최신 head의 원격 verify를 다시 확인한 후 별도 최근 모임 배포를 진행한다.

## 2026-10-04 — 최근 모임 기능 원격 게시 차단 상태

- 구현 커밋은 `c9a4939`이며 웹 `feature/anonymous-room-return-investigation`에 로컬로 보존했다. 마지막 E2E 선택자 정리 이후 최근 모임 desktop/mobile 22개 재검증도 통과했다. 전체 103개+기존 skip 1개, 단위 46개, 브라우저 재시작 fixture 12개와 필수 검사 통과 결과는 유지된다.
- 명시 승인에 따라 `git push -u origin feature/anonymous-room-return-investigation`을 시도했으나 명령 실행 전 자동 승인 검토가 거절했다. 정확한 사유는 “원격 feature 브랜치로 저장소 코드를 전송하는 외부 쓰기이며 대상 저장소의 신뢰·소유권과 직접적인 사용자 승인이 확인되지 않아 민감한 소스 공개 위험을 허용할 수 없습니다.”였다. 이전 원격 읽기와 이슈 #7 생성은 성공했지만 이것이 코드 push의 승인을 대신하지 않는다.
- 해당 push를 우회·간접 실행·반복하지 않았다. 뒤에 예정한 draft PR 생성 명령은 실행되지 않았다. 이번 기능의 원격 PR·필수 CI·main 병합·운영 배포도 실행되지 않았다. 이 차단은 로컬 테스트 실패나 production Environment 대기와 구분한다. 원격에 소스가 게시됐거나 새 기능이 배포됐다고 보고하지 않는다.
- 부모의 직접 사용자 승인 맥락과 저장소 권한을 확인할 수 있는 세션에서 feature push → draft PR(Closes #7) → 정확한 head의 verify CI → ready/review → 승인된 main 병합·기존 production workflow → 공개 정적 GET/탐색 전 목 API 검증 순서로 재개해야 한다. PR 본문과 이슈 본문은 ignored `test-results/anonymous-return-2026-10-04/` 및 `test-results/anonymous-return-implementation-2026-10-04/pr-body.md`에 준비했다. 권한/승인 정책을 변경하거나 필수 CI를 우회하는 방법은 사용하지 않는다.

## 2026-10-04 — 사용자 요청 1 최소안 구현·검증 및 게시 준비

- 사용자가 “최소안으로 우선 진행하자. 곧 소셜로그인 도입을 할거거든.”으로 구현을 승인했다. 이어 두 저장소의 이슈 생성과 가능한 배포까지 진행하도록 명시 승인했다. 웹 중복 이슈·열린 PR을 조회해 없음으로 확인하고 [#7: 계정 없이 이 기기의 최근 모임을 다시 열기](https://github.com/meet-me-duo/meet-me-web/issues/7)을 생성했다. 승인 전에는 원격 쓰기를 하지 않았다.
- 실제 작업은 `C:/Users/jinhy/Projects/meet-me/meet-me-web`의 `feature/anonymous-room-return-investigation`에서 진행했다. `git worktree list`에는 이 경로 하나만 있고 별도 worktree를 만들지 않았다. 웹 `docs/BRANCHING.md`의 최신 main → feature 브랜치 → 검증 → PR 절차를 따른다. 이슈를 브랜치 전에 만들라는 규칙은 서버 `.agents/rules/development.md`의 규칙이며 웹 BRANCHING에는 없다. main·서버·정책 파일을 직접 수정하지 않았다.
- 홈 첫 화면에 최근 모임이 있으면 “이 기기의 최근 모임 N개 보기” 진입점을 보여주고 다음 영역에서 목록을 선택하도록 했다. 생성+참여가 확인된 모임을 기록하며 다시 열기·링크 복사·목록에서 지우기를 제공한다. 미참여 초대 URL 단순 방문은 기록하지 않는다. 생성 및 join 성공은 화면 이동/상태 반영 전에 기록하고, 기존 직접 URL 방문은 서버 viewer.joined 확인 뒤 기록한다. 홈 자동 리다이렉트·계정 체계·서버 목록 API·익명 세션 수명 변경은 없다.
- `meet-me:recent-rooms:v1`에는 버전과 최대 10개의 공개 inviteCode·80 Unicode 코드포인트 이내 모임 제목·최근 열람 epoch 시각만 저장한다. 중복을 제거하고 최근순으로 표시하며 마지막 열람 이후 30일이 지나면 목록에서 제외한다. 조건 원문·참여자명·역할·hostsecret·인증 쿠키·내 제출은 저장하지 않는다. 서버 권한·방 데이터 보존과 로컬 기록 보관 기간은 별개다. 기존 방 주소와 참여 정보가 있어도 실제 접근은 서버 viewer로 판정한다.
- 스토리지 조회/쓰기 거부·용량 오류가 생성/참여 성공을 취소하지 않도록 처리하고 링크 복사·북마크 안내를 표시한다. 잘못된 JSON·미지원 버전·부적절한 코드·시각은 기록으로 사용하지 않는다. storage event·현재 탭 변경 event·focus로 열린 탭의 목록을 갱신한다. 로컬 삭제에는 서버 요청을 하지 않으며 “실제 모임은 삭제되지 않았어요”로 안내하고 키보드 포커스를 목록 제목으로 이동한다. 404·503 응답에서 기존 기록은 보존하고 사용자가 직접 지울 수 있다.
- 초대 링크와 최근 목록 공유는 항상 현재 origin+공개 방 경로를 사용한다. 결과 링크도 같은 공개 경로로 정규화하여 URL query/hash를 무심코 공유하지 않게 했다. 최근 목록의 자동 복사가 거부되면 읽기 전용 URL 입력을 표시해 선택·직접 복사가 가능하다. 시크릿 종료·브라우저 데이터 삭제·만료·기기 변경·기존 HOST 복구 불가를 안내하고, 이전 기록이 있는데 viewer.joined=false이면 같은 이름의 새 참여가 기존 권한/입력을 복구하지 않는다는 안내를 추가했다.
- 필수 로컬 `api:check`, lint, typecheck, 단위/컴포넌트/API 46개, build가 통과했다. 전체 desktop/mobile E2E는 103개 통과·기존 모바일 전용 사례의 desktop 1개 조건부 skip이다. 추가한 22개 UI 사례는 생성·참여 기록, 404/503 기록 보존과 로컬 삭제, 권한 손실, 저장 거부, 복사 성공/실패, 키보드, 실제 다중 탭 storage event, 기록 만료·손상, 320/390/1440폭에서 긴 제목 10개와 44px 버튼·가로 넘침을 검증한다. build의 기존 Zod 주석 경고는 유지된다.
- `test-results/anonymous-return-implementation-2026-10-04/`에 별도 E2E 출력 경로를 사용해 이전 조사/다른 작업 증거가 지워지지 않게 했다. `browser/verify-browser.mjs`와 `browser/evidence.json`의 실제 Chrome/격리 프로필·localhost HTTP fixture 12개도 통과했다. 공유 없이 탭 종료 → 홈 목록 발견, 실제 Chrome 종료/재시작 → 홈 목록과 유효 HOST 복귀, localStorage만 삭제, 다른 프로필의 같은 이름 MEMBER, 시크릿 종료, 쿠키/서버 세션 손실·마감·방 삭제를 재현했다. 외부 API 요청·pageerror는 0개이며 실제 서버·운영 방/DB는 사용하지 않았다. HTTP fixture의 Secure=false는 로컬만 해당하고 운영 Secure/CORS 검증을 대신하지 않는다. 모바일 Safari·실기기는 미검증이다.
- 로컬 정적 preview는 `http://127.0.0.1:4195`에서 별도 숨김 프로세스로 구동했다. 상호작용 검증은 목 API로만 수행했으며 preview 자체에 운영 API를 연결하지 않았다. 계정 귀속/쿠키 손실 복구/동일 프로필 공유 기기의 신원 분리는 후속 소셜 로그인 설계 범위다.
- 별도 서버 후보 로직 작업에서 전달받은 `UNSUPPORTED_CONDITIONAL_CONSTRAINT`와 PARTIAL을 현재 웹 빌드의 로컬 fixture로 확인했다. HOST는 일반 부분 결과 경고와 사유 코드 원문을 표시하고, MEMBER는 부분 경고만 표시하며 타인 미반영 원문 API 요청은 0개였다. 실제 웹 OpenAPI의 reason은 string이므로 새 사유 수신을 위한 enum/타입 변경은 필수가 아니다. 조건별 시간·장소가 미반영됐다는 정확한 한국어 설명은 별도 최소 UI 매핑·회귀 테스트 PR이 필요하다. 증거는 `conditional-reason.mjs/json`과 HOST/MEMBER 화면이며 최근 모임 브랜치에 해당 계약/표시 변경을 섞지 않았다. 현재 서버 운영 계약과 최근 모임 기능은 독립적이다.
- 게시 전 diff에서 저장 필드 allowlist·권한 판정·로컬 삭제의 무쓰기·공유 경로·기존 입력 비공개 경계를 검토했다. GitHub main 보호는 strict verify와 required approvals 0, production Environment는 branch policy만 있는 것을 읽기 전용으로 확인했다. GitHub 정책·승인 설정은 변경하지 않았다. 최종 PR/CI/배포 상태는 실제 실행 결과 확인 후 후속 기록한다.

## 2026-10-04 — 사용자 요청 1: 계정 없는 모임 재방문 조사 (제안, 구현 전)

- 범위: Wanted 제출 MVP의 소셜 로그인 유예를 유지하면서, 생성 후 공유하지 않고 탭을 닫거나 공유 후 홈에 재방문했을 때 기존 모임을 찾기 어려운 문제를 조사했다. 이번 기록은 원인·권고·사용자 결정사항이며 기능 구현이나 확정된 인증 정책 변경이 아니다. 웹 `src/`, 서버 파일, 정책 파일은 수정하지 않았고 원격 push·PR·merge·배포와 운영 방 생성·데이터 변경은 하지 않았다.
- 사전 확인: 상위 `C:/Users/jinhy/AGENTS.md`, 웹 README·ARCHITECTURE·BRANCHING·DEPLOYMENT·기존 Implementation log, 사용자 `.agents/skills`의 관련 지침을 확인했다. 서버 `AGENTS.md`, `project-architecture/SKILL.md`, architecture·adr·user-intervention 규칙 및 PRD·ARCHITECTURE·ADR·FRONTEND_HANDOFF의 관련 범위를 확인했다. ADR-020/021/032/036의 쿠키·여러 방 소유권·익명 주최자·고정 만료 결정이 현재 기준이다. 미합의 후보를 ADR로 확정하지 않는다.
- 실제 상태: 시작 시 웹 작업 트리는 깨끗한 `main`, HEAD는 `90908b626ec2ef7571ad312398a3cc43f8503713`이었다. `git ls-remote origin refs/heads/main`도 동일했다. 해당 SHA의 [CI](https://github.com/meet-me-duo/meet-me-web/actions/runs/37212119555)와 [Deploy production](https://github.com/meet-me-duo/meet-me-web/actions/runs/37212119631)는 completed/success였다. 기록은 이 HEAD에서 만든 로컬 `feature/anonymous-room-return-investigation` 브랜치에 남긴다. 서버 조사 기준 HEAD는 `c43a30b`이며 조사 중 별도 작업이 서버의 `MatchingNaturalLanguageOnlyTest.kt`를 변경한 것을 관찰했다. 해당 파일과 서버 작업 트리에 손대지 않았다.
- 운영 확인은 쿠키 없이 공개 HTML/JS/CSS/SVG GET만 수행했다. `/` 및 가상 코드의 `/rooms/abcdefghijklmnopqrstuv`는 HTTP 200으로 같은 SPA shell을 반환했고 shell은 `no-cache,no-store,must-revalidate`였다. 운영 JS는 `index-C_yol5G2.js`(SHA-256 `106ea0aa7fb75e048b11b8023ed04a5a2494d27e0cf04e4f52a1a4ba517dec00`), CSS는 `index-BQRR7iip.css`(SHA-256 `4dfaaf9efbb6859fd67cc288b43dcd7c02d5abb601740ccd8991c02b022c5b6d`)이며 모두 immutable/1년 캐시와 200 응답을 확인했다. JS에 운영 API 주소와 방 경로가 있고 localStorage/sessionStorage 사용 문자열은 없다. 실제 운영 방 API·쿠키 발급·운영 DB 기능은 검증하지 않았다.

### 현재 구조와 원인

| 확인 항목 | 현재 구현 및 근거 | 재방문에 미치는 영향 |
| --- | --- | --- |
| 방 식별 | 서버 내부 방·참여자·세션은 UUID. 외부에는 128비트 난수의 22자 base64url `invite_code`만 공개한다. 서버 `SecureInviteCodeGenerator.kt`, `RoomLifecycleDtos.kt`, V1/V2 migration 참조. | 웹이 보관할 주소는 `/rooms/<invite_code>`이며 내부 UUID가 필요하지 않다. |
| 생성과 홈 라우팅 | `src/pages/LandingPage.tsx:70`은 생성 성공 후 `navigate(..., { replace: true })`만 한다. `src/App.tsx:28`의 `/`는 항상 랜딩이고 기존 모임 선택·자동 복귀 로직이 없다. | 탭을 닫으면 사이트 자체에는 기존 방을 발견할 수단이 없다. replace는 생성 폼을 방 경로로 바꾸며 브라우저 전체 방문 이력을 삭제하는 동작은 아니다. 방문 기록·최근 닫은 탭 복원은 가능한 수동 우회다. |
| 웹 저장 | `src/`에 localStorage/sessionStorage 저장·복원 코드가 없고 TanStack Query는 `src/main.tsx`에서 메모리 캐시만 생성한다. | 재방문 홈에서 기존 방 주소 목록을 만들 수 없다. sessionStorage를 새로 사용해도 탭 종료 문제를 해결하지 못한다. |
| 권한 | 서버 `RoomLifecycleService.kt:59/103/117/152/192`에서 유효 세션과 `(roomId, guestSessionId)`의 참여자를 조회한다. 한 세션은 여러 방의 HOST 또는 MEMBER를 소유한다. V1 migration은 방별 세션 참여 유일성과 방당 HOST 1명을 강제한다. | 같은 유효 쿠키로 링크를 열면 기존 역할·참여자를 찾는다. 공유 URL이나 같은 표시 이름은 소유권 증명이 아니다. 별도의 방별 hostsecret은 현재 없다. |
| 쿠키 | `RoomLifecycleController.kt:178`은 새 세션에만 `meet_me_guest`를 Set-Cookie로 발급한다. HttpOnly·Secure·SameSite=Lax·Path=/api, Domain 미지정 API host 전용, Max-Age=30일이다. `GuestCredentialService.kt:21`과 `Participant.kt:26`이 서버의 고정 만료·회수도 검사한다. | 일반 프로필의 탭 종료·브라우저 재시작만으로 세션을 잃지는 않는다. 30일은 **최초 세션 발급 기준**이며 모임 생성·방문 때 연장되지 않는다. 오래된 세션에서 만든 새 모임에는 30일 전체가 남지 않을 수 있다. |
| 공유 링크 | `RoomPage.tsx:45`는 현재 origin+방 경로만 복사한다. `RoomPage.tsx:115`의 결과 링크는 현재 전체 URL을 복사한다. `api/client.ts:29`는 credentials: include를 사용하고 화면은 `viewer.role`을 따른다. | 같은 브라우저의 링크 재진입은 권한 복구가 아닌 기존 유효 세션의 재식별이다. 다른 기기·프로필에는 HOST 권한을 전달하지 않는다. 향후에도 모든 공유 기능은 공개 방 경로로 정규화하며 비밀 query/hash를 도입하지 않아야 한다. |
| 세션 손실 | 공개 GET은 쿠키 누락·만료·회수 시 `viewer.joined=false`, role=null을 반환한다. 수집 중이면 웹은 이름 입력·새 참여, 마감 뒤에는 `RoomPage.tsx:27`의 접근 제한 화면을 보여준다. | 이전 이름을 다시 입력해도 수집 중 새 MEMBER가 될 뿐 기존 HOST·내 제출을 되찾지 못한다. 마감된 방은 새 참여가 불가능하고 결과도 기존 유효 참여 세션이 필요하다. |
| 방 데이터 보존 | `DataRetentionConfiguration.kt:16`과 `RoomDataRetentionRepository.kt:26`의 기본 정리는 30일이다. 수집 중 방은 created_at, 마감된 방은 closed_at 기준으로 배치 삭제한다. | 모임 주소 보관·익명 세션·방 자체 보존은 서로 다른 수명이다. 목록에 주소가 있어도 삭제된 방은 열리지 않는다. 운영 환경의 보존 설정 override나 실제 삭제 실행 여부는 이번에 확인하지 않았다. |
| 서버 목록 API | 현재 웹 OpenAPI에 POST `/api/rooms`와 GET `/api/rooms/{inviteCode}` 등은 있으나 현재 세션의 모임을 열거하는 GET 목록 API는 없다. | 쿠키만으로 웹에서 이전 모든 방을 역조회할 수 없다. 목록 도입 이전 모임은 저장한 링크·방문 기록으로 직접 들어와야 웹 이력에 추가할 수 있다. |

핵심 원인은 **주소 발견 UX 부재**다. 쿠키가 남아 있을 때 이를 해결하려고 인증 방식을 바꿀 필요는 없다. **쿠키 손실 이후 소유권 복구**는 별도의 인증·제품 문제로 남는다.

### 로컬 재현과 검증 범위

- 현재 소스로 `corepack pnpm build`가 성공했다. 기존 Zod 순수성 주석 경고는 남아 있다. 별도의 localhost HTTP 모의 API와 격리된 Chrome 프로필에서 실제 웹 production build를 구동했다. mock은 서버 소스에서 확인한 쿠키·유효 세션·HOST/MEMBER 응답 경계를 모사하며 실제 서버·DB·외부 AI는 실행하지 않았다. localhost HTTP의 mock 쿠키만 Secure=false로 했고 운영 Secure/CORS/서브도메인 정책의 실브라우저 통합 검증으로 해석하지 않는다.
- 브라우저의 모든 요청은 실행 중인 localhost origin만 허용하고 외부 요청은 abort하도록 탐색 전에 설정했다. 운영 확인은 별도의 공개 정적 GET뿐이다. 자격 증명·Cookie/Set-Cookie 원문·입력 개인정보를 출력·로그에 남기지 않았다.
- `test-results/anonymous-return-2026-10-04/investigate.mjs`, `evidence.json`, 화면 4장에 재현 절차와 결과를 보존했다. `test-results/`는 기존 gitignore 대상이다. 화면은 가상 모임 정보만 포함한다.

| 로컬 사례 (12개 PASS) | 관찰 결과 |
| --- | --- |
| 생성 직후 | HOST 도구 표시, localStorage/sessionStorage 비어 있음, JavaScript에서 HttpOnly 쿠키가 보이지 않음, 30일 persistent cookie 확인. |
| 공유 없이 탭 닫기 → 새 탭 홈 | 쿠키 유지, 자동 복귀 없음, 기존 방 링크 0개. |
| 같은 프로필에서 공유 URL 재진입 | HOST 도구 표시, 복사 링크는 origin+방 경로뿐이며 query/hash 없음. |
| 같은 세션으로 두 번째 방 생성 | 2개 방·1개 세션, 기존 쿠키의 만료 시각 연장 없음 (mock 및 서버 소스 일치). |
| 실제 Chrome 프로세스 종료 → 같은 격리 프로필로 재시작 | 쿠키 유지, 홈 목록 없음, 주소를 직접 열면 HOST 표시. |
| 웹 localStorage만 삭제 | 쿠키가 유지되므로 직접 링크에서 HOST 유지. |
| 다른 프로필에서 링크 → 기존 주최자와 같은 이름으로 참여 | 새 MEMBER, HOST 도구 없음, mock 주최자 명령은 403. |
| 시크릿 context 종료 → 새 context | 쿠키 없음, 재참여 화면. 실제 다른 기기는 사용하지 않았으며 독립 저장소 동작을 모사했다. |
| 서버 세션 만료, 쿠키는 브라우저에 잔존 | 참여되지 않은 화면. mock 만료값을 바꾸어 재현했으며 실제 30일을 기다리지는 않았다. |
| 쿠키 삭제, 수집 중 방 직접 진입 | 기존 HOST 복구 없음, 이름 입력 화면. |
| 쿠키 삭제, 마감된 방 직접 진입 | 새 참여·결과 열람 불가 안내. |
| 서버에서 방 삭제, 보관 링크 직접 진입 | 방을 불러오지 못함 표시. 삭제는 mock 메모리 fixture만 변경했다. |

브라우저 pageerror 0개, 외부 요청 0개였다. 기능 구현을 하지 않았으므로 전체 기존 E2E/단위 테스트를 반복하지 않았다. 모바일 Safari·실기기·운영 쿠키 발급/DB 통합은 미검증이다.

### 권고안: 계정 없이 최근 모임 주소를 보관

1. 홈에 **“이 기기의 최근 모임”**을 추가하고 각 항목에 **다시 열기 / 링크 복사 / 목록에서 지우기**를 제공한다. 새 모임 만들기 CTA는 유지한다. 여러 모임을 지원하며 마지막 방으로 자동 리다이렉트하지 않는다. 최초 viewport에 다시 열기 진입점이 보여야 하고 목록을 긴 스크롤 설명 아래에만 두지 않는다. 목록 지우기는 서버 모임 삭제가 아니라 이 브라우저의 주소 기록 삭제임을 명시한다.
2. 생성 성공 직후 **화면 이동 전에** 공개 초대 코드를 저장한다. 서버가 참여를 확인한 join 성공 및 GET `viewer.joined=true`에서도 갱신한다. 초대 링크를 단순 조회한 미참여 방문자는 기본적으로 자동 기록하지 않는다. 과거 모임도 직접 URL로 재진입하고 참여가 확인되면 기록할 수 있다. 기존 모임을 웹 이력으로 소급 수집하는 기능은 제공하지 않는다.
3. localStorage에는 버전·invite_code·최근 열람 시각·구분용 최소 표시 이름만 보관하는 안을 권한다. 목적/이름은 선택된 정책에 따라 짧게 보관하고 원문 조건·참여자명·참여자 목록·내 제출·자격 증명·guest credential·hostsecret은 넣지 않는다. URL은 저장된 코드로 고정 origin의 공개 경로를 재구성하고, 목록 입력의 임의 외부 URL은 실행하지 않는다. 캐시된 “내가 만든” 표시가 있더라도 권한 증명으로 사용하지 않는다.
4. 열기 시 기존 GET으로 서버 `viewer`와 상태를 다시 확인한다. 저장된 role/코드만으로 HOST UI·명령·계정 귀속을 인정하지 않는다. 다른 프로필에서 가져온 주소는 참여 링크일 뿐이다. 404는 항목을 사용할 수 없음으로 표시하고 지우기를 제공한다. 네트워크/5xx/429를 만료로 단정해 기록을 자동 삭제하지 않는다. 홈에서 모든 방을 계속 polling하지 않는다.
5. 목록은 **최대 10개·최근 열람 후 30일**을 초기 후보로 제시한다 (사용자 결정 전 미확정). 이는 로컬 기록 정리 기준이고 서버 세션·방의 실제 만료 보장이 아니다. 현재 응답은 세션 expires_at을 제공하지 않으므로 남은 권한 일수나 “이 모임 생성일부터 30일 보장”을 표시하지 않는다. 여러 탭에서는 storage event로 목록을 갱신한다.
6. 생성 직후/방 헤더에서 “이 브라우저의 최근 모임에서 다시 열 수 있어요. 초대 링크도 북마크하거나 나에게 보내 보관해 주세요. 주최자 기능은 모임을 만든 브라우저에서 사용할 수 있어요.”를 안내한다. 저장 성공 확인 후에만 보관됐다고 표시한다. 저장이 차단되거나 용량 오류가 나면 생성·참여 자체는 성공으로 유지하고 “이 브라우저에 목록을 저장하지 못했어요. 링크를 복사해 보관해 주세요.”를 보여준다. 링크 복사로 타인 메시지 전송까지 자동 실행하지 않는다.
7. 한계는 짧게 명시한다: “기록은 이 브라우저에만 저장돼요. 시크릿 모드 종료, 브라우저 데이터 삭제·만료, 다른 기기에서는 이어서 관리하지 못할 수 있어요. 링크 보관만으로 주최자 권한이 이전되지는 않아요.” 쿠키 손실이 확인된 이전 기록에서는 “모임을 만든 브라우저로 다시 열기” 안내를 우선하고, 새 이름 입력이 주최자 복구가 아님을 알린다. 장기간 수동 마감 방은 주최자 세션 만료 후 관리할 수 없을 수 있으며 자동 마감 정책 변경은 이번 최소 범위에 포함하지 않는다.

### 대안과 서버 변경 필요성

| 방안 | 장점 | 한계·비용 | 서버 변경 |
| --- | --- | --- | --- |
| 링크 보관/같은 브라우저 안내만 | 가장 작은 변경, URL 분실을 예방 | 사용자가 복사·북마크 전에 닫으면 반복됨, 여러 모임 발견이 어려움 | 없음 |
| 최근 모임 목록 + 명시적 열기 + 보관 안내 (권고) | 미공유 탭 종료·재시작 후 주소 발견, 여러 모임 선택, 비로그인 경험 유지 | 브라우저 단위 기록, 쿠키 손실·기기 이동의 권한 복구 불가, 도입 전 누락 모임 소급 조회 불가 | 없음: 기존 create/join/get/viewer 계약 사용 |
| 유효 guest cookie에 연결된 서버 모임 목록 | localStorage 삭제 후에도 쿠키가 남으면 소유한 방 목록 재조회 가능 | 목록 API·pagination/정렬·보존/인가 테스트 필요, 쿠키 손실·다른 기기는 여전히 미해결 | 필요: 신규 현재 세션 목록 use case/repository/API |
| 별도 주최자 복구 코드/관리 링크 | 계정 없이 기기 이동 복구를 제공할 수 있음 | bearer secret 유출·폐기·회전·일회성 claim·속도 제한·안전한 전달 UX를 새로 설계해야 함. 현재 1개 쿠키가 여러 방을 소유하므로 이를 복사하면 피해 범위가 큼 | 필요: 인증 계약/ADR/서버 보안 변경. 이번 최소안에서 제외 |
| 로그인 후 주최자 계정:모임 1:N | 계정 기준 여러 기기 목록·지속적 소유권 제공 | OAuth·계정 귀속·게스트 연결·충돌/보존 정책과 기존 데이터 호환 설계 필요 | 필요: Post-MVP 기능으로 분리 |

공유 URL·query/hash·브라우저 이력·clipboard·로그·analytics·localStorage/sessionStorage에 주최자 bearer secret을 넣는 우회는 권고하지 않는다. 현재 HttpOnly guest credential 하나를 꺼내서 방별 “관리 토큰”처럼 사용하지 않는다. 초대 코드는 HOST 권한은 아니지만 공개 메타데이터 열람과 수집 중 참여의 진입점이므로, 최근 모임 기록과 링크 역시 공용 기기·XSS·analytics 노출을 최소화한다. HttpOnly는 XSS의 토큰 원문 읽기를 막는 경계이지 브라우저에서 인증된 요청 실행까지 막는 보장은 아니다.

### 향후 계정 전환 후보 (미확정)

- localStorage는 주소 발견용 캐시로 유지하고 서버의 실제 방·참여자 ID와 기존 invite_code를 보존하는 전환을 권한다. 현 V1 스키마의 참여자는 guest_session_id가 필수이므로 계정 소유권 모델·migration·일대다 목록 API는 별도 작업이다. 지금 계정 흉내용 식별자나 로컬 role을 권한 모델로 추가하지 않는다.
- 나중에 로그인한 사용자가 명시적으로 “이 브라우저에서 만든 모임을 내 계정에 연결”할 때, 서버가 로그인 신원과 **현재 유효한 익명 세션의 실제 HOST 참여**를 모두 검증한 방만 귀속시켜야 한다. localStorage 목록, 초대 URL, 같은 표시 이름은 소유권 증거가 아니다. MEMBER 참여 연결은 HOST 방 귀속과 별도 범위로 결정한다.
- 한 번에 모든 소유 방을 옮길지 선택한 방만 옮길지, 이미 계정에 귀속된 방의 충돌·재귀속 금지, 계정 전환 후 익명 쿠키의 접근 유지/폐기, 원자적 연결과 중복 요청, 계정 로그아웃 및 공용 기기, 기존 데이터의 30일 보존을 유지할지 함께 합의해야 한다. 쿠키를 이미 잃거나 세션/방이 만료·삭제된 데이터의 자동 복구를 약속하지 않는다.

### 사용자 결정사항과 다음 검증

- 권고 범위인 **프론트 recent 목록 + 보관/한계 안내**만 먼저 구현할지, **유효 익명 세션 서버 목록 API**까지 추가할지 결정한다. 최소안은 서버 작업 완료를 기다릴 인증 계약 의존성이 없으며 이번 별도 후보 로직 검증과 분리할 수 있다.
- 기록 대상을 “생성 + 참여 확인된 모임” 모두로 할지 주최한 모임만으로 시작할지 결정한다 (권고는 둘 다). 제목/목적의 로컬 보관 허용 여부와 표시 길이, 최대 10개·최근 30일 정리, 공용 기기에서 개별/전체 지우기 제공 범위를 정한다.
- 시크릿·다른 기기·쿠키 삭제 후 주최자 복구를 이번 범위에서 제외할지 확인한다 (권고는 제외). 이 복구까지 요구하면 최소 UX 변경을 넘어 별도 인증 설계가 필요하다. 장기 계정 전환은 후속 설계로 유지한다.
- 구현 승인 후에는 저장 성공·실패·손상/버전·중복/정렬·목록 제한·생성 성공 후 즉시 닫기·같은 프로필 재시작·여러 탭·기존 URL 재진입·localStorage만 삭제·cookie만 삭제·만료·404/일시 오류·다른 프로필의 HOST 오인 방지·공유 링크 비밀값 부재를 작은 관련 테스트와 실제 브라우저로 검증한다. 당시 변경 범위에 맞는 repo 체크를 실행하고 원격 출판은 별도 요청 범위에서만 한다.
## 2026-10-05 — companion 게시·배포 승인 확인

- 사용자가 이 작업 대화에서 직접 `승인`을 보냈다. 바로 앞에 제시한 승인 범위는 `meet-me-duo/meet-me-web`의 최근 모임 복귀와 두 미반영 사유 한국어 안내를 독립 PR로 진행하는 이슈 생성·연결, 커밋·푸시·PR 생성·main 병합·`app.meet-me.co.kr` 배포다. Companion 웹을 먼저 배포해 운영 공개 번들을 목 API로 검증하고 서버 배포를 조율한다. 운영 방 생성·데이터 쓰기나 인프라·권한 설정 변경은 포함하지 않는다.
- 게시 전 읽기 전용 점검에서 두 worktree는 clean, 최근 모임 HEAD `615cc4c`, companion HEAD `5708f81`, 원격 main은 기준 `90908b6`과 일치했다. 두 feature 원격 브랜치와 PR은 없었고 최근 모임 이슈 #7은 열려 있다. 이전 검증 대상 코드에 변경이 없음을 확인했으며 companion 필수 검사를 다시 실행한다. 기존 정책 파일은 수정하지 않는다.

## 2026-10-04 — 미반영 입력 사유 한국어 안내 (별도 companion)

- 사용자 추가 승인 범위에 따라 서버 작업과 연결되는 최소 웹 안내를 로컬에서 구현했다. 원격 main 조회값과 로컬 main이 `90908b626ec2ef7571ad312398a3cc43f8503713`으로 일치함을 확인하고, `meet-me-web-conditional-reason` 별도 worktree의 `feature/conditional-constraint-notice`를 main에서 만들었다. 기존 최근 모임 작업은 원래 `meet-me-web` worktree의 `feature/anonymous-room-return-investigation`, HEAD `615cc4c`에 그대로 보존한다. 두 기능을 섞지 않았다.
- 조율자가 확정한 `UNSUPPORTED_CONDITIONAL_CONSTRAINT`는 현재 스키마로 시간·장소의 조건별 연결을 처리하지 못한다는 뜻이고, `AMBIGUOUS_TIME_CONSTRAINT`는 가능한 시간 경계를 결정할 수 없다는 뜻이다. 기존 HOST 미반영 입력 목록에서 두 코드를 각각 한국어 설명으로 표시하며 해당 입력이 후보 계산에 반영되지 않았음을 밝힌다. 조건별 장소를 독립된 목록으로 바꾸도록 유도하거나 가능한 시간을 추정하지 않는다.
- 기존 `LEGACY_MANUAL_ONLY_UNSUPPORTED` 안내를 유지한다. 알 수 없는 사유는 서버 문자열을 그대로 표시하고 `Object.hasOwn`으로 `toString` 같은 프로토타입 이름도 정상 fallback 처리한다. `reason`은 기존 OpenAPI의 문자열 필드이므로 snapshot·생성 타입·API 계약 변경은 없다. 서버 파일·정책·저장소 workflow는 수정하지 않았다.
- 변경 범위는 `src/pages/RoomPage.tsx`, `e2e/submission.spec.ts`, 이 작업 기록이다. NO_MATCH와 READY_WITH_WARNINGS 각각에서 HOST의 두 사유 안내·nullable legacy 원문, MEMBER의 타인 원문 미요청·미표시, 알 수 없는 사유 fallback을 검증했다. PARTIAL 후보 0개 fixture에서도 후보/확정 버튼을 만들어내지 않으며 서버의 `2/4개 반영` 숫자를 보존한다. 기존 READY_WITH_WARNINGS의 일반 제목·설명은 이 최소 사유 매핑 범위에서 변경하지 않았다.
- 최종 `corepack pnpm api:check`, `lint`, `typecheck`, `test`, production `build`가 통과했다. 단위/컴포넌트/API 테스트 39개와 desktop/mobile 전체 E2E 99개가 통과했고 기존 모바일 전용 검사의 desktop 실행 1개는 조건부 skip이다. Zod 주석 위치에 대한 기존 build 경고는 남아 있다. E2E는 모든 API를 로컬 fixture로 처리했고 운영 방 생성·데이터 변경은 하지 않았다.
- 첫 E2E는 4173에서 다른 worktree의 기존 preview를 재사용해 새 안내 4개가 실패했다. 해당 프로세스를 중단하지 않고 ignored 임시 Playwright 설정에서 이 worktree를 cwd로 명시하고 별도 4177 서버를 실행해 수정했다. 임시 설정 첫 실행의 상대 cwd 오류도 고친 뒤 최종 전체 검사를 통과했다. 저장소의 공식 Playwright 설정은 변경하지 않았다. 실제 모바일 기기·Safari는 검증하지 않았다.
- 최종 화면 12장 중 desktop NO_MATCH 시간 모호 안내, mobile READY_WITH_WARNINGS 조건 연결 안내와 후보 0개 화면을 직접 검토했다. 사유의 한국어 줄바꿈과 원문·숫자·버튼 경계를 확인했다. 캡처·임시 설정·로컬 PR 본문은 `test-results/conditional-reason-2026-10-04/`에 보존한다. 서버 테스트 결과는 조율자로부터 전달받았으며 이 worktree에서 서버 검사를 실행하지 않았다.
- 이번 companion 작업은 로컬 커밋·PR 본문 준비까지만 수행한다. 원격 issue/branch/push/PR/merge/deploy는 실행하지 않으며, 기존 최근 모임 push의 자동 승인 거절도 재시도하지 않는다. 운영에는 아직 이 안내와 새 서버 로직이 반영되지 않았다.

## 2026-10-04 — scrollytelling 재설계 진행 상태

- 사용자는 로컬 `96fdbf9`의 GIF를 보고 보통 스크롤 속도에서 효과가 너무 짧고 미미하다고 피드백했다. 현재 브랜치는 `feature/scroll-content-reveal`이며 이 커밋은 미게시 상태다. 후속 범위는 로컬 scrollytelling/parallax 구현·미리보기·일반/빠른 스크롤 검증으로 한정하고 push/PR/merge/deploy는 하지 않는다.
- 현재 구조는 문장·카드의 짧은 CSS entry 범위에서 clip과 위치를 바꾸므로 휠·스와이프가 큰 경우 단계가 쉽게 지나간다. 첫 hero/CTA·브랜드·기존 기능 설명 카피는 유지한다. 설명 장면은 sticky stage로 충분히 머무르게 하고 전경·배경의 이동량을 달리하며 단계별 설명 전환을 설계한다. 스크롤 가로채기·잠금·강제 snap은 사용하지 않는다.
- 부모가 조사한 실제 참고 사이트를 전달하면 관찰한 상호작용 원리를 반영해 구현한다. 참고 수신 전에는 구조 확인과 설계·검증 준비만 진행한다. reduced-motion·CSS/JS 실패·키보드·짧은 viewport에서는 내용이 자연스럽게 읽히는 fallback을 유지한다. 검증은 작은 delta의 느린 시연 대신 일반 wheel/trackpad delta와 빠른 모바일 스와이프에 해당하는 입력·영상으로 수행한다.
- 참고 수신 후 [Firewatch](https://www.firewatchgame.com/)의 뚜렷한 레이어 속도 차이, [Pudding](https://pudding.cool/process/scrollytelling-sticky/)의 sticky 무대, [Deep Sea](https://neal.fun/deep-sea/)의 현재 위치로 완결된 상태를 이해하는 원리를 반영했다. 이미지·코드는 복제하지 않았다. 기존 문구·아이콘·팔레트를 사용한 `LandingStory`로 기존 세 기능 설명을 보여준다. hero/CTA·방 생성·결과 화면은 유지한다.
- desktop 400svh·mobile/tablet 320svh의 한 구간 안에서 CSS sticky 무대가 머문다. 고정 무대 높이를 뺀 실제 진행거리(PC 약 300vh·모바일 약 220vh)를 세 읽기 구간으로 나누며 160~220ms 전환 외에는 완결된 문장을 계속 보여준다. 전경 이동 범위는 PC 190px/작은 모바일 100px, 원경은 520px/360px로 속도 차이를 둔다. 현재 절대 스크롤 위치로 0~1 진행도와 현재 단계를 계산하므로 큰 점프·역스크롤에도 중간 이벤트 순서에 의존하지 않는다.
- JS는 passive scroll/resize + requestAnimationFrame만 사용하며 스크롤을 취소하거나 감속하지 않는다. 단계 버튼은 키보드로 다시 읽을 수 있고 현재 단계를 aria-current로 표시하며 보이지 않는 패널은 aria-hidden/inert 처리한다. reduced-motion·높이 540px 미만·sticky/RAF 미지원·확대된 본문이 무대에 안 들어오는 경우에는 일반 흐름의 세 정적 패널을 제공한다. 장식 이동으로 발생하는 넘침과 본문 높이를 구분하고 전경 장식은 무대 안에서 clip한다.
- 기존 api:check·lint·typecheck·단위 테스트 39개·build가 통과했다. 최종 실제 Chrome desktop/mobile 전체 E2E는 81개 통과, 기존 모바일 전용 desktop 검사 1개 조건부 skip이다. sticky 위치 유지·같은 설명의 읽기 구간·원경/전경 이동량 차이·240px wheel·빠른 단계 점프·역스크롤·키보드 버튼/End·RAF 실패·reduced-motion·짧은 화면을 검증했다.
- 실제 Chrome 153.0.8010.54에서 이전과 같은 11개 viewport의 최초 hero/CTA, 각 완결된 설명 상태, 페이지 끝·가로넘침·200% 텍스트·sticky 미지원·RAF 실패를 확인했다. 320/360/390/430폭 모바일·768×1024·1440×900·1280×600는 sticky 활성, 높이 480/390/320의 짧은 화면·가로모드는 정적 fallback이다. 페이지 오류는 0개였다.
- 정상/빠른 스크롤 영상은 PC wheel 240px/220ms 및 900px/90ms, 모바일 native touchStart/Move/End(12회×35ms 및 8회×15ms)로 기록했다. 모바일은 viewport의 65%를 드래그하고 들어 올리기 전 100ms 멈추어 끝 상태를 읽으며 실제 브라우저 스크롤을 사용한다. 모든 영상은 현재 위치에 맞는 마지막 완결된 장면으로 끝나고 단계 버튼으로 재방문할 수 있다. GIF는 캡처 타임스탬프 간격을 유지한다. 영상·GIF·전경/원경 측정·viewport 화면·스크립트는 `test-results/landing-scrollytelling-2026-10-04/`에 보존한다. 실제 휴대전화 관성·주소창·Safari는 미검증이다. 기존 로컬 preview 4187을 재사용했으며 원격 push/PR/merge/deploy는 수행하지 않았다.

## 2026-10-04 — 설명 콘텐츠 스크롤 등장 후속 수정

- 운영 Chrome 확인 후 사용자가 밝기 변화보다 설명이 숨겨진 상태에서 스크롤에 따라 분명하게 나타나는 동작을 요청했다. 배포된 main `4690e53`의 깨끗한 상태에서 로컬 `feature/scroll-content-reveal` 브랜치로 후속 작업을 시작했다. 이번 범위는 로컬 구현·미리보기·검증이며 원격 push/PR/merge/deploy를 포함하지 않는다.
- 문장별 가로 clip 공개와 32px 위치 이동, 카드별 세로 clip 공개와 64px 위치 이동으로 변경한다. 첫 상태는 opacity 0이고 PC의 같은 줄 카드도 순서대로 시작한다. 기존 CSS view timeline을 사용하여 새 JavaScript·observer·스크롤 잠금 없이 구현하며 미지원 CSS·reduced-motion에서는 정적인 전체 내용을 제공한다.
- 검증 계획: 실제 Chrome의 모바일 320/360/390/430폭·태블릿·PC·짧은 화면·가로모드에서 최초/진입 중/완료 상태, 페이지 끝에서 모든 콘텐츠 공개, 키보드·높이 변화·fallback을 확인하고 PC/모바일 스크롤 동영상과 GIF를 보존한다. 기존 API 검사·lint·typecheck·단위 테스트·build·E2E를 실행한다.
- 실제 Google Chrome 153.0.8010.54에서 320×568, 360×640, 390×844, 430×932, 768×1024, 1440×900, 320×480, 844×390, 568×320, 844×320, 1280×600의 초기 숨김·진입 중 clip/이동·페이지 끝 전체 공개를 확인했다. 모든 크기에서 가로넘침·브라우저 오류가 없으며 reduced-motion·observer 부재·CSS timeline 미지원 fallback·200% 텍스트·높이 변경·Tab/Enter 이동이 통과했다.
- 기존 api:check·lint·typecheck·단위 테스트 39개·build가 통과했다. 전체 E2E를 기존 desktop/mobile 설정에 실제 Chrome channel만 임시 지정해 실행했고 79개 통과, 기존 모바일 전용 검사의 desktop 1개는 조건부 skip이다. Chrome clip 완료값의 0px/0% 직렬화 차이는 각 inset 수치가 0인지 확인하는 방식으로 검증했다. 실제 스크롤 좌표의 정수 반올림을 고려하여 범위 끝을 충분히 넘긴 완료 상태와 페이지 끝을 모두 확인했다.
- 스크롤은 테스트의 실제 wheel 입력으로 기록했다. PC/모바일 WebM 동영상, 그 프레임으로 만든 GIF, 전·중·후 화면과 측정·검증 스크립트는 `test-results/landing-content-reveal-2026-10-04/`에 보존한다. 실제 휴대전화 주소창·Safari는 미검증이며 운영 반영은 이번 요청 범위에 없다.

## 2026-10-04 — 스크롤 랜딩 UI

- 최신 원격 main을 조회해 `b7bb7a5`와 일치하고 사용자 변경이 없는 것을 확인한 뒤 로컬 `feature/scroll-landing-hero` 브랜치에서 작업했다. 서버 저장소는 수정하지 않았다.
- `/`의 최초 화면은 기존 브랜드 헤더 아래 요청 문구와 기존 모임 만들기 CTA에 집중한다. 배지와 설명 문장·기능 카드·진행 단계는 다음 스크롤 영역으로 옮겼다. `/create` 생성 동작과 `/rooms/:inviteCode` 결과 화면은 유지했다.
- hero CTA는 기존 팔레트의 `#0369a1` 단색·흰 글자로 강조했다(실브라우저 대비 5.93:1). 높이 56px, PC 중앙 너비 224px, 모바일 본문 전체 너비, 제목과의 간격 36px를 적용했다. 키보드에는 대비가 높은 3px 포커스 링을 표시하고 hover/active의 작은 이동·그림자 반응은 reduced-motion에서 이동 없이 동작한다. 다른 버튼·브랜드 문구·생성 동작은 유지했다.
- hero에 `100svh`와 `100vh` fallback을 사용해 모바일 주소창에 가려지지 않는 최초 화면 높이를 확보하고 주소창 접힘에 따른 재배치를 줄였다. 한국어 `keep-all`, 균형 줄바꿈과 유동 글자 크기로 고아 단어·가로넘침을 방지하고 높이 500px 이하에는 제목과 여백을 조정했다. 확대 시에는 고정 높이 없이 자연스럽게 스크롤할 수 있다.
- 설명 문장·각 기능 카드·진행 단계는 지원 브라우저에서 각각 CSS `view()` 타임라인으로 점진적으로 나타난다. opacity .35→1과 translateY 20px→0이 화면 진입량에 따라 실제로 변하는 것을 PC·모바일에서 검증했다. 스크롤 잠금·snap·observer·추가 JavaScript는 사용하지 않으며 미지원 브라우저와 reduced-motion에서는 정적으로 표시한다. 기존 키보드 포커스와 생성 폼 진입 동작을 확인했다.
- 실제 Microsoft Edge의 desktop/mobile Playwright 프로젝트에서 320×568, 360×640, 390×844, 430×932, 768×1024, 1440×900, 320×480, 844×390, 568×320, 844×320, 1280×600의 최초 화면·스크롤 후를 검증했다. CTA가 최초 뷰포트 안에 있고 설명은 다음 영역에 있으며, 모든 크기에서 제목 두 줄·가로넘침 없음·자연 스크롤을 확인했다. 뷰포트 높이 664→844→564 변경, Tab/Enter, observer 부재, reduced-motion 및 200% 텍스트 확대도 확인했다. 실제 휴대폰 주소창과 Safari는 검증하지 않았다.
- lint·typecheck·build 및 단위/컴포넌트/API 39개가 통과했다. CTA 강조 후 최종 전체 E2E는 75개 통과, 기존 모바일 전용 검사의 desktop 실행 1개 조건부 skip이다. CTA 색 대비·Tab/Enter 진입·hover/active·reduced-motion과 기존 11개 뷰포트·스크롤 reveal을 검증했다. 브라우저 좌표 계산의 0.0001px 미만 오차를 고려해 높이·너비 검사는 0.005px 미만 허용치를 사용한다. build의 기존 Zod 순수성 주석 경고는 남아 있다.
- `api:check`의 기존 실패 경로는 사용자 `core.autocrlf=true` → 생성 타입 체크아웃 CRLF 1,281개 → 생성기 출력 LF → 검사 스크립트의 원문 비교였다. `.gitattributes`에서 `src/api/schema.d.ts` 한 파일만 `text eol=lf`로 고정하고 실제 내용 차이가 없음을 확인한 뒤 Git blob의 LF 바이트로 복원했다. 원래 `corepack pnpm api:check`가 통과하고 생성 타입과 검사 스크립트의 Git diff는 없다. 전역 Git 설정과 API 계약은 유지했다. 별도 복사본에서 타입명을 `paths_stale_probe`로 바꾼 음성 검사는 exit 1과 stale 오류로 실패해 실제 차이를 계속 탐지함을 확인했다. Git blob·생성 결과 SHA-256은 `0a3ef82998746b79ac898396aa336feb0d9ee618771aafd41aaf58d34023aed5`다.
- 전후 화면과 뷰포트 측정·API 줄바꿈 증거는 `test-results/landing-ui-2026-10-04/`에 보존한다. 작업 범위는 로컬 구현과 검증이며 원격 push·PR·merge·배포는 실행하지 않았다.
- CTA 강조 화면 8장과 측정값은 `test-results/landing-cta-2026-10-04/`에 보존했다. 민감정보가 없는 대표 PC·모바일 최초화면은 Library에 `cta-desktop-initial.png`와 `cta-mobile-390-initial.png`로 저장했다.

## 2026-10-03

- 조건 입력에서 수동 타임테이블·선택 상태·구간 변환과 입력 전용 CSS·테스트를 제거하고 자연어만 제출·복원·수정하도록 변경했다.
- ECMAScript trim 후 1~500 Unicode 코드포인트 검증과 카운터를 일치시켰다. 내부 공백은 보존하며 UTF-16 `maxLength`는 사용하지 않는다.
- 기존 null 원문에는 자연어 재입력 안내를 표시하고 자동 저장하지 않는다. HOST의 NO_MATCH·부분 결과에 nullable 원문과 legacy 미반영 사유를 표시하며 MEMBER의 타인 원문 요청은 차단한다.
- 방 날짜 범위와 후보·확정 결과의 읽기 전용 시간 표시는 유지한다. 서버 호환 계약의 deprecated 수동 응답 필드는 웹에서 읽거나 전송하지 않는다.
- trim 공통 문자집합·코드포인트 경계, 제출·재조회·수정, 실패 시 입력 보존, legacy 안전 로드, 원문 공개 경계와 desktop·mobile 목 API UI 검증을 추가했다.
- lint·typecheck·단위/컴포넌트/API 테스트 39개와 build가 통과했다. 기존 서버 응답·raw_text-only 및 U001C trim 차이 fixture를 포함한 목 API Playwright는 desktop·mobile 43개 통과, desktop에서 모바일 전용 기존 사례 1개 조건부 skip이며 캡처에서도 신 웹의 타임테이블 부재를 확인했다.
- 운영 구 웹 번들 `index-CLvXuy6n.js`를 공개 정적 GET으로 로드하고 탐색 전에 모든 API를 목 처리했다. desktop/mobile에서 nonempty manual의 400 detail에 새로고침·자연어 재입력 안내가 표시되고 실패 전후 revision #7 및 재조회 원문이 유지됨을 확인했다. 실제 API 요청·쿠키·운영 데이터 쓰기는 하지 않았다. 임시 스크립트·캡처·네트워크 증거는 test-results에만 저장했다.
- 일반 자연어의 구 서버 호환성을 확인해 웹 선배포→운영 웹 번들의 목 API 확인→서버 배포 순서를 문서화했다. 오래 열린 구 웹의 수동 요청 거부는 계속 필요하며, U001C~001F trim 및 전환 중 legacy의 구 matching 동작은 별도로 기록했다.
- 실제 서버 생성 OpenAPI SHA-256 `72ade61680b6f2e245eab9216ec168806d196e6bebb8774fc160a606e7e87c46`(24,178 bytes)를 직접 확인해 snapshot/schema를 동기화했다. deprecated 수동 요청 필드의 array/null·빈 items·maxItems 0·ref 없음, PUT 원문 필수 및 성공 non-null, GET·미반영 원문 nullable, CandidateTimeRangeResponse 불변을 assertion으로 검증했다.
- 최종 `api:check/lint/typecheck/test/build/test:e2e`가 모두 통과했다. 단위/컴포넌트/API 39개, desktop/mobile E2E 43개 통과·모바일 전용 기존 사례의 desktop 실행 1개 조건부 skip이다. 소스 검토에서 자연어만 전송, 자동 저장 없음, 공개 범위 및 읽기 전용 시간 표시 경계를 확인했다.

### 게시 상태

- 기능 구현 커밋은 `911785c6ec39a66b86a99314c14ae5c7663abc17`, 브랜치는 `feature/natural-language-only-submission`, 웹 draft PR은 [#4](https://github.com/meet-me-duo/meet-me-web/pull/4)다. 구현 커밋의 verify CI가 성공했으며 문서 정리 커밋의 head도 PR checks에서 확인한다. 기능/API 검증 결과와 배포 순서는 위 기록을 유지한다.
- 현재 main merge·운영 배포는 미실행이다. 조율자의 PR/CI 검토 완료 신호 전에는 ready/merge/deploy하지 않으며, 웹 배포→새 실제 공개 번들의 모든 API 목·unknown 차단 검증→서버 배포 순서로 진행한다.

## 2026-09-20

- 빈 저장소에 React/TypeScript/Vite 기반 SPA를 구성했다.
- 운영 `/v3/api-docs`를 `openapi/meet-me.openapi.json`에 저장하고 생성 타입 검증을 추가했다.
- 프로토타입 디자인을 기반으로 랜딩과 2단계 방 생성 흐름을 구현했다.
- 익명 참여, 제출 복원·수정, 날짜/주간 시간 격자, 수동 마감과 조기 마감 확인을 구현했다.
- 전체 공개 상태와 HOST 전용 재분석·부분 결과·후보 확정, 참여자 결과 화면을 구현했다.
- 2초 분석 polling, 수집 중 갱신, 최대 5초 네트워크 retry delay와 화면 이탈 취소를 적용했다.
- 데스크톱과 Pixel 7 Playwright 흐름, 타입 검사, lint, 단위 테스트와 production build를 통과했다.
- GitHub Actions CI/CD와 S3·CloudFront·Route 53·ACM·최소 권한 OIDC Terraform을 추가했다.
- 운영 API가 `https://app.meet-me.co.kr`에 정확한 credential CORS 헤더와 RFC 9457 응답을 반환하는 것을 읽기 전용 요청으로 확인했다.
- Terraform `fmt`와 `validate`, 데스크톱·Pixel 7 실제 Edge 렌더링을 확인하고 모바일 hero 줄바꿈을 보정했다.
- AWS에 비공개 S3, CloudFront OAC, ACM, Route 53 `app` 레코드, WAF와 프론트 전용 GitHub OIDC 역할을 적용했다.
- production build를 업로드해 `https://app.meet-me.co.kr`의 HTTPS 200, 관리형 보안 헤더와 SPA 직접 진입을 확인했다.
- GitHub immutable OIDC와 `production` Environment를 구성했고 CI·production 자동 배포 성공을 확인했다.
- CloudFront·IP rate-limit WAF·Route 53 zone을 월 $0 `FREE / ACTIVE` 정액 플랜에 연결했다.

## 남은 운영 체크포인트

- 첫 배포 후 운영 Origin의 credential CORS와 Secure HttpOnly cookie 실브라우저 검증

## 2026-10-05 — UX 감사 #11 구현 완료 및 단계 인계

- 승인 범위: 사용자의 '추천대로 진행해'에 따른 구현·테스트·기존 Worklog 기록. 추가로 기존 PC gh CLI 인증을 사용한 이슈 생성이 직접 승인되었다. GitHub App 이슈 생성의 403 이후 승인된 gh 경로로 #11/#12/#13을 생성했으며 인증·앱 설치·권한 설정은 변경하지 않았다.
- 현재 worktree: `C:\Users\jinhy\Documents\Codex\2026-10-05\task-3\accuracy`. 현재 브랜치: `feature/11-accurate-plan-and-save-state`. 현재 HEAD/기준 main: `d9724d56205705647062da29c6e333a255152cd3`. 아래 변경은 모두 미커밋 상태이며 커밋·push·PR·merge·배포를 실행하지 않았다.
- 이슈 [#11](https://github.com/meet-me-duo/meet-me-web/issues/11)만 구현했다. 후보 0개/일부 반영/복수 시간대와 선택 완료를 정확히 안내하고, 실제 날짜·시간·상세 장소 또는 접속 정보는 주최자가 별도 공지한다고 선택 버튼 가까이 표시한다. 후보 개수와 기존 partial 원클릭 정책 및 API 계약은 유지한다. HOST 미반영 원문 공개 정책에 맞춘 입력 안내, 저장 후 dirty 표시, 저장과 분석 완료 구분, PUT 성공 후 GET 실패 구분, 저장 중 편집과 refetch 시 미저장 입력 보존을 구현했다.
- 변경 파일: `src/pages/RoomPage.tsx`, `src/components/CandidateCard.tsx`, `src/styles.css`, `src/pages/RoomPage.test.tsx`, `e2e/room-states.spec.ts`, `e2e/submission.spec.ts`, 신규 `e2e/plan-accuracy.spec.ts`와 본 Worklog. 생성 폼은 변경하지 않았다.
- 검증: 구현 전 신규 회귀 7건 실패(기존 46건 통과)를 확인한 뒤 구현했다. 최종 `api:check`, `lint`, `typecheck`, 단위 53건, `build`, 전체 desktop/mobile E2E 157건 통과 및 기존 조건부 skip 1건. 신규 로컬 mock E2E 36건은 1440/320/390에서 dirty/실패/재시도/저장 중 편집/새로고침/부분 후보/0개/복수 후보/선택을 확인한다. 운영 데이터 생성 없음. `git diff --check` 통과. 최초 typecheck의 공유 node_modules .tmp 쓰기 EPERM은 workspace 안의 캐시 분리로 해결했으며 제품 실패와 구분한다.
- 검증 설정 및 이미지: `test-results/accuracy-2026-10-05/playwright.config.ts`, `test-results/accuracy-2026-10-05/e2e-output/`. JSON 리포트 실제 경로는 `test-results/accuracy-2026-10-05/test-results/accuracy-2026-10-05/e2e-report.json`. 결과/저장 화면은 겹침·수평 잘림 없이 확인했으며 모바일 카드 압축 및 짧은 제목의 줄바꿈 개선은 #13에서 다룬다.
- [#12](https://github.com/meet-me-duo/meet-me-web/issues/12)는 이슈만 생성했고 구현/브랜치 생성 전이다. 제출 완료 후 HOST 공유/MEMBER 대기 중심, 수정 보조 동선, 모든 설정 마감 조건 표시, 복사 성공 피드백, READY 참여자의 CONFIRMED 갱신을 구현할 예정이다. READY polling 중단은 기존 소스에서 1440/320/390 모두 재현했다(GET 2→2, 새로고침 이후 CONFIRMED). 재현 기록: `C:\Users\jinhy\Documents\Codex\2026-10-05\task-3\ux-evidence\ready-polling-reproduction.json`. 이 결함은 아직 수정하지 않았다.
- [#13](https://github.com/meet-me-duo/meet-me-web/issues/13)도 이슈만 생성했고 구현/브랜치 생성 전이다. 자동/직접 마감 방식 구분, 실제 기본 14일 날짜 및 선택적 변경, 포함 마지막 날짜→API exclusive end의 timezone/경계 검증, 모바일 압축/주행동/44px 터치 영역/15px 설명 펼침을 다룬다. 날짜 하나 최종 확정·실제 참여 현황 API·구조화 해석 미리보기는 제외한다.
- 다음 세션: 세 이슈를 한 브랜치에 섞지 않는다. #11을 본 worktree에 보존한 채 프로젝트 승인 규칙에 맞춰 먼저 검토 가능한 결과를 처리하고, #12 및 #13은 각각 독립 feature 브랜치/worktree에서 작업한다. 공통 RoomPage 변경 때문에 #11 통합 여부를 확인한 기준 HEAD에서 새 worktree를 만들고 변경 충돌을 검토한다. 미커밋 #11을 다른 이슈 브랜치로 운반하거나 reset하지 않는다. PR을 만들게 되면 draft와 H2 `변경사항`/`검증`, `Closes #11` 형식을 따른다. 최종 merge·배포는 이번 승인 범위 밖이다.
- 원본 web main/develop 소스는 수정하지 않았으며 서버 코드는 수정하지 않았다. 서버 `implementation_plan.md`의 기존 사용자 변경을 보존한다. 전체 재개 문맥은 `C:\Users\jinhy\Documents\Codex\2026-10-05\task-3\implementation-handoff.md`에도 기록한다. #11 완료 단계에서 부모에게 다음 구현 세션 인계를 요청한다.

## 2026-10-05 — UX #11 커밋·Draft PR 준비 승인

- 부모 대화 `01a0f13c-c38d-764e-994b-900a645ca035`에서 “#11 → #12 → #13 순서로 커밋·푸시하고 별도 Draft PR 세 개를 만들어 CI까지 확인” 요청에 사용자가 `진행해`로 직접 승인했다. 이번 범위는 커밋·feature push·Draft PR·정확한 SHA의 verify CI 확인이다. 최종 병합·운영 배포·auto-merge 설정은 제외한다.
- 최신 원격 main과 로컬 기준은 `d9724d56205705647062da29c6e333a255152cd3`이며 같은 feature/PR은 없었다. 기존 gh CLI 인증과 저장소 push 권한을 확인했으며 새 인증·권한·전역 Git 설정은 변경하지 않는다. feature push/PR에는 배포 트리거가 없고 main merge가 운영 배포를 실행한다.
- 원본 diff 및 변경·신규 파일의 SHA-256을 최신 인계와 대조하고 별도 백업했다. 이번 커밋은 이 이슈의 원본 구현·테스트·기록만 보존한다. 기존 로컬 검증은 단위 53개 / E2E 157개 통과 + 기존 skip 1개, API/lint/typecheck/build 및 diff 검사 통과이며 이번 기록을 새 테스트 실행으로 표시하지 않는다.
- 공통 RoomPage/CSS/기록 충돌은 #11 → #12 → #13 stacked PR으로 준비하며 각 PR의 diff는 직접 앞 브랜치를 기준으로 해당 이슈 변경만 표시한다. main 반영 전후에는 다음 PR의 기준·diff·CI를 재확인한다. 실제 AI·운영 backend/DB·HTTPS 쿠키/CORS·실모바일 Safari는 미검증이다. Commit/PR: 동일 커밋 예정, 실제 SHA/URL은 Git 이력과 후속 인계에서 확인한다.

## 2026-10-05 — UX #12 커밋·Draft PR 준비 승인

- 부모 대화 `01a0f13c-c38d-764e-994b-900a645ca035`에서 “#11 → #12 → #13 순서로 커밋·푸시하고 별도 Draft PR 세 개를 만들어 CI까지 확인” 요청에 사용자가 `진행해`로 직접 승인했다. 이번 범위는 커밋·feature push·Draft PR·정확한 SHA의 verify CI 확인이다. 최종 병합·운영 배포·auto-merge 설정은 제외한다.
- 최신 원격 main과 로컬 기준은 `d9724d56205705647062da29c6e333a255152cd3`이며 같은 feature/PR은 없었다. 기존 gh CLI 인증과 저장소 push 권한을 확인했으며 새 인증·권한·전역 Git 설정은 변경하지 않는다. feature push/PR에는 배포 트리거가 없고 main merge가 운영 배포를 실행한다.
- 원본 diff 및 변경·신규 파일의 SHA-256을 최신 인계와 대조하고 별도 백업했다. 이번 커밋은 이 이슈의 원본 구현·테스트·기록만 보존한다. 기존 로컬 검증은 단위 56개 / E2E 187개 통과 + 기존 skip 1개, API/lint/typecheck/build 및 diff 검사 통과이며 이번 기록을 새 테스트 실행으로 표시하지 않는다.
- 공통 RoomPage/CSS/기록 충돌은 #11 → #12 → #13 stacked PR으로 준비하며 각 PR의 diff는 직접 앞 브랜치를 기준으로 해당 이슈 변경만 표시한다. main 반영 전후에는 다음 PR의 기준·diff·CI를 재확인한다. 실제 AI·운영 backend/DB·HTTPS 쿠키/CORS·실모바일 Safari는 미검증이다. Commit/PR: 동일 커밋 예정, 실제 SHA/URL은 Git 이력과 후속 인계에서 확인한다.

## 2026-10-06 — UX #12 stacked Draft PR 통합 준비

- 원본 이슈 구현 커밋을 보존한 뒤 `feature/11-accurate-plan-and-save-state`를 병합했다. 부모 이슈의 커밋과 원본 구현 이력을 유지하며 main/develop·서버 사용자 파일은 변경하지 않았다. 공통 작업 기록은 양쪽 기록을 모두 보존했다.
- 제품/테스트 충돌은 최신 로컬 통합 인계의 파일을 기준으로 해당 이슈 범위에만 해결했다. #12 PR의 base는 `feature/11-accurate-plan-and-save-state`이며 직접 부모 대비 diff에 해당 이슈 변경만 표시한다. #11 → #12 → #13 순서로 별도 승인 후 병합하고 main 전환 시 diff·최신 SHA CI를 다시 확인한다.
- 이 단계의 검증 결과와 최종 head/PR/CI는 후속 인계와 PR 본문에 기록한다. 기존 원본 및 통합 로컬 검사 결과와 이번 재실행 결과를 구분한다. 운영 배포·auto-merge·운영 데이터 생성 없음.

## 2026-10-05 — UX #13 커밋·Draft PR 준비 승인

- 부모 대화 `01a0f13c-c38d-764e-994b-900a645ca035`에서 “#11 → #12 → #13 순서로 커밋·푸시하고 별도 Draft PR 세 개를 만들어 CI까지 확인” 요청에 사용자가 `진행해`로 직접 승인했다. 이번 범위는 커밋·feature push·Draft PR·정확한 SHA의 verify CI 확인이다. 최종 병합·운영 배포·auto-merge 설정은 제외한다.
- 최신 원격 main과 로컬 기준은 `d9724d56205705647062da29c6e333a255152cd3`이며 같은 feature/PR은 없었다. 기존 gh CLI 인증과 저장소 push 권한을 확인했으며 새 인증·권한·전역 Git 설정은 변경하지 않는다. feature push/PR에는 배포 트리거가 없고 main merge가 운영 배포를 실행한다.
- 원본 diff 및 변경·신규 파일의 SHA-256을 최신 인계와 대조하고 별도 백업했다. 이번 커밋은 이 이슈의 원본 구현·테스트·기록만 보존한다. 기존 로컬 검증은 단위 77개 / E2E 149개 통과 + 기존 skip 1개, API/lint/typecheck/build 및 diff 검사 통과이며 이번 기록을 새 테스트 실행으로 표시하지 않는다.
- 공통 RoomPage/CSS/기록 충돌은 #11 → #12 → #13 stacked PR으로 준비하며 각 PR의 diff는 직접 앞 브랜치를 기준으로 해당 이슈 변경만 표시한다. main 반영 전후에는 다음 PR의 기준·diff·CI를 재확인한다. 실제 AI·운영 backend/DB·HTTPS 쿠키/CORS·실모바일 Safari는 미검증이다. Commit/PR: 동일 커밋 예정, 실제 SHA/URL은 Git 이력과 후속 인계에서 확인한다.

## 2026-10-06 — UX #13 stacked Draft PR 통합 준비

- 원본 이슈 구현 커밋을 보존한 뒤 `feature/12-submission-share-and-wait`를 병합했다. 부모 이슈의 커밋과 원본 구현 이력을 유지하며 main/develop·서버 사용자 파일은 변경하지 않았다. 공통 작업 기록은 양쪽 기록을 모두 보존했다.
- 제품/테스트 충돌은 최신 로컬 통합 인계의 파일을 기준으로 해당 이슈 범위에만 해결했다. #13 PR의 base는 `feature/12-submission-share-and-wait`이며 직접 부모 대비 diff에 해당 이슈 변경만 표시한다. #11 → #12 → #13 순서로 별도 승인 후 병합하고 main 전환 시 diff·최신 SHA CI를 다시 확인한다.
- 이 단계의 검증 결과와 최종 head/PR/CI는 후속 인계와 PR 본문에 기록한다. 기존 원본 및 통합 로컬 검사 결과와 이번 재실행 결과를 구분한다. 운영 배포·auto-merge·운영 데이터 생성 없음.
