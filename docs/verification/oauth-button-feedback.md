# Google/Kakao 로그인 상호작용 개선 (2026-10-28)

## 범위와 기준

- 원격 재조회: main `59a5b104cfb14992bd25c5775f65bb4af136a6b8`, develop `c5641a6147833a6d28d9485ce9c3d0edb2b1e2ee`. 두 브랜치의 작업 트리는 동일했다. `docs/BRANCHING.md`에 따라 develop 기반 `feature/oauth-button-feedback`에서 작업했다. 시작 시 사용자 변경은 없었다.
- 웹/상위 workspace에 적용되는 AGENTS.md 및 설치된 UI/UX Pro Max/shadcn 스킬은 발견되지 않았다. `/workspace/.agents`와 `/workspace/.codex`는 비어 있었다. 저장소 `docs/ARCHITECTURE.md`, `docs/BRANCHING.md`, 브랜드 출처와 아래 공식 원문을 확인해 수동 적용했다.
- 서버 저장소, API snapshot, OAuth/redirect/refresh 보안 계약, 운영 설정은 수정하지 않았다. 공식 Google SVG의 경로/20px 정비율과 Kakao 완성형 SVG/224:46 비율, Google neutral 표면과 기존 46px 링크 영역을 유지했다. 설치 의존성/lockfile 변경 없음.

## 실제 원인과 변경

로컬 Chromium에서 기존 화면을 재현했다. Google은 상태 오버레이가 있지만 Kakao는 hover 그림자만 있어 mouse down 전후 상태가 같았다. Google의 hover 선택자가 뒤에 있어 active의 12% 오버레이를 8%로 덮기도 했다. 둘 다 클릭 후 pending/disabled/상태 안내가 없었다. 키보드 포커스 링과 OAuth 시작 링크는 이미 제공되고 있었다.

공통 외곽 눌림 피드백, 제공자 이름을 포함한 이동 안내, `aria-disabled`/`aria-busy`, 동기 중복 클릭 잠금을 추가했다. Google의 공식 자산/내부 상태 색상을 유지하고 CSS 우선순위를 수정했다. 진행 중에는 공식 자산을 가리거나 재색칠하지 않는다. 대기 안내 공간을 미리 확보한다.

일반 로그인 카드와 계정 복구 카드가 같은 방에서 함께 나타날 수 있어 문서 메모리의 상태를 공유한다. 두 공급자 및 두 카드의 연속 이벤트를 모두 차단한다. 마지막 카드 언마운트/새 페이지는 초기화하고 BFCache `pageshow`에서도 복원한다. 화면에 남아 있는 이동이 15초 지연되면 명시적 재시도를 허용하며 자동 재요청은 하지 않는다. 준비 콜백 예외는 이동을 중단하고 고정 오류만 표시한다. 수정키 클릭/새 탭 기본 동작은 원래 탭을 잠그지 않는다.

첫 클릭의 `href`는 React commit 이후에도 남겨서 브라우저 기본 이동이 취소되지 않게 했다. 진행 중 재클릭만 `preventDefault`한다. 기존 명시적 disabled 링크는 계속 href를 제거한다. 기존 로그인 복귀 저장 콜백과 경로를 유지하며 사전 fetch/SDK/토큰 저장은 추가하지 않았다.

## 검증 근거

- `SocialLoginActions.test.tsx`: 제공자별 pending, 같은 tick 중복 이벤트, 두 카드 공유 잠금, 준비 오류/재시도, 수정키 클릭, 타이머/언마운트, BFCache 복원.
- `social-login-feedback.spec.ts`: 데스크톱/Pixel 7 에뮬레이션, 실제 native GET 이동과 Enter, 뒤로가기, HTTP 204 대역으로 지연/재클릭/재시도, hover/active/focus/축소 동작, 새 탭.
- 기존 `ui-refresh.spec.ts`: 320/390/1440px, 공식 자산과 터치 영역/가로 넘침, 원래 복귀 경로. 기존 생성/참여/분석/추천/확정/오류 전체 회귀도 실행한다.
- 독립 에이전트가 두 카드 사이 잠금 누락과 Google pending 커서 차이를 발견했다. 수정 후 로컬 익명 HOST 방/204 OAuth 대역에서 교차 카드 재클릭 차단, pageshow 복원과 Kakao 명시 재시도, progress 커서를 재현했고 추가 차단 사항 없이 재검토 통과했다.

최종 검사: 단위 **762/762**, E2E **483 PASS/기존 skip 1/실패 0**, 새 로그인 E2E **12/12**, retry **0**. lint/typecheck/API 계약/build/diff 검사 통과. 빌드에는 기존 Zod 주석 및 500kB chunk 경고만 있다. 전체 E2E는 484건을 수집했고 기존 landing의 프로젝트 조건부 skip 1건을 유지했다. [검사 manifest](oauth-button-feedback.json)에 실행 결과와 소스 SHA-256을 남겼다. 로컬 원시 로그는 `/tmp/meet-me-oauth-evidence/`에 둔다.

캡처: [Google 눌림/desktop](oauth-button-feedback-images/google-pressed-desktop.png), [Kakao 눌림/desktop](oauth-button-feedback-images/kakao-pressed-desktop.png), [Google 대기/mobile](oauth-button-feedback-images/google-pending-mobile.png), [Kakao 대기/mobile](oauth-button-feedback-images/kakao-pending-mobile.png). 캡처의 로고·색상·줄바꿈·가로 넘침을 직접 확인했다.

## 검증 한계

모든 인증 응답과 OAuth 목적지는 합성 로컬 대역이다. 실사용자 계정 로그인/가입, 실외부 OAuth, 실제 BFCache 적중 보장, 실기기, 운영 API/AI 검증은 하지 않았다. 뒤로가기는 실제 브라우저 이동으로, persisted 페이지 복원은 별도 pageshow 이벤트로 검사했다. 앱을 떠난 뒤의 OAuth 서버/공급자 HTTP 오류는 브라우저/기존 서버 화면의 책임이며 이번 코드가 감지하거나 성공으로 표시하지 않는다.

Playwright가 요구한 Chrome for Testing 다운로드는 `cdn.playwright.dev`의 HTTP 403 `Domain forbidden`으로 실패했다. 재시도/우회 대신 설치된 `/usr/bin/chromium` 151.0.7922.173으로 실행했다. 이 조합에서는 새 탭 첫 요청의 context.route 포착이 되지 않아, 새 탭 목적지만 GET OAuth 시작 경로에 응답하는 loopback HTTP 대역(127.0.0.1:8080)으로 보완했다. 기본/모바일 실행 설정은 `/tmp/meet-me-oauth-evidence/playwright.local.config.ts`, 대역은 `oauth-popup-fixture.mjs`에 있으며 실서버 저장소/프로세스는 사용하지 않는다. CI의 기존 설정과 재시도 정책은 수정하지 않았다.

## 적용한 공식 지침

2026-10-28 조회. 상호작용·접근성·상태 안내와 최소 범위 개선만 적용했고 새로운 디자인 시스템 생성/CLI init/Tailwind reset은 하지 않았다.

- [UI/UX Pro Max README](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/README.md), [SKILL.md](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md), [Quick Reference](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/references/quick-reference.md): 터치/키보드/상태 안내, 중복 입력 방지, 축소 동작, 문서화된 브라우저 범위. 웹 기준을 적용했다.
- [shadcn Button 문서](https://ui.shadcn.com/docs/components/button), [공식 Button 소스](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button.tsx): 네이티브 의미론, 포커스와 disabled 상태, 현행 공통 Card/Button 구조 유지. 새 코드를 복사하지 않아 기존 `components/ui/NOTICE.md`를 유지했다.
- [Google 브랜드 가이드](https://developers.google.com/identity/branding-guidelines), [Kakao 디자인 가이드](https://developers.kakao.com/docs/ko/kakaologin/design-guide): 로고/색상/비율과 동등한 강조 유지. 기존 `public/brands/README.md` 자산 출처/라이선스 유지.
- `vercel:react-best-practices`: hook/구독/상태/의존성/접근성 검토. `vercel:verification`: 버튼→서버 OAuth 시작 GET→합성 목적지→뒤로가기/상태 복원의 웹 경계를 검사했다. 서버/외부 공급자 경계는 승인 범위에 포함되지 않아 확대 검증하지 않았다.
