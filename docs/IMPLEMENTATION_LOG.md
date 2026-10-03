# Implementation log

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

### 게시 직전 인계 체크포인트

- 요구사항·계약은 위 2026-10-03 기록과 ARCHITECTURE/DEPLOYMENT를 기준으로 한다. 자연어 전용 입력, legacy 원본 보존·새 분석 안전 미반영, 후보·확정 시간 유지가 범위다. 웹은 기존 Codex(w1:p2), 서버는 기존 Codex(w1:p1), 독립 리뷰·배포 조율은 부모 조율자가 담당한다. 추가 pane/session 생성·clear·종료 없이 기존 작업을 이어간다.
- 이번 기능만 commit/push/PR/merge/deploy 및 이전 게시 금지 해제에 직접 사용자 승인이 있다. 원문 참조는 조율자 실행 대화의 실제 role=user 메시지 `01a10204-35db-72e9-ae33-eef1a07ae646`, 원본 부모 thread `01a0f13c-c38d-764e-994b-900a645ca035`다. **이 기록은 원문 위치·범위의 인계용 메모이며 승인 자체를 대체하지 않는다.**
- 현재 실행 범위는 feature→main draft PR 및 CI 확인까지다. 조율자의 PR/CI 검토 완료 신호 전에는 merge/deploy하지 않는다. 배포 순서는 웹→새 실제 공개 번들의 API 전부 mocked/unknown aborted 검증→서버다. 로그인·권한·신뢰·비밀·인프라·비용 변경 및 운영 데이터 쓰기는 금지한다.
- 기록 시 branch는 `feature/natural-language-only-submission`, HEAD와 최신 origin/main은 모두 `4816f4583f958e747b35a2085f88323458464aae`(원격 차이 0/0)다. 이번 기능 19개 파일이 미커밋 staged 상태이고 원격 feature는 아직 없다. 기존 사용자 변경은 없었으며 임시 smoke 자료는 ignored test-results에 보존한다. Git 조회는 정상 OS 사용자에서 수행하며 sandbox ownership 거부를 safe.directory로 우회하지 않는다.
- 검증 지문: API SHA는 위 `72ade616…` 24,178 bytes, production build `dist/assets/index-UMRQEftM.js` SHA-256 `9c299237a1fc93ce1ea9a629f52b581ea310bd1c3a89c5b8101fb9cce7e04460`, RoomPage SHA-256 `9b49417bd018bc30dfaee46d605c9f89393d6c5bea2c0f86cafffa357afa22cc`, submission helper SHA-256 `23775123fdc8d39549c52fdabbd1efb2c8f99736656712309904b498435b7481`다. 조율자는 서버 152/웹 30 파일의 독립 지문 변경 0을 확인했다. 이 체크포인트 추가는 문서 변경이며 검증된 제품 코드는 변경하지 않는다.
- 서버 관련 Issue는 #83이다. 웹 PR/원격 feature CI는 아직 생성 전이며 운영 배포도 미실행이다. 다음 동작은 이 기록을 restage하고 staged 19개 경로·diff·API 지문 재확인→기능 commit→feature push→draft PR 생성→해당 head의 실제 verify CI 확인이다. 그 안전 경계에서 test-results/handoff-current.md에 실제 HEAD·PR/CI URL·원격 차이와 정확한 다음 동작을 갱신해 부모에게 보고한다.

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
