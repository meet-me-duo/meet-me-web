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

## 2026-10-29 사용자 로컬 피드백 — 카드 모션·하단 아이콘·hero 문구

- 기준은 원격 `f3902cc93d0078ea0a05714f146e3e451b5d8fea`다. 새로 보이는 카드에 같은 프레임에 효과를 적용해 첫 세 카드가 사실상 동시에 끝나던 점을 수정했다.
- 이전: threshold .15, 별도 rootMargin 없음, 500ms ease-out, 16px, opacity .65→1, stagger 0. 초기 관측 callback은 intersectionRatio를 검사하지 않았다.
- 이후: intersectionRatio ≥.30와 하단 rootMargin -48px, 850ms cubic-bezier(.2,.65,.3,1), 24px, opacity .75→1. 같은 callback에서 새로 들어온 카드만 DOM 순서로 0/180/360ms 지연한다. 모바일에서 뒤늦게 단독으로 들어오는 카드는 0ms부터 시작한다. 콘텐츠를 미리 숨기거나 스크롤을 고정하지 않는다.
- Chromium 1440×900 실측: 이전 시작 이벤트 41.8/41.9/42.0ms로 사실상 동시, 이후 77.3/232.9/416.6ms로 순차 시작. 애니메이션 elapsedTime은 .5→.85초, 세 카드의 시작~마지막 종료 구간은 약 .56→1.20초다. 이벤트 dispatch는 프레임·캡처 부하에 따라 달라지므로 명목 180ms와 측정값을 구분한다.
- 390×900에서는 앞의 두 카드가 0/180ms 지연으로 들어오고, 스크롤 후 세 번째는 자체 trigger에서 0ms 지연으로 시작했다. desktop/mobile reduced-motion에서 세 카드 모두 animation none·opacity1·transform none을 확인했다.
- 하단 단계는 순서 있는 목록으로 정리했다. 번호 배지는 25→22px의 낮은 강조 테두리로, 보조 아이콘은 24→16px·stroke1.75로 통일했다. Link2 / MessageSquareText / Check를 사용하며 단계 문구는 유지한다. 아이콘은 aria-hidden으로 텍스트 중복 낭독을 피한다.
- hero는 요청대로 정확히 “조건만 말하세요, 결정은 Meet me가 할게요”로 복원했다. 320/390/1440px에서 실제 화면·문구·가로 넘침을 확인한다.

실측 JSON·전후 캡처: `/workspace/shared/ui-motion-refinement/`. 기존 API/인증/공식 로그인 버튼은 수정하지 않았다.

후속 최종 검증: lint·production build(tsc 포함) 통과. landing/ui-refresh desktop·mobile 56개 중 **55통과·기존 desktop 전용 skip1·실패0**. 실제 진행률을 비교하는 순차 등장 검사와 모바일 뒤늦은 카드의 지연 없는 시작, reduced-motion 전환 검사를 포함한다. 320/390/1440px 화면은 모두 가로 넘침0, 정확한 hero textContent, 16px/stroke1.75 아이콘을 확인했다. 첫 회에는 inline-block 강조 span 때문에 접근성 이름에 `Meet me 가` 공백이 생겨 정확한 이름 검사2개가 실패했고, inline으로 보정해 전체 관련 검사를 재실행했다. 기능/API/인증 변경은 없어 전체 비관련 단위·브라우저 suite는 반복하지 않았다.

## 2026-10-29 추가 피드백 — 더 아래에서 느리게 상승

기준 `5c791888cb7e9d93ecddc7c5571d955640fb05f2`에서 카드 이동을 24→56px, duration을 850→1150ms, easing을 cubic-bezier(.2,.65,.3,1)→cubic-bezier(.22,.61,.36,1)로 조정했다. 끝에서 기울기가 0이 되어 부드럽게 감속한다. opacity .75→1, 동일 관측 묶음의 180ms stagger, 30%/하단48px trigger, 나중에 보이는 모바일 카드의 독립 시작은 유지한다. hero 문구·하단 아이콘·기능 로직은 변경하지 않는다.

420ms 캡처에서 움직이는 카드가 다음 패널과 겹치는 것을 발견해 모바일 카드 행 간격을 24→56px, 하단 안내 패널과의 간격을 32→64px로 확보했다. 스크롤 잠금이나 대기 화면 없이 transform만 움직인다. 순차 등장 도중 카드끼리와 다음 패널의 경계가 겹치지 않는 검사도 추가했다.

1440×900 최종 표본의 animationstart는 73.3/244.0/425.7ms, end는1222.0/1388.8/1572.4ms다. 이벤트 elapsedTime은 각각1.15초, 첫 시작~마지막 종료는 약1.50초(이전 약1.20초)였다. 실제 event dispatch 간격과 명목180ms를 구분한다. 390×900의 뒤늦은 세 번째 카드는 delay0ms, desktop/mobile reduced-motion은 animation none·opacity1·transform none, 가로 넘침0을 확인했다. 캡처·실측은 `/workspace/shared/ui-motion-refinement/slower-spaced*`에 보존한다.

최종 검증: production build(tsc 포함)·lint·diff check 통과, landing desktop/mobile **45통과·기존 desktop skip1·실패0**. 순차 진행률·이동 중 패널 경계·11개 화면 크기·키보드·observer 미지원·reduced-motion을 확인했다. 행 간격 보강 후의 중간 실행에서는 예전 모바일 스크롤 위치가 두 카드를 동시에 진입시켜 단독 카드 delay0 assertion2개가 실패했다. 두 번째 카드를 먼저 관측한 뒤 세 번째로 이동하는 실제 순차 스크롤 절차로 테스트를 보정하고 전체 landing 검사를 다시 통과했다. `.github/workflows`, hero JSX, 단계 아이콘, observer 로직은 기준 커밋과 동일하다.
