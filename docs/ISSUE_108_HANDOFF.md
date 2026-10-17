# #108 비회원 참여·재접근 컴포넌트 인계

신규 `src/components/GuestParticipation.tsx`는 공통 #109 웹 인증·RoomPage·API 파일과 충돌하지 않는 독립 props 컴포넌트다. 아직 운영 페이지에서 import하거나 HTTP 엔드포인트에 연결하지 않았다. 서버 전담 원본은 `meet-me-server/docs/ISSUE_108_GOAL.md`와 `ISSUE_108_INTEGRATION_CONTRACT.md`다.

- 게스트: 이름 필수, 선택 암호는 password input. 암호 미설정 시 수정 미보호와 다른 기기 기존 원문 미조회 정책을 선택 전에 안내한다.
- 회원: 이름·암호 입력 없이 `onJoin({})`. 로그인과 게스트 소유권 연결을 자동으로 동일시하지 않는다.
- 기존 기록: 표시 이름과 participant ID로 명시 선택한다. 이름만으로 복구하지 않는다. 암호 오류 응답의 원문을 UI에 표시하지 않는다.
- VERIFIED_GUEST는 `onVerified`로 서버의 room/viewer·권한을 새로 읽는다. 클라이언트에서 HOST 역할을 만들지 않는다.
- REPLACE_ONLY는 빈 새 입력과 명시 대체 버튼만 연다. 기존 제출 GET이나 본인 복원 cache를 사용하지 않으며 대체 완료 뒤에도 읽기 권한으로 승격하지 않는다.
- `roomKey`에는 서버 인증/소유 주체 전환 epoch를 포함해야 한다. 같은 표시 이름의 다른 계정도 다른 key를 사용한다. 실제 cookie credential·Access Token을 key에 넣지 않는다.
- 부모 callback에서 API 결과를 cache/room 상태에 반영할 때도 시작한 방/epoch를 대조한다. 컴포넌트는 자신의 stale 결과를 버리지만 callback 내부의 상태 변경을 취소할 수 없다.
- `editable`은 서버의 현재 명령 capability로 만든다. 마감/확정 상태와 신규 참여/수정 라운드 권한을 클라이언트가 추정하지 않는다.

공개 prop/type 계약은 소스의 `GuestParticipationProps`가 기준이다. 실제 credential·암호·원문을 Web Storage에 기록하지 않는다. 이 컴포넌트 자체에는 fetch·계정 resolver·cookie 접근·외부 앱 호출이 없다.

독립 테스트 20개 RED → GREEN, 웹 전체 단위328 PASS, api:check/lint/typecheck/build PASS와 결함 6종/12 assertions 탐지·정확 복원은 `docs/verification/issue-108-local.json`에 기록한다. 기존 browser 회귀는 서버를 연결하지 않은 기존 mock 흐름이며 신규 컴포넌트의 실제 서버 통합 증거가 아니다. 공통 계정/소유 resolver 연결 이후 native API 동기화와 두 기기·마감/확정·409 충돌·경합 검증이 필요하다.

원격 push·PR·병합·배포·운영 호출·실제 credential 변경은 수행하지 않았다. 웹은 원격에 develop이 없는 저장소 지침에 따라 최신 main `9b183978d5987f8fa8a5f02d542b17181e4929b4`에서 별도 `feature/issue-108-guest-reaccess`를 사용한다.
