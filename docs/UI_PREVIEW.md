# 밝은 UI 실험을 PC에서 확인하기

브랜치: `feature/ui-deepseek-experiment`. Node.js 22 이상과 Corepack/pnpm을 사용한다.

원격에 게시하지 않은 Git bundle을 전달받았다면 기존 저장소에서 아래처럼 별도 브랜치와 worktree로 가져온다. 같은 이름의 로컬 브랜치가 이미 있으면 이름을 바꾸고, 기존 브랜치를 강제로 덮어쓰지 않는다.

```sh
git bundle verify /path/to/meet-me-ui-light.bundle
git fetch /path/to/meet-me-ui-light.bundle feature/ui-deepseek-experiment:feature/ui-deepseek-experiment
git worktree add ../meet-me-web-ui-review feature/ui-deepseek-experiment
cd ../meet-me-web-ui-review
corepack pnpm install --frozen-lockfile
corepack pnpm preview:ui
```

터미널에 표시되는 <http://127.0.0.1:4175/__preview>를 연다. `localhost` 대신 위 주소를 사용한다. 포트가 사용 중이면 환경 변수 `UI_PREVIEW_PORT`에 다른 1024~65535 포트를 지정하고 출력 주소로 접속한다.

## 둘러보기

화면 목록에서 랜딩, 로그인, 모임 만들기, 내 모임/빈 목록, 계정 보안, 조건 입력/확인 중/저장 완료, 분석 중, 추천 3개, 확정 결과, 리뷰, 일치 없음, 조회 실패를 선택할 수 있다.

- 합성 계정의 생성 폼과 조건 제출, 주최자 마감, 추천 선택·확정, 리뷰 제출·닫기를 직접 눌러 본다.
- 조건 제출은 고정된 성공 응답이고, 마감하면 즉시 추천을 보여준다. 실제 AI가 해석하는 것이 아니다.
- 로그인 화면의 Google/Kakao 디자인·focus는 확인할 수 있지만 실제 로그인 요청은 거절된다. 로그인 상태는 목록에서 “합성 계정” 화면을 선택한다.
- 화면을 다시 선택하면 새 합성 세션으로 초기화한다. 같은 브라우저의 탭은 세션을 공유한다.
- 실제 개인정보를 입력할 필요가 없다. 입력과 상태는 서버 프로세스 메모리에만 있고 Ctrl+C로 종료하면 사라진다.
- 지원하지 않는 동작은 명시적인 501 응답으로 끝난다. 서버나 OAuth로 우회 연결하지 않는다.

데스크톱뿐 아니라 개발자 도구의 320px/390px, 키보드 Tab/Enter, OS 모션 감소 설정도 비교하면 좋다. 예전 화면과 비교하려면 다른 worktree를 사용한다. 이 브랜치를 develop/main에 합칠 필요가 없다.

## 격리 방식

`preview:ui`는 API base를 빈 값으로 고정해 별도 `.ui-preview-dist/`에 빌드한다. 이 폴더는 git과 lint에서 제외하며 일반 `dist/`를 덮어쓰지 않는다. `127.0.0.1`에만 바인딩하고 Host/Origin 검사, same-origin CSP를 적용한다. HTTP 서버는 원격 proxy 코드를 갖지 않는다. Node 합성 fixture는 `src/`에 import되지 않으며 정상 production 번들에 포함되지 않는다. 공개 공유용 서버가 아니다.

```sh
corepack pnpm api:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
corepack pnpm test:ui-preview
```

브라우저 테스트는 Playwright Chromium 설치가 필요하다. 기존 `test:e2e` 설정은 로컬 msedge를 사용한다. 별도 미리보기 테스트는 기본 Chromium을 쓰며, 설치된 Chromium 경로를 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`로 지정할 수도 있다. `test:ui-preview` 전에 수동 `preview:ui` 서버를 종료한다.

브랜치의 로컬 확인과 채택 여부 결정이 목적이다. 원격 push/PR·develop/main 병합·운영 배포·공개 프리뷰는 별도 단계다.
