# Issue 69 — 본인 계정의 모임 목록 숨김

서버 Issue197의 확정 텍스트 계약을 바탕으로 독립 feature에서 준비한다. 서버 생성 OpenAPI 원격 SHA와 실제 호환 endpoint 배포 확인 전 운영 포함 금지.

POST /api/account/rooms/{inviteCode}/hide는 body 없이 전송하고 최초/반복 성공204는 JSON 파싱하지 않는다. 기존 인증·쿠키·계정 epoch·오류 처리를 유지한다. 성공 후 모든 account-rooms 필터/페이지 캐시를 초기화하고 첫 페이지를 다시 읽는다. 실패는 행을 유지하며 재시도가 가능하다. 동시에 하나만 요청하고 화면 이탈/계정 전환 후 늦은 완료는 캐시에 반영하지 않는다. 다른 room query나 참여권한은 변경하지 않는다.

서버 제공 expires_at를 그대로 표시한다. 클라이언트 시계로30일 경계를 재판정하지 않는다. 서버 계약은 created_at+30일 경계 포함, 이후 제외이며 401 ACCOUNT_REQUIRED /404 ROOM_NOT_FOUND /Origin 누락403 ORIGIN_NOT_ALLOWED다.

합성 검증: 최종 unit847PASS, browser581PASS+기존skip1/retry0. 추가 계정 epoch·필터 캐시·페이지 초기화 검사13PASS. body없는POST/반복204/noJSON/오류/늦은계정응답/예상밖200, UI 실패보존·중복요청·refresh·다른계정·직접링크 계약 대역을 확인했다. 이 결과는 실제 backend 동작을 검증했다는 뜻이 아니다. 실제 운영API/모델 호출0. 서버 변경0.

버튼 추가 후 데스크톱5개 목록 fold 회귀4건을 확인하고 버튼을 카드 오른쪽에 배치해 preview18PASS로 복구했다. 최종 빌드 브라우저 전체검사는 별도 로그로 기록한다.

Draft PR과 CI는 별도로 준비하며 서버 배포 확인 전 main 승격·운영 배포를 보류한다. 입력 UI PR70과 별도 릴리스이며 PR51은 제외한다.
