# #108 실제 인증 기반 웹 연결

작업 기준은 #109 웹 HEAD `95f09c0a98c6538b0f19ed381fdf11a2f5b844d9`이며, 독립 구현과 증거는 원본 인계 묶음에 보존한다. 이 작업은 별도 `feature/issue-108-integration`에서 진행한다.

## HTTP와 화면 경계

- 기존 참여 API에 게스트 이름과 선택 암호를 전달한다. 회원 요청 body는 `{}`이며, 메모리에 남은 만료 계정은 기존 API client의 401 차단을 따른다. 게스트로 다시 요청하지 않는다.
- 공개 `GET /api/rooms/{invite}/guest-records`는 `records`의 `participant_id`, `display_name`만 선택 목록에 사용한다. 동일 이름을 합치지 않는다.
- `POST /guest-records/reaccess`는 `{participant_id,password?}`를 전송한다. 서버 응답의 권한은 `VERIFIED_GUEST`, `REPLACE_ONLY`이며 credential은 HttpOnly cookie로만 전달한다.
- `VERIFIED_GUEST`는 이전 본인 제출·후보·결과 cache를 취소·삭제한 뒤 서버 room/viewer를 다시 읽는다. 클라이언트에서 역할이나 HOST 권한을 생성하지 않는다. 기존 게스트 HOST의 로그인·명시 연결 안내를 보존한다.
- `REPLACE_ONLY`는 기존 원문을 읽지 않는 별도 입력 폼과 `PUT /guest-records/{participantId}/submission`의 `{raw_text}`만 사용한다. `{replaced:true}` 뒤에도 기존 편집기와 본인 조회 cache에 접근하지 않는다.
- 마감·확정 상태에서도 기존 기록 선택과 암호 재접근은 가능하다. 신규 참여와 무암호 대체 입력은 닫힌 수집에서 허용하지 않는다.
- 요청 완료 후 외부 callback과 cache 반영도 시작한 방·인증 세대·현재 마운트를 대조한다. 폼 key에 인증 세대를 넣고 암호·원문·credential은 Web Storage에 저장하지 않는다.
- `viewer.context_id`는 기존 opaque cache 힌트로만 사용한다. 최초 참여 기록 번호는 서버의 명시적 `viewer.participant_id`가 있을 때만 표시한다.

## 검증 상태

독립 테스트 작성자가 구현과 분리하여 API·화면 계약 테스트를 고정하고 RED를 기록한다. 실제 구현 후 focused GREEN, 기존 frozen 20개, 전체 웹 gate와 native browser를 구분하여 최종 결과를 추가한다. API snapshot과 생성 schema는 통합 서버의 native export 후 갱신한다. 이 문서 작성 시점에는 구현과 검증이 진행 중이다.

기존 E2E의 `내 이름`/`모임 참여하기` 선택자는 동일 입력·동일 명령을 담당하는 GuestParticipation의 `이름`/`참여하기`로 갱신한다. 동작 검증과 기존 참여·기록 보존 기대는 유지한다.

기존 CLOSED/unjoined E2E의 전체 `textbox` 0개 기대는 새 재접근 암호 입력까지 금지하는 범위가 되어 더 이상 제품 계약과 맞지 않는다. 독립 테스트 작성자와 부모의 검토에 따라 새 참여 이름·새 대체 조건·기존 조건 편집기는 모두 0개, 기존 기록 선택과 기록 암호는 보임으로 구체화한다. 신규 참여 버튼 부재, 쓰기 요청 0개, 비공개 원문 미노출 기대는 유지한다. 공개 기록 GET의 정확한 경로에만 `{records:[]}` fixture를 추가하며 예상하지 못한 호출은 계속 거부한다.

초기 서버 연동 전 화면 테스트에서 마감 후 복원 즉시 원문 GET을 요구한 2개는 독립 작성자가 설계 오류로 정정했다. 기존 공개 UI의 `내 저장 입력 확인`을 펼치기 전에는 GET하지 않고, 명시적으로 펼친 뒤 본인의 저장 원문만 읽는 계약으로 강화했다. 기존 frozen 20개는 수정하지 않는다.

## 구현 담당 focused 검증

- 최종 소스의 frozen 컴포넌트 20개 + 독립 통합 16개 = 36개 PASS. 타입·변경 파일 ESLint(경고 0)·production build PASS.
- 기존 claim·초안·조건 수정 경계 4파일 70개 PASS는 화면 경계 복원 후 회귀 증거다. 뒤의 최종 stale-join callback 보강은 36개 focused에서 다시 확인했다. 전체 gate를 대체하지 않는다.
- 기존 browser 3파일 62개 첫 실행은 56개 PASS와 과거 blanket 기대 6개 FAIL이다. 독립 검토로 구체화한 마감 재접근 6개를 최종 production 번들 `index-BFAmp3oO.js`에서 재실행하여 모두 PASS했다. 첫 56개는 그보다 앞선 번들에서 실행되었으므로 최종 단일 artifact의 전체 browser PASS로 합산하지 않는다.
- frozen 20개 파일 SHA256은 `41134954949bc58a23191cb9d5528eb5ca6315d59a55d457b3ddd6586ea03c97`이며 원본과 동일하다.
- native 실제 서버 browser, 생성 OpenAPI/schema 동기화, 단일 최종 artifact 전체 gate·독립 리뷰는 부모 통합 단계에서 이어간다.

로컬 로그는 `/tmp/issue108-web-guest-final-focused.log`, `/tmp/issue108-web-fixed-boundaries.log`, `/tmp/issue108-web-browser-focused.log`, `/tmp/issue108-web-browser-closed-final.log`, `/tmp/issue108-web-final-build.log`에 있다. 원본 저장소와 기본 Playwright 설정은 수정하지 않았으며 임시 설정의 localhost4178과 system Chromium만 사용했다.

## 통합 단계의 최종 소스 검증

전체 단위400개가 통과했고, 고정 컴포넌트20개·실제 RoomPage16개의 지문을 보존했다. 실제 연결의 결함3종은 독립 테스트가 각각 탐지한 뒤 원본 바이트·권한 복원과16개 GREEN을 확인했다. 근거는 `docs/verification/issue-108-roompage-mutations.json`이다.

최종 Unicode 이름 수정이 포함된 격리 서버의 immutable runtime manifest `b72e40fada1b6906e2a9dd39f07e2c99031c23119dedf2baea0d021c31f38b64`에서 #108 native16개와 계정 회귀12개를 재실행해 모두 통과했다. API mock·외부 브라우저 요청은0이며, 이전 실행은 별도 before-final receipt로 보존했다. `issue-108-final-runtime-recheck.json`에 1,051개 파일의 산출물 지문과 최종 실행 근거를 연결했다.

이 서버에서 OpenAPI26경로를 재생성하고 `api:check`, lint, typecheck, build를 다시 통과했다. 실행 JS는 동일한 `index-BFAmp3oO.js`다. 첫 전체 browser의378통과·1skip·5실패, 승인된 harness 수정의16회 반복 통과, 이후 컴파일 부하 중 방 로딩 지연1건이 있어 중단한 실행은 각각 역사로 보존한다. 중단 실행의 미실행 항목을 제품 skip으로 계산하지 않는다. 기대값과 시간 제한을 유지한 한 worker의 전체384개 재실행은383 PASS·기존 skip1·실패0·flaky0·재시도0으로 완료했다. 최신 전체 단위400개와 API·lint·typecheck·build도 다시 통과했다. 독립 최종 리뷰는 source85개·dist4개·고정 테스트 지문과6개 gate를 직접 대조해 현재 #108/#109 웹 범위를 승인했다. #107/#110 결합 검증은 부모의 후속 범위다. 최종 증거는 `issue-108-final-web-gates.json`, `issue-108-final-browser-gate.json`, `issue-108-web-final-review.md`에 있다.
