# #107 제출 전 확인 웹 통합 기록

2026-10-17 UTC. 새 작업 브랜치 내 준비·구현 중이며 원격 게시·병합·배포 근거가 아니다.

## 기반과 보존

- 작업 기준 #108 PR30 `e9e81efe2c75813623729e4a9b8214bd8430c8b9`.
- 공통 #109 `95f09c0a98c6538b0f19ed381fdf11a2f5b844d9` 이후 #110 PR29 `ab25c6f8008cba191f2cf96dfb171b189f32a66f`와 옛 #107 PR28 `fb87358feecf6f979cd55bb10a218a0fe0e1eb3b`의 delta를 순서대로 3-way 적용했다. 각 원격 PR 브랜치는 변경하지 않았다.
- RoomPage 충돌은 #108 GuestAccessPanel/실제 proof 복구/객체 join API를 보존하면서 옛 ClarificationPanel·pending owner·계정 세대를 결합했다. 옛 JoinRoom은 #108 대체 경로이므로 추가하지 않았다. CSS는 양쪽 선택자를 보존했다.
- OpenAPI는 충돌 해결 단계에서 paths/component 필드 합집합으로 임시 생성했다. 최종 서버 native OpenAPI로 교체해야 하며 이 임시본을 확정 계약으로 간주하지 않는다.
- 이전 미커밋 UX ZIP은 403 차단으로 내용 확인·재사용하지 않았다.

## 합의된 전환

신규 `PRE_SUBMIT_V1` 방만 제출 전 확인 카드를 사용한다. `LEGACY` 및 표식 없는 구 방은 기존 제출/사후 질문 경로를 유지한다. 원문 저장은 제출 완료가 아니다. 현재 candidate에 대한 서버 완료 트랜잭션이 확인된 `submission_complete`만 완료로 표시한다. 이전 accepted는 수정 확인 중에도 별도로 남고, 마감에서는 마지막 accepted 사용 여부와 최초 미확인/미응답 입력의 결과 미반영을 표시한다. 마감 대기나 자동 연장은 없다.

최초 1~500 Unicode 코드포인트(trim, 내부 공백 보존)와 #108 REPLACE_ONLY 전용 blind 경로는 그대로 유지한다. 새 질문은 자동 원문 변환을 하지 않고 전체 선택안을 보여준 뒤 명시 확정한다. 합성 provider로 질문·명확함 응답을 표시하는 검증은 실모델 정확도 검증이 아니다.

## 실행 근거와 다음 시작점

- 결합 직후 typecheck PASS.
- 기존 unit 46 files / 553 tests PASS. 동일 실행에서 추가 중인 신규 API 16개는 skeleton `TDD RED`에 의해 실패했다. 전체 성공으로 표시하지 않는다.
- 신규 독립 테스트 작성자는 별도 역할이며 새 기대값을 구현자가 변경하지 않는다. skeleton → 유효 assertion/미구현 실패 RED → 최소 구현 → 전체 gate/독립 리뷰 순서를 따른다.
- 실모델 호출·운영·OAuth·Secret 변경 없음. 웹 원격 develop이 없고 main은 운영 배포 분기이므로 root 조율 전 병합하지 않는다.

## 로컬 구현과 검증 갱신

- 독립 API16/UI29의 chronological skeleton RED 후 최소 구현, CLOSED+OPEN correction3의 2RED/1PASS 후 기존 editor 경로 보존, blind2의 1RED/1PASS 후 신규 protocol 문구를 분리했다.
- UUID fixture 강화를 위한 별도 scratch skeleton 재실행은 `RECONSTRUCTED_SKELETON_AFTER_FIXTURE_HARDENING`으로 기록한다. 원래 chronological RED를 새 지문에 그대로 주장하지 않는다. lifecycle 초기 조기 assertion 실패는 React Query notify 동기화의 하네스 오류로 철회했고 올바른 동기화에서는 초회 PASS를 기록한다.
- 신규 draft1은 기존 accepted 뒤 미저장 수정의 완료 heading 잔존을 실제 chronological RED로 탐지했다. 새 초안 편집 시 완료 안내를 숨기고 미저장 내용을 명시하며 이전 accepted는 별도로 유지하도록 수정했다.
- 2026-10-17 18:22 UTC 현재 신규 집중 58/58 PASS. 앞 전체 실행은 51 files/610 unit PASS(추가 draft1 생성 이전 discovery); 최종 전체 검증·독립 리뷰는 별도 후속이다.
- query key는 방+viewer context+계정 epoch로 격리한다. fetch/JSON 이후 공통 API epoch, 컴포넌트 생존/요청 generation, source revision/check version/room state version을 별도로 검사한다. 언마운트·권한 거부 시 private query와 메모리를 제거한다.
- 응답 유실은 결과 미확인으로 표시한다. 현재 상태 GET을 성공시킨 뒤 사용자가 같은 UUID/body로 명시 재전송할 수 있고 reload는 GET만 한다. HTTP abort는 서버 CANCEL 성공으로 표시하지 않는다.
- 신규 방의 HOST 미반영 목록에서 서버가 raw를 null로 보호할 때 '개인 입력 원문은 비공개예요'로 표시한다. LEGACY nullable 시간표 안내는 유지한다.
- browser 합성 transport·FI는 별도 역할이 최종 고정 source/dist에서 진행 중이다. 최종 server native OpenAPI·실제 격리 backend/browser·원격 CI·실모델 검증은 아직 완료로 표시하지 않는다.

## 최종 계약 정렬 진행 (2026-10-17 UTC)

이 절은 앞 단계의 임시 OpenAPI·58/610 검증 상태를 갱신한다. 실제 격리 서버의 `/v3/api-docs` export로 임시 합집합을 교체했다. 현재 36개 path가 있으며 git HEAD의 기존 26개 path 누락이 없고 새 submission checks 5개 path를 포함한다. 중간 합집합의 이전 path 수는 독립 archive가 없으므로 최종 비교 근거로 사용하지 않는다. 오류 RFC9457 schema, nullable object oneOf, 필수 필드, accepted confirmation_source를 생성 타입과 독립 대조했다. precheck 타입은 생성 DTO alias를 사용하며 nullable을 보존한다.

전체 unit 620/620 PASS 뒤 alias 적용 후 새 집중 67/67 PASS를 확인했다. 전체 lint 경고0·typecheck·api:check·generic/native build PASS다. 독립 UI 리뷰는 고정 행동 소스에 대해 11종 fault를 15개 assertion으로 탐지하고 각 복구 GREEN을 확인했다. 생성 계약도 별도 독립 대조를 받았다. 기본 legacy 수정 흐름·계정 격리·초안 보존·늦은 응답·마감 불확실 상태·명시 provenance 회귀를 포함한다. 최종 고정 서버 runtime/native browser와 최종 asset mock browser는 후속 결과와 구분한다.

격리 harness는 test-only 실제 Spring/PG/Redis, 로컬 OIDC/RSA 및 실제 guest proof를 사용하고 provider만 명시 합성 대역이다. class/resource 복제와 서버 source manifest 생성을 동일 Gradle lock 안에서 수행한다. 운영 계정·Secret·유료 AI를 사용하지 않는다. 이 검증은 실제 AI의 오탐·미탐·속도·비용 측정이 아니다.

Native 첫 실행에서 실제 제출/질문/직접 수정/의도된 넓은 범위/reload·CAS·멱등 재전송/수동 마감의 6개 검증은 통과했다. deadline 검증은 SQL로 마감 시각만 앞당긴 뒤 기존 60초 scheduler 주기 전에 physical CLOSED를 기대한 harness 조율 오류로 중단했다. 기대값은 유지하고 test-only control에서 실제 `DeadlineClosureScheduler.closeDueRooms()` transactional bean을 명시 한 번 실행하도록 보완했다. 생산 마감 로직이나 SQL collection_status를 바꾸지 않는다. 최종 전체 native 결과와 이 중간 중단은 구분한다.

최종 생성 alias를 포함한 표준 `pnpm api:check`, `lint`(경고0), `typecheck`, `test`(57파일/620 PASS), `build`를 통과했다. 전체 동일 e2e 426개 desktop/mobile은 system Chromium·workers2·retries0으로 진행 중이다. 기본 msedge가 없고 Playwright 공식 CDN은 환경403으로 차단되어 실행 경로만 명시 config로 대체했으며 테스트·기대값은 바꾸지 않았다. 독립 native 12/12 PASS와 실행 전후 source/runtime/assets 불변을 확보했으나, 이후 서버 값 보존 style 교정으로 exact-source 재실행이 필요해 이전 PASS를 별도 보존했다.

전체 표준 웹 gate 최종 완료: `api:check`·`lint`·`typecheck`·`test` 620·`build` PASS, `test:e2e` 전체 426 중 425 PASS/기존 모바일 전용 검사의 desktop skip1/실패0/flaky0/retries0. 실행 7.7분은 이 격리 브라우저 suite의 소요 시간이며 모델 지연 측정이 아니다. 전체 e2e는 집중22를, 전체 unit은 집중67을 포함하므로 합산하지 않는다. 소스127개는 시작·끝 지문이 같고 generic dist 모든 자산 SHA를 `.tdd/verification/issue-107-web-standard-gates.json`에 보존했다. 최종 서버 서식 교정의 exact native 재검증은 별도 진행 중이다.

최종 서버 서식 교정 소스35(f54e1283...)의 compile 전후 동일성, 동일 lock 내 class/resource 복제, source216/runtime파일1339을 고정한 뒤 독립 native12를 다시 모두 통과했다. 최종 runtime source manifest SHA는 `03bb749dad1461b5096a17c7a6bc0dd76bb4fbd437bfb176ac75d7ce044ce9a0`이며 source7/runtime/native assets는 실행 전후 불변이다. 최종 실제 OpenAPI도 웹 snapshot과 JSON 의미가 일치했다. 원격 게시·정확 HEAD CI는 root의 다음 단계이며 실제 모델 품질·비용·지연과 운영 활성화는 여전히 검증하지 않았다. 재현·정상종료는 서버 `docs/ISSUE_107_LOCAL_SCENARIO.md`에 기록했다.
