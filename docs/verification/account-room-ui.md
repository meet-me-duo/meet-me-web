# 계정 메뉴·내 모임·방 입력 화면 검증 (2026-10-28)

## 확정 범위

인증된 헤더의 로그인 링크를 제거하고 `내 모임` 목록 아이콘·라벨과 이름 메뉴를 제공한다. 이름→일반 로그아웃은 즉시 실행하며 이름→계정 보안→모든 기기 로그아웃→최종 확인창 순서다. 현재 기기 포함·다른 기기 Access 최대15분 계약은 유지한다.

내 모임은 서버가 계정의 HOST/MEMBER 권한으로 반환한 기록만 표시한다. 기본 전체, 전체/주최/참여 필터, 생성일 시작·종료(한국 시간·양끝 포함), 모임 이름 부분검색, opaque cursor 더 보기를 제공한다. 검색·목록은 메모리에서만 유지한다. 필터 변경 시 cursor를 초기화하며 전체 개수를 추정하지 않는다. 기존30일 보관/삭제 정책은 변경하지 않는다. 구버전 HOST 전용 응답은 제한을 명시하는 호환 화면으로만 표시한다.

게스트→계정 참여 연결 컴포넌트·진입점·안내를 제거했다. 자동 claim이나 데이터 마이그레이션을 추가하지 않는다. 기존 게스트 기록·재접근, 서버 claim API/권한 계약과 unrelated 리뷰 receipt API는 유지한다.

방 제목·옵션·초대 링크는 유지한다. 이미 저장한 입력에는 `저장된 조건`, 수정 중에는 `조건 수정`을 표시한다. 우측 마감 패널은 제거하고 주최자 도구를 확인 취소 아래로 옮겼다. HOST의 마감 버튼은 안전한 돌아가기 버튼에 먼저 포커스되는 최종 확인창을 열고, 확정 전에는 요청하지 않는다. 명시적 확인은 자동 조건 전 마감·미완료 입력 제외 가능성·2명 미만 분석 불가를 설명하며 기존 close API에 `confirm_early:true`를 한 번 전송한다. 자동 재시도·권한 확대는 없다.

## 확인 취소와 오류 문구

확인 취소는 기존 `POST /api/rooms/{code}/submission/checks/{checkId}/cancel`의 request_id/expected_revision/expected_check_version 계약을 유지한다. 현재 확인만 CANCELLED가 되고 원문·이전 accepted 입력은 유지된다. question은 응답에서 숨겨지며, 이미 사용한 질문/호출 수를 돌려주거나 모임을 마감하지 않는다. 늦은 처리 결과는 기존 status/version 경계에서 차단된다. 로컬 미저장 수정도 유지하며 직접 수정으로 새 확인을 시작할 수 있다.

`원문은 저장됐지만 확인을 완료하지 못했어요. 조건을 직접 수정해 주세요.`는 `NEEDS_EDIT` 표시 문구다. HTTP 오류 일반 메시지가 아니다. 닫힘/제출완료/수정 중 상태에서는 해당 안내를 표시하지 않는다. 현재 UI는 서버 내부 사유를 추정하지 않는다. 실제 실패 진단과 별도 서버 변경은 이 검증 범위가 아니다.

## 서버 명세 출처

- 저장소: meet-me-duo/meet-me-server
- 원본: [ed0a73e의 docs/openapi/account-room-history.openapi.json](https://github.com/meet-me-duo/meet-me-server/blob/ed0a73e87be1918f17ce2194552bceb9cd5462a6/docs/openapi/account-room-history.openapi.json)
- 원본 SHA256: `a491cf66707c1009e82ebe521239a0fe2c87a7c872ecdda3f117f76b781df60a`
- GET `/api/account/rooms` 및 두 DTO만 기존 웹 명세에 반영했다. 공식 생성기로 타입을 갱신했고 독립 검토에서 정규화한 경로·DTO의 원본 일치를 확인했다.
- role 생략=전체, HOST|MEMBER, created_from/to YYYY-MM-DD(Asia/Seoul 생성일, 양끝 포함, 한쪽만 가능), query 최대100 codepoint, limit1..100 기본20, 이전 next_cursor 그대로 전달. 마지막 페이지 has_more=false/next_cursor=null. UTC 응답 timestamp와 본인 role을 사용하며 합계는 없다.

## 검증 결과

- 통합 전체 단위 **791/791**, 72파일 통과. 제목 변경 후에도 비완료 상태를 검사하도록 완료 문구 negative oracle을 보강한67개 재검사도 통과했다.
- lint/typecheck/API 생성 정합/build 통과.
- 방 화면 별도 E2E94/94 및 새 저장 조건/확인창 E2E6/6 통과. 실제 합성 HOST/MEMBER, 320/390/1440px, 원문/완료본 유지, 돌아가기/Escape의0요청, 초안 보존, 포커스 복원·Tab 순환, 오류 후 명시적 재시도, 중복 확정1요청을 검사한다.
- 계정/목록 관련 단위27/27 통과. 역할·이름·한국 날짜 경계·cursor 초기화/정합·서버 오류/다음 페이지 접근 거부·늦은 A응답/B계정 경계·스토리지 비보관을 검사한다.
- 독립 검토: 방 관련17/17 실행, 최종 병합 소스와 API 일치·접근성·CSS 충돌 해결 검토 통과. 갱신 중 보안 창 취소와 390px 이하 날짜 한 열 배치를 수정하고 회귀 검사했다.
- 통합 E2E 최초 전체 실행은515통과/1기존skip이고, 계정 안내를 여전히 브라우저 안내로 기대한4건을 수정했다. 계정/게스트의 저장소 거부와 서버 목록 재접근 검사를 보강한 관련34/34 재검사는 통과했다. 최종 전체 재실행/원격 CI/배포 결과는 해당 PR에 정확한 SHA와 함께 기록한다.

실제 계정 로그인/로그아웃/전체기기 로그아웃·claim·실제 방 마감/확인 취소·삭제는 실행하지 않았다. 로컬 브라우저/API는 합성 fixture다. 시스템 Chromium의 새 탭 route 한계 때문에 OAuth popup만 loopback fixture를 사용하며 실제 공급자 인증을 검증했다고 주장하지 않는다. 사용자 Library 참고 이미지는 식별했으나 지원 다운로드가 `download failed`로 실패해 픽셀을 확인하지 못했고, 명시된 텍스트 요구사항으로 구현했다.

## 합성 캡처

[내 모임 필터 320px](account-room-ui-images/history-filtered-320.png) · [계정 메뉴 320px·긴 이름 스트레스](account-room-ui-images/account-menu-320.png) · [보안 화면](account-room-ui-images/account-security-320.png) · [전체 로그아웃 확인](account-room-ui-images/account-confirm-320.png) · [저장 조건·주최자 도구](account-room-ui-images/room-saved-390.png) · [마감 최종 확인](account-room-ui-images/room-close-390.png)

캡처에는 합성 계정·합성 방만 포함된다. 최종 로그인 표면은 별도 `oauth-surface-feedback.md`를 따른다. 서버 운영 배포 완료 확인 전 목록 의존 웹의 운영 배포는 진행하지 않는다.
