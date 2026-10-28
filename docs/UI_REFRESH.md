# UI 정돈 · 2026-10-28

## 기준과 범위

독립 clone의 `feature/ui-brand-refresh`, `origin/develop` 656f757 기준이다.
조사 시 main 0c7a29b와 develop의 기능 트리는 동일했다. 기존 개인 PC
저장소는 읽기만 했고 작업 트리가 깨끗함을 확인했다.

하늘색 브랜드를 유지하면서 흰 카드, 단색 CTA, 읽을 수 있는 보조 문구,
입력 테두리와 키보드 포커스, 8/12/16/24px 간격 토큰을 사용한다.
기존 glass-card 클래스는 호출부 호환을 위해 유지하고 표현만 불투명 카드로 바꿨다.
동등한 시간안은 같은 표현을 쓰며 랜딩의 Plan A/B/C·우선순위 설명을
현재 최대 3개 시간 선택 및 실제 시작/종료 선택 동작에 맞췄다.
주최자가 미반영 조건을 확인하는 기존 권한도 랜딩에 명시했다.

계정/OAuth·API·AI·개인 입력·미저장 초안 로직과 확정 결과 TSX는 변경하지
않았다. 서버·AWS·운영 설정, 리뷰 기능과 재노출 정책은 범위 밖이다.

후속 사용자 요청에 따라 지속적인 UI 작업 기준을 기존 `docs/ARCHITECTURE.md`에
추가하고 기존 README 문서 링크에서 안내했다. 웹의 추적 파일에는 AGENTS.md나
프로젝트 전용 `.agents/skills`가 없어 중복 지침 파일을 새로 만들지 않았다.
설치 확인·공식 원본의 버전 변화·미설치 시 문서/소스 수동 적용·승인 경계와
회귀 검증을 명시했다. 로컬 UI 스킬을 설치하거나 설치됐다고 기록하지 않았다.

## 디자인과 컴포넌트 출처

- [UI/UX Pro Max SKILL.md](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md)와
  [Quick Reference](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/references/quick-reference.md)를 먼저 읽었다.
  접근성·터치·오류·모바일·줄바꿈의 정적 지침을 적용했다. 외부 스크립트와
  디자인 시스템 검색기를 실행하거나 패키지로 설치하지 않았다.
  데이터베이스 검색 결과로 디자인을 선택했다고 주장하지 않는다.
- [shadcn/ui 원본](https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/new-york-v4/ui)의
  Card 구조·data-slot과 Button 변형/네이티브 props를 기존 전역 CSS에
  맞게 가져왔다. 생성 화면과 로그인 진입부터 적용했다. CLI init·Tailwind·
  Preflight·Radix 의존성을 추가하지 않았다. MIT 고지는 `src/components/ui/NOTICE.md`에 있다.
- Google/Kakao는 공식 완성형 버튼을 원본 비율로 같은 너비에 표시한다.
  출처와 선택 자산은 `public/brands/README.md`에 있다. 기존
  `/api/auth/{provider}/start`와 로그인 복귀 함수를 그대로 사용한다.

## 첨부 검토 차단

사용자가 제공한 두 Library 첨부의 prepare_materialize 후,
현재 스킬의 transfer helper와 companion을 이 실행 환경에 받아 실행했다.
공식 helper가 Windows Python의 `os.setxattr` 미지원으로 실패했다.
지원된 materialization이 완료되지 않아 첨부 픽셀을 확인하지 못했다.
다른 환경 경로를 사용하거나 메타데이터 보존을 우회하지 않았다.

## 검증 기록

최종 실행 결과는 아래에 기록한다. 로컬 API 대역 E2E는 운영 OAuth나
실제 AI 호출 검증을 의미하지 않는다. main 병합과 운영 배포는 별도 승인이다.

- Node 24.11.0, pnpm 10.17.1, 잠금 파일의 React 19.3.0 / Vite 7.3.6.
  독립 clone에서 `install --frozen-lockfile --ignore-scripts`를 실행했다.
  package.json과 잠금 파일 변경은 없다.
- `lint`, `typecheck`, `api:check`, `build` 통과. API 생성 타입이 기존
  OpenAPI snapshot과 일치한다. 빌드에는 기존 Zod 주석과 500KB chunk 경고가 있다.
- 전체 Vitest: 63개 파일 / 689건 통과. 공식 자산 공통화 후 인증 진입·
  계정 복구·개인 초안 경계를 다시 실행해 3개 파일 / 28건 통과했다.
- 전체 Playwright: Edge desktop / Pixel 7 에뮬레이션, 433건 통과,
  기존 모바일 전용 검사 데스크톱 1건 skip, 실패 0. 320/360/390/430/768/1440px,
  짧은 화면, 축소 동작, 키보드, 스크롤 역행·복귀, Unicode 500/501 경계,
  제출·저장 결과 미확인/오류·분석 중·미저장 초안·접근 거부·실제 시간 확정과
  반복 동작을 포함한다.
- 전체 회귀 이후 입력 테두리만 #94a3b8 → #64748b로 보정하고 사용하지
  않게 된 `.button.kakao` 규칙을 제거했다. 입력 경계/흰 배경 대비는 4.76:1,
  기본 CTA/흰 글자 5.93:1, 보조 글자/페이지 배경 4.55:1이다.
  최종 build와 관련 브라우저 검사 결과는 verification manifest에 기록한다.
- 최종 build의 UI·생성 폼·저장/초안/부분 결과 E2E 74건 모두 통과했다.
  최종 문서 수정 후 `git diff --check`와 README/아키텍처 진입점·참조 파일을 확인했다.
- 실제 휴대전화·Safari와 운영 OAuth/AI는 미검증이다.

검토 캡처와 실행 요약은 `docs/verification/ui-refresh/`에 보관한다.
