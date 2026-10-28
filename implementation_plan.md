# 계정 복구 안내·이 탭의 미저장 입력 보존 (2026-10-18 UTC)

- [USER] 제출 전 확인 통합 과정에서 발견한 계정 복구 UX를 최소 범위로 보완한다. 기존 서버 인증 정책은 유지하고 이 탭의 입력 보존·같은 방 재로그인·복귀 확인만 추가한다.
- [x] 세션 복구 결과를 확인중/본인확인/비로그인/만료/일시불가로 구분한다. 처음401은 정상 guest와 구별할 수 없어 중립 안내를 사용한다. 늦은 응답은 기존 generation 경계로 차단한다.
- [x] 검증된 account/본인 참여에서 입력한 최대500 Unicode 원문1건을 탭 메모리에 보관한다. 방·account·viewer context·revision·editor kind 일치와 fresh private GET 후에만 draft로 복원한다. 다른 계정·로그아웃·소유권 거절은 폐기하며 원문을 비로그인 DOM이나 영구저장소에 노출하지 않는다.
- [x] 같은 방을 새 창으로 열어 재로그인하고 원탭 focus/명시 확인 때만 복구한다. revision 충돌은 사용자가 사용/폐기를 선택하며 자동 POST·제출완료 승격0이다. beforeunload 경고는 사용자가 실제 이탈을 선택한 뒤의 메모리 복원을 보장하지 않는다.
- [x] 신규 독립51(state/store31+실제App흐름20)과 기존session19=70 GREEN, 관련 기존255 GREEN, typecheck/lint 경고0. 각 RED·fixture setup오류·원본sha는 분리 보존한다.
- [x] 독립 신규55(유효RED49/초회PASS6)→최종GREEN·기존HOST26포함81PASS. 기존전체첫678중lifecycle4FAIL 원본보존→최소productfix→최종682PASS. 독립FI9 assertion탐지/매회exactrestore55GREEN, api/lint/type/build PASS·134source전후현재동일.
- [x] 전체mockbrowser425PASS/기존skip1·retry/flaky0. 별도실제HTTPS 명시복구6PASS/각retry0·source/runtime/assets동일·owned2/keys/profiles/19440–46 정리. 원8/자동focus4435의실패는별도잔여로유지하며같은oraclePASS로치환0. loopback 합성OAuth/Primaryprovider는실외부·TwoStage/금융graph·모델품질검증아님.
- [x] 최종 독립 게시 전 로컬 리뷰 PASS: source7/test55·FI9·전체unit682/mockbrowser425+기존skip1·명시복구HTTPS6 근거와 현재 지문을 대조했다. 새 P1/P2 없음. 원8/자동focus 미검증 및 frozen runtime 선행 조건을 유지한다.
- [ ] PR33새commit/push·정확HEADCI. 선행고정runtime398재사용준비가필요하며self-contained CI integrationjob은추가하지않았다. 상세는docs/verification/issue-32-account-recovery.md.

현재 HTTPS8 원본은 불변이다. 앞선 실행7PASS/1timeout 및 별도 관측 실행6PASS/2timeout을 보존하며 원래 연속 전체문서 이동 요구를 충족했다고 주장하지 않는다. 별도 안정 경로·빠른 전체문서 이탈 및 명시적 재로그인 복구 결과를 구분한다. 내부 상세 진단은 로컬 전용 `.codex/tdd-evidence/issue24-private-auth-diagnostic/`에 보관한다. 현재 Commit/PR 동일후속커밋예정, main/실제 운영/Secret 변경0이다.

# PR24 HTTPS 회귀 보존·현재 통합 및 조건부 main 승인 (2026-10-18 UTC)

- [USER] 검증 뒤 대응 서버/웹 main 정상 PR·정확 병합CI·실제 배포·가입/로그인 확인까지 승인했다. 과거 main 보류 문구는 당시 이력이며 실제 인증·DB·모델 활성화 준비가 확인되기 전 배포 성공으로 표시하지 않는다. security/자격증명/admin승격은 제외한다.
- [x] 기존25–31 exactHEAD/최신대표33f08aaa98·CI39111519165 SUCCESS와 독립 대체근거를 재확인하고 각PR에 이유/33링크를 남겨 closed-unmerged. 24와33만Draft유지, 원본branchforcepush0
- [x] PR24 원7files/bytes/SHA/과거8PASS를 docs/history/issue-24-https-original/에 archive. 기존runner가oldserver91eb+현재web을섞으므로단순원본추가/옛익명HOST·PUT완료oracle재사용은안전하지않음
- [ ] 별도현재계약HTTPS8(4scenario×desktop/mobile): 실제localOIDC/accountHOST/create0명·share·refresh, POST202→PrimarysyntheticCLEARaccepted/UUIDreplay, host미제출accepted0/1/2 조기마감·정확동결, guestproof/private권한, CA신뢰/비신뢰음성대조·실CORS CDPOPTIONS·routeAPI0. 실제AI/OAuth외부0, Primary가TwoStage/financialgraph우회함을명시
- [ ] 고정server398source482/frozen1559/deps216 지문·새test-onlyJava launcher·호스트TLS/denyproxy·Testcontainers수명/정상종료, 독립FI/전체웹필수gate/최종리뷰/PR33새exactHEADCI 확인
- [ ] 통합검증뒤PR24에정확보존·대체근거와새CI를연결해정리. 현재별도legacy8/native14와중복합산0. main실제병합은서버호환/auth/DB/운영AI완료경계확인후시행

현재서버main91eb2505/웹main9b183978은기존그대로다. serverdevelop39825357의정확CI39113901061이성공했고신규모델평가는별도issue130이다. 모델OFF는신규accepted완료를막고provider단일토글은2단계예산활성화가아니므로이를임의변경하지않는다. 현재진행기록은이후Git/PR/receipt에연결하며Commit/PR 동일후속커밋예정이다.

---

이하는 PR33 최초 게시 당시 이력이다.

# #32 취소된 확인 질문과 재시도 UI 상태 복구 (2026-10-18 UTC)

- 기준: PR31 exact02a68d8e50680e87dd153156e8bb7ea884a794cc를 clean main9b183978 ff-only 갱신 뒤 feature/issue-32-cancel-question에서 상속. PR31/다른branch직접변경0. 서버#128과 연결하며 사용자 승인 #123 로컬누락검증 범위다.
- [x] 기존PR31 read-only 점검·집중unit67+관련90=157 PASS, browser22 PASS/skip·retry·flaky0·원본268지문불변. 이번새수정의성공으로합산하지않음
- [x] 신규독립회귀: CANCELLED/FAILED/TIMED_OUT retainedquestion 비활성, 정상 NEEDS_CHOICE control, 새입력·명시retry완료·직접수정재검사 public API 계약. 컴파일RED와INITIALPASS구분/기존기대값불변
- [x] 최소 active-question 1조건·새7GREEN/기존67포함74PASS·독립guard제거4assert탐지/원복7PASS. testba446/source2bcf5ffa동결
- [x] 현재server128/candidateweb32 native14PASS/실API154·routeMock/외부/실model/OAuth0. Primaryfake로TwoStage/금융graph우회·운영성공주장0. source/runtime/assets지문동일·정상종료
- [x] 웹필수 api/lint/typecheck/build/전체unit627·전체browser425PASS+기존skip1·실패/flaky/retry0, 134지문불변
- [x] server전체guard1717중1713PASS/기존4SKIP 및최종독립게시review LOCAL PASS·미해결P1P2없음
- [ ] 양쪽정확HEADCI 확인. 자세한근거는docs/verification/issue-32-*.json
- [ ] commit/push·별도Draft·정확HEADCI. Commit/PR 동일커밋예정

500자·상한·참여/마감·last CLEAR 정책을 변경하지 않는다. 질문DB이력은서버에서보존하며새질문시도횟수를환급하지않는다. 실제AI/OAuth/운영접근·Secret·병합·배포0. 합성provider/transport 성공은 실제Decision정확도/운영활성화와구분한다. 서버·웹 전체 README 이미지/편집은server#127 선행검증이후다.

---

이하는 원본 PR31 당시 이력이다.

# #107 제출 전 확인·기존 기능 웹 통합

최종 갱신: 2026-10-17 UTC. 현재는 별도 작업 브랜치의 로컬 구현/검증 단계다. 원격 commit·push·PR·병합은 root가 통합 검증·독립 리뷰 후 단독 수행한다. 기존 PR28/29/30 브랜치를 변경하지 않았다. 과거 아래 #110 단계별 기록은 보존한다.

- [x] 공통 #109 이후 #108·#110·옛 #107 delta 결합, 게스트 복구·사후 질문·운영 화면 유지
- [x] 신규 protocol gate·저장/완료 구분·동일 카드 질문/직접 수정/재시도/취소·500 Unicode 경계 구현
- [x] accepted/candidate/check/room 독립 시계, 계정/본인 수명·늦은 응답·GET 후 동일 UUID 재전송·마감 미반영 안내
- [x] CLOSED+OPEN correction의 기존 editor·round PUT 보존, blind 대체의 새 protocol 저장 안내 분리
- [x] 독립 chronological RED와 fixture 강화 재구성 RED를 구분 보존; 새 집중 67 GREEN
- [x] 최종 생성 alias 적용 뒤 전체 57파일/620 unit PASS; 집중 67/67 재검증 PASS
- [x] 실제 격리 서버 OpenAPI 교체·생성 타입/DTO alias 정렬·전체 lint 경고0·typecheck·api:check·두 build PASS
- [x] 독립 UI 리뷰·11종 fault/15 assertion 탐지 및 각 복구 GREEN
- [x] 최종 웹 source127/dist 전체 browser 426개: 425 PASS/기존 skip1/실패·flaky·retry0; 표준 gate 전부 PASS
- [x] 최종 서버 서식 교정 뒤 exact source native 계약 동일·독립12 재PASS; source/runtime/assets 전후 불변
- [x] 실제 격리 backend/proof/provider 대역 browser 12 PASS (최종 서버 값 보존 format 뒤 exact-source 재검증은 후속)
- [ ] root의 원격 게시·정확 HEAD CI·승인된 통합 완료

실모델 정확도/오탐·미탐·p50/p95·비용은 미측정이다. 실제 유료 AI·운영/OAuth·Secret 변경 없음. 마감은 기다리지 않으며 CLEAR 완료만 집계하고 마지막 accepted만 결과 대상으로 사용한다. 이전 확인 완료본과 미확인 수정본을 구분하고 최초 미확인 입력은 이번 결과 미반영을 명시한다. 자세한 기반/검증 경계는 `docs/ISSUE_107_PRE_SUBMIT_INTEGRATION.md`에 기록한다.

---

# #110 운영 요약 웹 구현

목표: 2026-10-18까지 승인된 읽기 전용 운영 요약의 웹 구현과 로컬 독립 검증을 마친다. 서버가 검증한 운영자만 허용하며 실제 운영자 등록·push·병합·배포는 하지 않는다. 공통 인증은 #109 계약을 따르고 임의 사용자 식별 헤더·로그인 UI·권한 부여를 만들지 않는다.

- [x] 사용자 지침·웹 아키텍처·공유 operator-query-contract.md 확인
- [x] 독립 수용 테스트의 컴파일된 RED 확보 (tsc exit0, 독립 22/22 동작 실패)
- [x] 독립 API client와 /operations 화면 구현
- [ ] 생성된 OpenAPI와 타입 동기화
- [x] 후보 API 정합·lint(경고0)·typecheck·단위343·build 검증
- [x] 기존 조회 계약 고정 빌드 mock browser 검증 (신규8, 전체391 PASS/기존skip1)
- [x] 기존 조회 계약 독립 리뷰와 결함 주입 증거 (격리5종 모두 탐지, 작업 원본 불변)
- [ ] 추가 client transport 관측 계약 수신·별도 독립 RED·화면 구현
- [ ] 최종 계약·생성 타입·회귀·독립 리뷰 갱신

기존 방 생성·참여·조건·추천 흐름은 유지한다. 운영 응답은 화면 메모리에서만 보관하고 이동·실패·권한 거부 시 폐기한다. 페이지는 20개 단위이며 서버 opaque cursor만 사용한다. 원문·공급자 응답·이름·초대 코드·비밀값을 표시하지 않는다. null과 0, 알려진 사용량 소계와 전체 청구 비용, admission 분류와 실제 HTTP 횟수, 실행 종료와 최종 게시 상태를 명확히 구별한다.

공통 인증 통합 대기: #109 메모리 토큰 supplier와 authRevision 연결이 필요하다. 해당 경계의 독립 대역 테스트는 추가 RED9건/기존 통과4건 뒤 전체35 GREEN으로 검증했으나, 실제 공통 store·로그인·만료 흐름의 성공을 뜻하지 않는다. 기본 App은 토큰 공급자 없이 서버 기본 거부 상태다. 생성 OpenAPI 수신 뒤 타입과 snapshot을 최종 대조한다.

전체 #110 완료와 구별: 현재 성과는 최초 읽기 요약 계약의 구현·검증이다. 부모가 client transport 관측의 nullable 요약과 개별 client call 기록을 추가 TDD 단위로 승인했다. 정확한 서버 계약 수신 뒤 새 관측과 기존 legacy unknown을 구별하는 화면을 확장한다. 기존 HTTP unknown 표시를 실제 관측 완료로 간주하지 않는다.


## 2026-10-18 KST 최종 로컬 상태 (앞 query-only 기록을 갱신)

- [x] 독립 transport10 compiled RED6/기존PASS4 → 최종 집중45 GREEN
- [x] actual local OpenAPI operations3/참조DTO10만 병합·타입 생성·정합 검사
- [x] lint경고0·최종typecheck·전체unit353·build PASS
- [x] 고정source/dist 전체mock browser395 PASS/기존skip1/실패·flaky0/retries0
- [x] 격리결함7종을13 assertions로탐지, control32 PASS, 실제source/test불변
- [ ] 최종 독립 근거 재검토·commit/push/Draft PR·정확 SHA CI
- [ ] #109 실제 메모리 token supplier/authRevision 주입과 actual backend/browser 통합

최신 승인으로 최종 검증·독립 리뷰 후 commit/push → Draft PR → 정확 SHA CI까지 진행한다. 기존 push금지 문구는 이전 단계의 기록이다. merge·운영배포·DB·Secret 변경과 실제운영자등록은 승인 밖이다. 기본 App은 supplier를 주입하지 않아 운영 인증을 제공하지 않는다. 전체110완료/실제109통합으로 표시하지 않는다. 근거: docs/verification/issue-110-web-final.json. Commit/PR: 동일 커밋 예정.

## 2026-10-18 KST 실제 #109 통합 최신 상태

앞 절의 기본 App supplier 미연결·actual109 대기 기록은 standalone 단계의 역사다. 별도 통합 작업 복사본에서 실제 #109 `95f09c0a98c6538b0f19ed381fdf11a2f5b844d9` 위에 #110을 연결해 다음 로컬 검증을 완료했다.

- [x] 실제 memory token supplier/authRevision 연결; 독립 route6 compiled RED4/PASS2 → 같은 테스트6 GREEN
- [x] 알려진 만료401·일반 supplier장애503·계정변경/logout/늦은응답 폐기
- [x] 실제 실행 OpenAPI operations3/참조component10개 정합 및 API 생성·정합 검사
- [x] typecheck·lint경고0·unit415/36파일·production build PASS
- [x] 전체 고정빌드 mock browser395 PASS/기존skip1/실패·flaky·retry0; source72/dist6 불변
- [x] 신규 integration 결함2개 탐지 및 source/test 원문복구; 이전 standalone7개와 구분
- [x] 실제 로컬 backend/browser native8 checks/10requests PASS; API응답mock0·외부요청0
- [x] 독립 source·원본JSON·현지문·native/OpenAPI·logout screenshot 최종대조, 남은P1/P2 없음
- [ ] 이번 통합 commit·push·Draft PR 생성
- [ ] 해당 정확 HEAD의 원격CI 성공 확인

근거: `docs/verification/issue-110-account-integration-independent.md`, `docs/verification/issue-110-native.json`. 운영 provider 로그인·실제운영자등록·병합·배포는 이번 성공 범위에 포함하지 않는다.


## 2026-10-28 리뷰 Cloud 이관 체크포인트

- 사용자 승인으로 미완성 리뷰 작업을 별도 feature/review-cloud-checkpoint-20261028에 commit·push하여 Cloud에서 정확한 SHA로 재개한다. 원본/Library/기존 미커밋 작업은 보존한다.
- 서버 ReviewService TODO·HTTP16 중15 RED/명세1PASS, 미실행10개 및 기존 commit guard의 ktlint 실패를 숨기지 않는다. 웹 기능19·합성 Edge4 PASS와 최종 타입검사2개 오류를 구분한다.
- 비밀/실행 로그/스크린샷은 제외하고 docs/checkpoints/confirmed-review-20261028의 파일 체크섬·원본 zip·재개 문서로 동일성을 확인한다. checkpoint commit은 기능 완료나 품질 게이트 통과가 아니다.
- Cloud 수신 검증 전에는 이관 완료가 아니다. main/develop 변경·PR 병합·운영 배포·AWS 실행은 하지 않는다.
