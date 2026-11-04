# Issue #74 — 내 목록 삭제 확인과 카드 작업 정리

## 최종 계약 연결 — 2026-11-03

서버 [ec0865cc00745b8780560565d04dd4c9774222f5의 실제 생성 OpenAPI](https://github.com/meet-me-duo/meet-me-server/blob/ec0865cc00745b8780560565d04dd4c9774222f5/docs/openapi/account-room-history.openapi.json)를 읽었다. 원문 SHA256 `03043ac4658ba676bad0eed6015937ebb5f4801bf9e303666ba9cb4a0de04a4e`를 재계산해 전달값과 일치했다. 웹 snapshot은 기존 서식과 키 순서를 보존하며 전체 JSON의 의미 일치를 별도로 assert했다. 웹 파일 SHA256은 `37ad773fad50d023de2df81a003737c4e9ad1ea74b8a45c87a3d6106d2aec00f`다. [계약 대조 근거](issue-74-room-retention-contract.json)에 해시와 참조 경로를 기록한다.

기존 명세와의 의미 차이는 `RoomResponse.expires_at` 속성과 required 선언 두 곳이다. 실제 생성 명세는 string/date-time/required/non-null이며, 저장된 생성 시각+30×24시간의 UTC 보관 만료 기준이다. 생성·조회·참여·마감·claim·retry와 수정 라운드 중첩 응답이 공통 RoomResponse를 참조한다. `api:generate`로 schema를 재생성해 `expires_at: string`을 확인했고, 임시 수동 타입은 제거했다. 웹 Room 읽기 alias만 기존 구 서버 호환 패턴에 따라 optional로 완화한다. 새 서버 계약을 optional로 바꾼 것이 아니다.

현재 구현은 상세 응답의 expires_at만 사용한다. 계정 목록을 조회·구독하거나 생성일/closed_at·일정으로 추정하지 않는다. 목록 진입·직접 링크·새로고침·비로그인/미참여·로그아웃 계정 경계에서 표시하며, 누락/null/잘못된 날짜에서는 숨긴다. 한국 날짜 기준 `자동 정리 D-N`, 보관 만료 시각부터는 `자동 정리 예정`으로 표시한다. 정확한 물리 삭제 실행 시각이나 삭제 완료를 약속하지 않는다. 기존 생성일 보조 표시·목록 정리일 제거, 카드 우상단44px 삭제 동작, 확인/실패/계정 경계와 내 입력·수직 수정/조건부 마감·searching Orb를 보존한다.

서버 PR202는 아직 운영 반영 완료 신호를 받지 않았다. Web은 기존 Draft PR75의 검증·commit/push·정확 head CI까지 진행하며, 서버 운영 준비 확인 전 병합·배포를 보류한다. 원문 대조는 서버 변경이나 운영 API 요청을 포함하지 않는다. 아래 예비/최초 기록은 각 당시 이력이다.

최종 로컬 unit873/82files·browser599PASS/기존skip1/retry0/flaky0/errors0·preview18·evidence6·preflight3·API/lint/typecheck/build PASS. desktop1440/mobile390/mobile320의 새 캡처24장과 캡처 흐름3PASS를 확인했다. 독립 검토가 실제 계약·소스150/dist12 지문 일치·캡처24장 전체를 확인했으며 새 P1/P2는 없다. 실제 운영 OAuth/서버/모델/실기기 검증은 이번 범위가 아니다. 정확 push head CI는 후속 PR 기록에서 확인하며 서버 운영 완료 신호 전 Web 병합·배포를 보류한다.

---

## 2026-11-03 후속 — 서버 예정 계약 기반 예비 구현 (미게시)

부모가 서버 담당의 예정 계약을 전달했다. 공통 RoomResponse의 `expires_at`은 required/non-null UTC date-time으로, 저장된 생성 시각 + 30×24시간의 보관 만료 기준이다. 물리 삭제 실행 시각은 보장하지 않는다. 실제 서버 commit SHA와 생성 OpenAPI 원문은 아직 대기 중이다. 아래의 목록 cache 타협과 최초 검증 기록은 당시 이력이며 최종 구현 방식이 아니다.

예비 Web은 상세 응답의 `expires_at`만 사용한다. 계정 목록 cache 구독·탐색 경로 의존을 제거하고 비참여 게스트 화면에도 연결했다. 정상 응답이면 목록 진입·직접 링크·새로고침·비로그인·계정 경계 전환에서 표시한다. 구 서버/잘못된 응답의 누락·null·형식/달력 오류는 날짜를 추정하지 않고 표시하지 않는다. 예비 `Room.expires_at?: string`은 실제 생성 snapshot 수신 전 임시 읽기 타입이며, 서버 새 계약 자체가 optional이라는 뜻이 아니다. 저장 OpenAPI·생성 schema는 아직 변경하지 않았다.

문구는 `자동 정리 D-N`, 만료 기준 시각부터는 `자동 정리 예정`이다. 한국 시간 달력 날짜 차이를 사용하고, 만료가 지났다는 이유로 실제 삭제 완료를 표시하지 않는다. 보조 설명은 실제 정리 시점이 다를 수 있음을 밝힌다. 분 경계(한국 자정 포함)와 실제 만료 시각에 로컬 타이머로 갱신하고, visibility 복귀 때 재계산한다. 새 API·Web Storage 사용은 없다. 구 서버 목록 안내도 생성일 기준 30일로 정정했다.

새 예비 검증: 관련 unit41 PASS, lint/typecheck/API 정합/build PASS. 최초 browser34 중 모바일 경계1은 설치한 시계가 페이지 준비 동안 계속 흘러 자정을 넘은 하네스 문제였다. 기대값을 유지한 첫 `pauseAt` 수정은 초기 로딩 타이머까지 멈춰 경계2건이 실패했다. 공식 Playwright 지침에 따라 화면 로딩 후 시계를 고정하고 reload 전 재개하도록 정정한 경계2건은 PASS다. 실패 원본 로그·JSON과 최종 경계 로그는 별도로 보존한다. 최종 예비 전체 unit873·일반 browser32 및 재실행 경계2 PASS다. 독립 정적 리뷰 새 P1/P2 없음 및 독립 관련37 PASS를 확인했다. 실제 서버 생성 snapshot 반영 후 최종 aggregate·독립 최종 리뷰·캡처와 정확 head CI를 다시 확인해야 한다. 원격 push·병합·배포·운영 요청·모델 호출·서버 변경은 없다. Linear 갱신 거부 뒤 재시도하지 않는다.

---

기준 main `5fff175`에서 독립 브랜치 `feature/74-account-room-delete-confirm`을 준비했다. 문구는 ‘삭제’지만 실제 API는 기존 body 없는 `POST /api/account/rooms/{inviteCode}/hide`와 204 빈 응답이다. 서버·API·보관 정책·조건부 참석 지원 선언은 변경하지 않는다.

카드 오른쪽 위에 쓰레기통과 ‘삭제’를 함께 표시하고 44px 이상의 터치 영역을 유지한다. 역할은 왼쪽의 일반 정보로 분리했다. 생성일은 작은 한국 시간 날짜로 유지하고 정리일은 목록에서 제거했다. 모달은 본인 목록에서만 삭제되며 되돌릴 수 없고, 모임 자체·다른 참여자 목록·기존 참여·직접 링크에는 영향이 없음을 설명한다.

최초 focus는 취소다. Tab/Shift+Tab을 모달 안에 유지하고 취소·Esc 후 원래 버튼으로 복원한다. 삭제 후 버튼이 사라지면 목록 heading으로 이동한다. 바깥 클릭은 기존 RoomCloseConfirmation처럼 닫히지 않고 요청도 없다. 처리 중 취소와 추가 확인을 막고 실패하면 모달 안에서 재시도할 수 있다. 기존 계정 epoch, 중복 요청 ref, 늦은 응답 및 화면 이탈 방어를 유지한다.

## 상세 D-day의 지원 범위와 API 한계

현재 생성 OpenAPI의 RoomResponse에는 created_at/expires_at이 없다. 계정 목록 GET만 로그인 계정의 미숨김 항목에 두 시각을 제공하며 코드 단건 필터는 없다. 추가 API 조회나 계약 변경 없이, 현재 계정의 목록 cache에서 같은 코드의 날짜가 단일하게 확인될 때만 상세에 표시한다. 정확한 30일 서버 기간이 아니거나 정보가 없거나 충돌하면 표시하지 않는다.

이는 전체 상세 지원이 아니다. 목록에서 상세로 이동할 때만 보장하며 직접 링크, 새로고침, 비로그인, cache 소멸 이후에는 표시되지 않을 수 있다. 이 제한은 배포 전에 부모에게 명시했다. 원문·일정에서 생성일을 추정하거나 날짜를 지어내지 않는다. 정보를 WebStorage나 URL에 저장하지 않으며 계정 cache가 정리되면 메타데이터도 숨긴다.

한국 시간의 달력 날짜 차이를 D-N으로 표시한다. 정확한 정리 시각 경계는 포함해 D-0이며, 그 이후에는 실제 정리가 이미 끝났다고 추정하지 않고 ‘자동 정리 예정’으로 표시한다. 서버 정책이나 삭제 권한은 이 표시로 판단하지 않는다.

## 구현 후 별도 검토

- 모달은 하나이며 삭제 버튼이 Link의 형제여서 탐색과 이벤트가 충돌하지 않는다. 모임명은 React 텍스트로만 표시한다.
- 선택한 계정 epoch를 확정 전에 다시 검사한다. 기존 HTTP 전후 세대 검사와 mounted guard를 보존하며 mutation은 자동 재시도하지 않는다.
- 성공 후 필터·페이지 cache 초기화가 끝날 때까지 모달과 pending을 유지한다. 제거된 trigger 대신 안정된 heading에 focus를 복원한다.
- native showModal/inert와 명시적 키보드 trap을 사용하며 닫힘·이탈 때 정리한다. 처리 중에는 명시적인 busy 상태다.
- D-day는 서버 날짜 근거만 사용하고 분당 로컬 시계 및 visibility 갱신만 한다. 타이머와 구독을 해제하며 추가 API·모델 호출은 없다.
- App의 계정 경계가 query cache와 route subtree를 정리하는 것을 확인했다. API client/OpenAPI/schema/package/CI workflow/서버 파일은 변경하지 않는다. 보류 PR #51은 제외한다.

설치된 프로젝트 skill 경로가 없어 공식 UI/UX Pro Max SKILL과 pro-rules를 수동 적용했다: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
모달 구성과 접근성은 https://ui.shadcn.com/docs/components/alert-dialog 및 https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ 을 참고하고 기존 native dialog/Button을 사용했다. CLI·라이브러리 설치는 없다. React Best Practices의 hooks 수명·구독·접근성 항목도 별도 확인했다. PR APPROVE를 제출한 검토는 아니다.

## 검증

관련 단위 24개, 목록·삭제 브라우저 20개, 200% 텍스트·동작 축소·OS dark 선호·375px 세로/844px 가로 검사 4개가 통과했다. 320×480,390×844,1440×844 실제 캡처도 확인했다. 앱은 기존 light 테마를 유지한다. 모든 데이터는 자연스러운 가상 문장·가상 인물이며 실제 운영 계정이나 모임이 아니다.

초기 단위 검사에서 옛 pending 문구 기대값과 Testing Library 옵션 타입 오류를 수정했다. 전체 검증 중 cloud 연결이 끊겨 세션24415 복구가 transport disconnected/recovery timeout으로 실패했다. 이전 node/python 프로세스 소멸 확인 후 부분 로그를 보존하고 남은 검사부터 재개했다. 중단 실행은 PASS/FAIL로 오인하지 않는다.

이후 전체 단위는 구버전 목록의 옛 정리일 표시 기대값 1건 때문에 860PASS/1FAIL이었다. 요구에 맞게 생성일 유지·정리일 부재를 확인하도록 수정한 뒤 **861PASS**로 재검증했다. API/lint/typecheck/preflight3/build도 PASS다. 전체 브라우저·preview·CI 결과는 완료 후 별도 기록한다. native 계정 하네스의 날짜 기대값은 수정하고 문법 검사만 했으며 실제 OAuth 하네스는 실행하지 않았다. 실제 운영 API·모델·모임 변경 0, 서버 변경 0.
