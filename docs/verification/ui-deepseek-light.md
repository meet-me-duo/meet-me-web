# 밝은 UI 실험 검증

2026-10-29 UTC. 기준 `22eb625b32056e0762efdc81b168cf31d4fa827a`, 브랜치 `feature/ui-deepseek-experiment`. Linux system Chromium을 사용했다. 기존 Playwright 설정의 로컬 msedge 대신 실행 파일 경로만 임시 설정으로 바꾸었으며 이 임시 설정은 커밋하지 않는다.

## 결과

| 검사 | 결과 |
| --- | --- |
| `pnpm api:check` | OpenAPI 생성 타입 일치 |
| `pnpm typecheck`, `pnpm lint`, `git diff --check` | 통과 |
| `pnpm build` | 통과. 기존 Zod 주석·500kB chunk 경고 유지 |
| 전체 단위 테스트 | 71파일·784개 중 783 통과, 게스트 재접속 1개 5초 timeout. 해당 파일을 다시 실행해 16/16 통과. 단일 실행 784/784 통과로 표기하지 않음 |
| 최초 전체 E2E | 508개 중 481 통과·26 실패·1 기존 desktop skip. 이 최초 실행은 아래 CSS 보정 이전 빌드 |
| 최종 빌드의 관련 E2E 재검증 | landing/ui-refresh/submission-flow/social-login-feedback 130개: **127 통과·2 실패·1 기존 skip**. 초기 랜딩 overflow/CTA 높이와 room poll 실패는 재검증 통과 |
| 합성 미리보기 | desktop/mobile 총 **10/10 통과**. 15개 화면, 생성→제출→마감, 추천 선택→확정→새 세션 초기화, 리뷰, OAuth 로컬 안내, Host/Origin 경계, CSP, production 번들 격리 |
| 화면 캡처 | 320/390/1440px × 15상태 = **45개**. 가로 넘침 0, JS 오류 0, 외부 요청 0, 미지원 API(501) 0. reduced-motion 사용 |

최종 E2E의 두 실패는 `social-login-feedback.spec.ts`의 “a new-tab click leaves the source page available” desktop/mobile이다. Control+클릭 팝업의 fixture가 해당 Chromium 실행에서 처리되지 않아 로컬 Vite proxy의 연결 거절과 `chrome-error://chromewebdata/`가 나타났다. **변경 전 main 전체 소스를 별도 `/tmp`에 추출·빌드해 같은 두 테스트를 실행했을 때도 동일하게 실패했다.** OAuth 제품 코드·자산·테스트를 이 현상 때문에 수정하지 않았다. 다른 공식 버튼 크기·hover/focus·Enter 이동·복귀 검사는 통과했다. 실제 OAuth 성공을 검증한 것은 아니다.

최초 전체 E2E 실패 구성은 랜딩 22개(320~430px 4px overflow 및 큰 화면 CTA 48.5px), 모바일 ui-refresh overflow 1개, HOST 결과 poll 1개, 위 OAuth 새 탭 2개다. 배경의 실제 컨테이너 폭과 CTA padding을 수정했고 카드 모바일 CSS 충돌도 수정했다. 이후 관련 전체 파일을 재검증했다. 최초 실패를 숨기거나 최종 전체 E2E 508개가 모두 통과했다고 주장하지 않는다.

## 검증 범위

- 랜딩 11개 화면 크기, 짧은 가로 화면, 키보드 Tab/Enter·앵커 이동, 모션 감소·동적 변경, observer 미지원, 스크롤 왕복, 주 CTA 텍스트 대비 및 focus.
- API/auth/분석/데이터 계약 파일 변경 없음. 공식 provider 버튼 전용 클래스와 자산 변경 없음.
- `.ui-preview-dist`는 일반 `dist`와 분리. UI 프리뷰 테스트는 잘못된 외부 API base 환경 변수를 일부러 주어도 loopback으로 고정되는지 확인한다.
- 모든 production JS에서 합성 token·미지원 fixture code·scene URL marker가 없음을 검사했다.
- 미리보기는 정해진 합성 상태다. 실제 OAuth, 서버의 해석 품질·보안·성능, 운영 데이터 동작을 검증하지 않는다.
- 참고 DeepSeek 사이트의 모바일·reduced-motion 관측은 차단 때문에 미완료지만 Meet me 자체 검증과 혼동하지 않는다.

## 증거 보존

실행 로그·45개 PNG·화면 JSON: `/workspace/shared/ui-experiment-light-evidence/`.

- `build-final.log`, `final-regression.log`, `preview-verified.log`
- `unit-reaccess-rerun.log`, `baseline-build.log`, `baseline-oauth.log`
- `screens.json`, `meet-me-light-1440.png`, `meet-me-light-390.png`
- 초기 E2E 실패 자료 `initial-e2e/`와 초기 미리보기 테스트 로그 보존

사용자 전달용 bundle/patch/설명과 대표 PNG는 별도 로컬 전달 패키지로 만든다. 원격 게시·PR·병합·운영 배포는 수행하지 않는다. 캡처의 Library 첨부는 전송 helper가 `hosted apps tools/list request failed: network`로 실패해 미완료다. 로컬 원본은 보존했고 다른 업로드 경로로 우회하지 않았다.
