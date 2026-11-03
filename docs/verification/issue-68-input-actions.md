# Issue 68 — 내 입력과 세로 액션

사용자 승인 범위: Issue → feature PR → develop/main 정상 병합 → 기존 Web 배포. 특정 PR approval review나 보호 우회는 포함하지 않는다.

하단을 내 입력, 본인 원문, 세로 수정/조건부 수동 마감으로 정리했다. 확인 취소 UI와 빈 주최자 도구 토글을 제거하되 기존 취소 API와 상태 처리는 유지했다. 오류·보완 질문·재시도·timeout, host/manual/collecting 권한, 마감 확인 dialog, 정상 로딩의 컨트롤 부재를 보존한다. 상단 카드 변경 없음.

## 최종 로컬 검증
- api:check, lint, typecheck, build PASS
- 단위 836 PASS / 79 files; 마지막 상태문구 영향 검사 87 PASS / 5 files
- 전체 브라우저 575 PASS, 기존 skip 1, retry 0
- evidence 6 PASS, ui-preview 18 PASS, native evidence preflight 3 PASS
- 1440×900, 390×844, 320×480에서 세로 배치/가로 넘침 없음; 합성 캡처에 로컬 합성 표시
- 마감 dialog 취소·확정·중복 클릭 단일 요청, member/auto/closed/loading 권한, 오류 복구/화면 이탈 회귀 PASS
- 초기 테스트의 이전 문구 기대값과 SVG 앞 공백 selector 실패를 수정 후 최종 재검증. 실패 로그는 별도 산출물에 보존.

운영 API/모델 호출 0. 실제 브라우저 OAuth 및 모델 품질 검증 아님. 사용자 참조 이미지 materialization은 allowlist 제한으로 픽셀 검사하지 못했고 텍스트 요구에 따라 구현했다.

목록 숨김 #69, 서버 #197, 보류 PR #51은 이 릴리스에서 제외. API 클라이언트/OpenAPI/계정 목록/배포 workflow 변경 없음. 숨김은 서버 호환 endpoint 실제 배포 확인 후 별도 릴리스한다.
