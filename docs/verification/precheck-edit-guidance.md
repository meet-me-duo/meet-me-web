# NEEDS_EDIT 직접 수정 안내 (2026-10-28)

구체적으로 무엇을 수정해야 하는지 알 수 없던 NEEDS_EDIT 화면에 서버의 본인용 수정 안내를 표시한다. 서버 안내를 일반 React 텍스트로만 표시하고 HTML·Markdown·링크로 해석하지 않는다. 실패 코드나 모델의 의도를 추정하거나 입력을 자동 변경·제출하지 않는다.

## 동작과 호환성

- NEEDS_EDIT에서 유효한 안내가 있을 때 기존 일반 안내를 대체한다. A/B 질문은 기존 NEEDS_CHOICE 분기만 사용한다.
- 서버 필드가 없거나 null·빈값·잘못된 타입·160 codepoint 초과면 기존 안내를 유지한다. 160개 이모지도 잘리지 않고 표시하며 줄바꿈과 좁은 화면의 가로 넘침을 처리한다.
- 새 생성 DTO는 edit_guidance를 필수 string|null로 선언한다. 구버전 서버가 필드를 생략할 수 있으므로 런타임용 CheckState 정규화에만 optional을 허용한다. 신·구 서버 모두에서 안전한 fallback이 가능하다.
- 기존 완료·수정/미저장·취소·마감·소유자/계정 경계와 원문·이전 accepted 보존, 명령 UUID/revision/version 검사를 유지한다. 안내를 저장하거나 자동 재요청·확인·방 마감하는 동작은 없다.
- 이미 운영에 반영된 계정 메뉴·내 모임·방 화면·로그인 표면은 최신 main에서 보존했다.

## 실제 서버 생성 계약 대조

서버 [PR158](https://github.com/meet-me-duo/meet-me-server/pull/158)의 정확 HEAD [8d335aa2dec3c1f5e97a54a6d567ac87ff461810](https://github.com/meet-me-duo/meet-me-server/commit/8d335aa2dec3c1f5e97a54a6d567ac87ff461810)에서 [docs/openapi/precheck-edit-guidance.openapi.json](https://github.com/meet-me-duo/meet-me-server/blob/8d335aa2dec3c1f5e97a54a6d567ac87ff461810/docs/openapi/precheck-edit-guidance.openapi.json)을 읽었다.

- 원본104596bytes의 SHA256: `3028ed968241315c1d4e1c230491a7eb350ea0b9122cfcddf8aa84fdde075145`
- Git blob: `e2c5f78183f258d868226aa5a4500a51944a7b62`
- edit_guidance는 required string|null, maxLength160. 설명은 NEEDS_EDIT 본인에게만 제공되는 직접 수정 안내이며 다른 상태는 null이다. NEEDS_EDIT의 기존 question=null 동작을 서버 작업이 확인했다.
- 웹 스냅샷은 기존 순서·서식을 보존한 채 PrecheckStateResponse 하나만 갱신했다. 원본과 전체 명세의 의미상 일치를 검사했고, 경로와 계정 목록 DTO 등 다른 계약은 바뀌지 않았다. openapi-typescript 생성기를 실행하고 api:check를 통과했다.

## 검증

전체 단위805/805(73파일), lint/typecheck/API 생성 정합/build/diff 검사 통과. 단위는 160/161 codepoint·이모지, 필드 없음/null/빈값/잘못된 타입, HTML을 텍스트로 표시, 원문 보존과 명시적 수정, 취소/마감 후 숨김, 안내가 남은 비정상 NEEDS_CHOICE에서도 A/B 질문만 노출하는 경우를 검사한다.

관련 E2E34/34(desktop/mobile ×320/390/1440px) 통과. 실제 앱에서 새 안내→수정→구버전 fallback→160이모지→161 fallback을 확인했고 명령 요청0건·가로 넘침 없음·키보드 수정 포커스를 검사했다. 전체 브라우저 회귀527통과·기존skip1(로컬재시도0)도 확인했다. 정확 HEAD CI·배포 결과는 PR에 기록한다.

독립 검토에서 실제 원본 SHA256과 웹 명세의 의미상 일치, 생성 타입의 required/런타임 호환층의 optional 구분, codepoint 제한과 일반 텍스트·상태·편집·소유자 경계를 확인했고 차단 사항 없이 통과했다. 검증은 합성 API·계정·모임만 사용했으며 실제 로그인/로그아웃·claim·방 마감/확인 취소·삭제는 실행하지 않았다. 시스템 Chromium의 최초 popup route 한계 때문에 로컬 OAuth 새 탭 검사에는 loopback fixture를 사용한다. CI의 번들 Chromium과 실제 공급자 인증은 구분한다.

[합성320px 캡처: HTML을 텍스트로 표시](precheck-edit-guidance-images/plain-text-320.png)

기존 로컬278ec7a/2624f8c 이력은 보존했다. 서버와의 운영 순서 확인 없이 이 변경을 운영 완료로 표시하지 않는다.
