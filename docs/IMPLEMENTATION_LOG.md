# Implementation log

## 2026-10-04 — scrollytelling 재설계 진행 상태

- 사용자는 로컬 `96fdbf9`의 GIF를 보고 보통 스크롤 속도에서 효과가 너무 짧고 미미하다고 피드백했다. 현재 브랜치는 `feature/scroll-content-reveal`이며 이 커밋은 미게시 상태다. 후속 범위는 로컬 scrollytelling/parallax 구현·미리보기·일반/빠른 스크롤 검증으로 한정하고 push/PR/merge/deploy는 하지 않는다.
- 현재 구조는 문장·카드의 짧은 CSS entry 범위에서 clip과 위치를 바꾸므로 휠·스와이프가 큰 경우 단계가 쉽게 지나간다. 첫 hero/CTA·브랜드·기존 기능 설명 카피는 유지한다. 설명 장면은 sticky stage로 충분히 머무르게 하고 전경·배경의 이동량을 달리하며 단계별 설명 전환을 설계한다. 스크롤 가로채기·잠금·강제 snap은 사용하지 않는다.
- 부모가 조사한 실제 참고 사이트를 전달하면 관찰한 상호작용 원리를 반영해 구현한다. 참고 수신 전에는 구조 확인과 설계·검증 준비만 진행한다. reduced-motion·CSS/JS 실패·키보드·짧은 viewport에서는 내용이 자연스럽게 읽히는 fallback을 유지한다. 검증은 작은 delta의 느린 시연 대신 일반 wheel/trackpad delta와 빠른 모바일 스와이프에 해당하는 입력·영상으로 수행한다.
- 참고 수신 후 [Firewatch](https://www.firewatchgame.com/)의 뚜렷한 레이어 속도 차이, [Pudding](https://pudding.cool/process/scrollytelling-sticky/)의 sticky 무대, [Deep Sea](https://neal.fun/deep-sea/)의 현재 위치로 완결된 상태를 이해하는 원리를 반영했다. 이미지·코드는 복제하지 않았다. 기존 문구·아이콘·팔레트를 사용한 `LandingStory`로 기존 세 기능 설명을 보여준다. hero/CTA·방 생성·결과 화면은 유지한다.
- desktop 400svh·mobile/tablet 320svh의 한 구간 안에서 CSS sticky 무대가 머문다. 고정 무대 높이를 뺀 실제 진행거리(PC 약 300vh·모바일 약 220vh)를 세 읽기 구간으로 나누며 160~220ms 전환 외에는 완결된 문장을 계속 보여준다. 전경 이동 범위는 PC 190px/작은 모바일 100px, 원경은 520px/360px로 속도 차이를 둔다. 현재 절대 스크롤 위치로 0~1 진행도와 현재 단계를 계산하므로 큰 점프·역스크롤에도 중간 이벤트 순서에 의존하지 않는다.
- JS는 passive scroll/resize + requestAnimationFrame만 사용하며 스크롤을 취소하거나 감속하지 않는다. 단계 버튼은 키보드로 다시 읽을 수 있고 현재 단계를 aria-current로 표시하며 보이지 않는 패널은 aria-hidden/inert 처리한다. reduced-motion·높이 540px 미만·sticky/RAF 미지원·확대된 본문이 무대에 안 들어오는 경우에는 일반 흐름의 세 정적 패널을 제공한다. 장식 이동으로 발생하는 넘침과 본문 높이를 구분하고 전경 장식은 무대 안에서 clip한다.
- 기존 api:check·lint·typecheck·단위 테스트 39개·build가 통과했다. 최종 실제 Chrome desktop/mobile 전체 E2E는 81개 통과, 기존 모바일 전용 desktop 검사 1개 조건부 skip이다. sticky 위치 유지·같은 설명의 읽기 구간·원경/전경 이동량 차이·240px wheel·빠른 단계 점프·역스크롤·키보드 버튼/End·RAF 실패·reduced-motion·짧은 화면을 검증했다.
- 실제 Chrome 153.0.8010.54에서 이전과 같은 11개 viewport의 최초 hero/CTA, 각 완결된 설명 상태, 페이지 끝·가로넘침·200% 텍스트·sticky 미지원·RAF 실패를 확인했다. 320/360/390/430폭 모바일·768×1024·1440×900·1280×600는 sticky 활성, 높이 480/390/320의 짧은 화면·가로모드는 정적 fallback이다. 페이지 오류는 0개였다.
- 정상/빠른 스크롤 영상은 PC wheel 240px/220ms 및 900px/90ms, 모바일 native touchStart/Move/End(12회×35ms 및 8회×15ms)로 기록했다. 모바일은 viewport의 65%를 드래그하고 들어 올리기 전 100ms 멈추어 끝 상태를 읽으며 실제 브라우저 스크롤을 사용한다. 모든 영상은 현재 위치에 맞는 마지막 완결된 장면으로 끝나고 단계 버튼으로 재방문할 수 있다. GIF는 캡처 타임스탬프 간격을 유지한다. 영상·GIF·전경/원경 측정·viewport 화면·스크립트는 `test-results/landing-scrollytelling-2026-10-04/`에 보존한다. 실제 휴대전화 관성·주소창·Safari는 미검증이다. 기존 로컬 preview 4187을 재사용했으며 원격 push/PR/merge/deploy는 수행하지 않았다.

## 2026-10-04 — 설명 콘텐츠 스크롤 등장 후속 수정

- 운영 Chrome 확인 후 사용자가 밝기 변화보다 설명이 숨겨진 상태에서 스크롤에 따라 분명하게 나타나는 동작을 요청했다. 배포된 main `4690e53`의 깨끗한 상태에서 로컬 `feature/scroll-content-reveal` 브랜치로 후속 작업을 시작했다. 이번 범위는 로컬 구현·미리보기·검증이며 원격 push/PR/merge/deploy를 포함하지 않는다.
- 문장별 가로 clip 공개와 32px 위치 이동, 카드별 세로 clip 공개와 64px 위치 이동으로 변경한다. 첫 상태는 opacity 0이고 PC의 같은 줄 카드도 순서대로 시작한다. 기존 CSS view timeline을 사용하여 새 JavaScript·observer·스크롤 잠금 없이 구현하며 미지원 CSS·reduced-motion에서는 정적인 전체 내용을 제공한다.
- 검증 계획: 실제 Chrome의 모바일 320/360/390/430폭·태블릿·PC·짧은 화면·가로모드에서 최초/진입 중/완료 상태, 페이지 끝에서 모든 콘텐츠 공개, 키보드·높이 변화·fallback을 확인하고 PC/모바일 스크롤 동영상과 GIF를 보존한다. 기존 API 검사·lint·typecheck·단위 테스트·build·E2E를 실행한다.
- 실제 Google Chrome 153.0.8010.54에서 320×568, 360×640, 390×844, 430×932, 768×1024, 1440×900, 320×480, 844×390, 568×320, 844×320, 1280×600의 초기 숨김·진입 중 clip/이동·페이지 끝 전체 공개를 확인했다. 모든 크기에서 가로넘침·브라우저 오류가 없으며 reduced-motion·observer 부재·CSS timeline 미지원 fallback·200% 텍스트·높이 변경·Tab/Enter 이동이 통과했다.
- 기존 api:check·lint·typecheck·단위 테스트 39개·build가 통과했다. 전체 E2E를 기존 desktop/mobile 설정에 실제 Chrome channel만 임시 지정해 실행했고 79개 통과, 기존 모바일 전용 검사의 desktop 1개는 조건부 skip이다. Chrome clip 완료값의 0px/0% 직렬화 차이는 각 inset 수치가 0인지 확인하는 방식으로 검증했다. 실제 스크롤 좌표의 정수 반올림을 고려하여 범위 끝을 충분히 넘긴 완료 상태와 페이지 끝을 모두 확인했다.
- 스크롤은 테스트의 실제 wheel 입력으로 기록했다. PC/모바일 WebM 동영상, 그 프레임으로 만든 GIF, 전·중·후 화면과 측정·검증 스크립트는 `test-results/landing-content-reveal-2026-10-04/`에 보존한다. 실제 휴대전화 주소창·Safari는 미검증이며 운영 반영은 이번 요청 범위에 없다.

## 2026-10-04 — 스크롤 랜딩 UI

- 최신 원격 main을 조회해 `b7bb7a5`와 일치하고 사용자 변경이 없는 것을 확인한 뒤 로컬 `feature/scroll-landing-hero` 브랜치에서 작업했다. 서버 저장소는 수정하지 않았다.
- `/`의 최초 화면은 기존 브랜드 헤더 아래 요청 문구와 기존 모임 만들기 CTA에 집중한다. 배지와 설명 문장·기능 카드·진행 단계는 다음 스크롤 영역으로 옮겼다. `/create` 생성 동작과 `/rooms/:inviteCode` 결과 화면은 유지했다.
- hero CTA는 기존 팔레트의 `#0369a1` 단색·흰 글자로 강조했다(실브라우저 대비 5.93:1). 높이 56px, PC 중앙 너비 224px, 모바일 본문 전체 너비, 제목과의 간격 36px를 적용했다. 키보드에는 대비가 높은 3px 포커스 링을 표시하고 hover/active의 작은 이동·그림자 반응은 reduced-motion에서 이동 없이 동작한다. 다른 버튼·브랜드 문구·생성 동작은 유지했다.
- hero에 `100svh`와 `100vh` fallback을 사용해 모바일 주소창에 가려지지 않는 최초 화면 높이를 확보하고 주소창 접힘에 따른 재배치를 줄였다. 한국어 `keep-all`, 균형 줄바꿈과 유동 글자 크기로 고아 단어·가로넘침을 방지하고 높이 500px 이하에는 제목과 여백을 조정했다. 확대 시에는 고정 높이 없이 자연스럽게 스크롤할 수 있다.
- 설명 문장·각 기능 카드·진행 단계는 지원 브라우저에서 각각 CSS `view()` 타임라인으로 점진적으로 나타난다. opacity .35→1과 translateY 20px→0이 화면 진입량에 따라 실제로 변하는 것을 PC·모바일에서 검증했다. 스크롤 잠금·snap·observer·추가 JavaScript는 사용하지 않으며 미지원 브라우저와 reduced-motion에서는 정적으로 표시한다. 기존 키보드 포커스와 생성 폼 진입 동작을 확인했다.
- 실제 Microsoft Edge의 desktop/mobile Playwright 프로젝트에서 320×568, 360×640, 390×844, 430×932, 768×1024, 1440×900, 320×480, 844×390, 568×320, 844×320, 1280×600의 최초 화면·스크롤 후를 검증했다. CTA가 최초 뷰포트 안에 있고 설명은 다음 영역에 있으며, 모든 크기에서 제목 두 줄·가로넘침 없음·자연 스크롤을 확인했다. 뷰포트 높이 664→844→564 변경, Tab/Enter, observer 부재, reduced-motion 및 200% 텍스트 확대도 확인했다. 실제 휴대폰 주소창과 Safari는 검증하지 않았다.
- lint·typecheck·build 및 단위/컴포넌트/API 39개가 통과했다. CTA 강조 후 최종 전체 E2E는 75개 통과, 기존 모바일 전용 검사의 desktop 실행 1개 조건부 skip이다. CTA 색 대비·Tab/Enter 진입·hover/active·reduced-motion과 기존 11개 뷰포트·스크롤 reveal을 검증했다. 브라우저 좌표 계산의 0.0001px 미만 오차를 고려해 높이·너비 검사는 0.005px 미만 허용치를 사용한다. build의 기존 Zod 순수성 주석 경고는 남아 있다.
- `api:check`의 기존 실패 경로는 사용자 `core.autocrlf=true` → 생성 타입 체크아웃 CRLF 1,281개 → 생성기 출력 LF → 검사 스크립트의 원문 비교였다. `.gitattributes`에서 `src/api/schema.d.ts` 한 파일만 `text eol=lf`로 고정하고 실제 내용 차이가 없음을 확인한 뒤 Git blob의 LF 바이트로 복원했다. 원래 `corepack pnpm api:check`가 통과하고 생성 타입과 검사 스크립트의 Git diff는 없다. 전역 Git 설정과 API 계약은 유지했다. 별도 복사본에서 타입명을 `paths_stale_probe`로 바꾼 음성 검사는 exit 1과 stale 오류로 실패해 실제 차이를 계속 탐지함을 확인했다. Git blob·생성 결과 SHA-256은 `0a3ef82998746b79ac898396aa336feb0d9ee618771aafd41aaf58d34023aed5`다.
- 전후 화면과 뷰포트 측정·API 줄바꿈 증거는 `test-results/landing-ui-2026-10-04/`에 보존한다. 작업 범위는 로컬 구현과 검증이며 원격 push·PR·merge·배포는 실행하지 않았다.
- CTA 강조 화면 8장과 측정값은 `test-results/landing-cta-2026-10-04/`에 보존했다. 민감정보가 없는 대표 PC·모바일 최초화면은 Library에 `cta-desktop-initial.png`와 `cta-mobile-390-initial.png`로 저장했다.

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

### 게시 상태

- 기능 구현 커밋은 `911785c6ec39a66b86a99314c14ae5c7663abc17`, 브랜치는 `feature/natural-language-only-submission`, 웹 draft PR은 [#4](https://github.com/meet-me-duo/meet-me-web/pull/4)다. 구현 커밋의 verify CI가 성공했으며 문서 정리 커밋의 head도 PR checks에서 확인한다. 기능/API 검증 결과와 배포 순서는 위 기록을 유지한다.
- 현재 main merge·운영 배포는 미실행이다. 조율자의 PR/CI 검토 완료 신호 전에는 ready/merge/deploy하지 않으며, 웹 배포→새 실제 공개 번들의 모든 API 목·unknown 차단 검증→서버 배포 순서로 진행한다.

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
