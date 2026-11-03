# 본인 입력 관리와 수동 마감 — 독립 cloud 로컬 검증

## 범위와 기준

원격 main `9bdea4f682aba3a5a3bd2ce7719eaaaf5622b28a`, develop
`11d2c5163a0cd7d0b01e4e7ac0685765a9eb04fb`를 읽기 확인했다. 두 파일 tree는
`d43fd7fd979cc58cb732f57b6e241aa87580fe0c`로 같다. 기존 worktree/산출물을
보존하고 최신 develop에서 `feature/manual-close-actions`를 분리했다.
AGENTS.md 및 checkout `.agents/skills`는 없었다. README, ARCHITECTURE,
BRANCHING, IMPLEMENTATION_LOG, CI/Playwright/UI_PREVIEW 지침을 읽었다.

사용자의 최신 요청은 앞선 세 버튼 구성을 대체한다. 상단 모임 카드는
변경하지 않고, 하단은 본인 입력과 수정·조건부 수동 마감에 집중한다.
확인 취소 버튼과 주최자 도구 토글을 제거했다. 정상 접수 완료에서는
추가 저장·제출 안내 토글도 숨기며 실패·질문·편집 상태의 안내는 유지한다.

| 기존 상태/역할 | 표시 동작 |
| --- | --- |
| 수집 중 수동 마감 HOST | 기존 수정 가능 시 수정 + 붉은 마감 버튼 |
| MEMBER/게스트 참여자 | 기존 수정 가능 시 본인 수정만 |
| 자동 마감 HOST | 수정 가능 시 수정, 수동 마감/주최자 토글 없음 |
| QUEUED/CHECKING 정상 로딩 | searching64px 유지, 수정·취소·마감 없음 |
| NEEDS_EDIT/실패/timeout | 실제 상태 문구, 기존 수정·허용 재시도와 조건부 마감 |
| NEEDS_CHOICE | 기존 질문/답변·원문 편집 흐름 유지, 취소 버튼 없음 |
| 마감/분석/결과 | 수동 마감 새 노출 없음, 기존 읽기/복구 조건 유지 |

cancel API, version/request-id 계약, CANCELLED 응답 및 취소 handler를
삭제하지 않았다. 기존 클라이언트의 명령 직렬화와 외부 취소 snapshot의 원문
보존을 synthetic fetch로 검증한다. NEEDS_EDIT 문구/매핑, 질문 표시 조건,
V1/V2 프로토콜과 conditional-v1 API 계약을 변경하지 않았다. 실제 방의
payload/원인, 모델 내부 단계·dispatch를 UI만으로 추정하지 않는다.

RoomCloseConfirmation의 붉은 스타일·명시적 확인창, 돌아가기/Escape/focus
복원·Tab 순환·pending 비활성·단일 요청 잠금·오류/이탈 처리를 그대로 쓴다.
새 액션 그룹은 8px 간격,44px 이상 버튼과 flex-wrap을 사용한다. legacy
입력 화면도 같은 수동 마감 제한으로 정리하되 correction 복구는 유지한다.

UI/UX Pro Max 공식 지침을 수동 적용했다(접근성·44px touch·8px spacing·
responsive wrap·focus). 기존 shadcn 기반 Button을 사용하고 의존성/CLI/
전역 reset은 추가하지 않았다. React 검토에서 새 effect/state/구독·요청을
추가하지 않고 JSX/표시 조건만 바꿨음을 확인했다.

- https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md
- https://ui.shadcn.com/docs/components/button

## 검증

최종 결과는 새 검토 산출물의 verification.json 및 전체 logs에 기록한다.
단위836/79파일, API/lint/typecheck/preflight3/build, 합성 evidence6와 지원
UI preview18을 실행했다. 전체 표준 desktop/mobile E2E575PASS/기존skip1/실패0/flaky0/retry0다.
별도 aggregate 스크립트는 없으며 CI verify의 적용 가능한 단계를 실행한다.

명령은 `corepack pnpm api:check`, `lint`, `typecheck`, `test`,
`test:evidence:preflight`, `build`, `test:evidence`, `test:ui-preview`와
`LOCAL_E2E_PORT=4197 CHROMIUM_PATH=/usr/bin/chromium corepack pnpm exec playwright test --config playwright.local.config.ts`다.
pnpm10.17.1 frozen install/ignore-scripts 및 무료 시스템 Chromium을 사용했다.
기본4173 포트가 점유되어 기존 프로세스를 재사용/종료하지 않고 동일 로컬
설정을4197로 실행한다. retries0, 기존 표준 popup fixture와 project를 유지한다.

최신 요청 전 세 버튼 중간 작업/실패한 초기 asynchronous UI 기대값은 별도
superseded 기록으로 보존한다. 완료 안내 토글 정리 전 전체 브라우저는
중단했고 수동 마감 fixture와 생성 폼 불일치3건을 수정했다. 포트 점유로
시작하지 못한 실행도 보존한다. 이 결과를 최종 통과 수와 합산하지 않는다.

참조 screenshot은 지원 materialize와 소비 환경 경로1회 재준비에서 로컬
파일을 얻지 못했다. 반환 저장소가 환경 허용 목록에 없어 추가 다운로드나
우회·재업로드를 하지 않았다. 실제 픽셀을 보거나 참조와 일치한다고 주장하지
않으며 개인 이미지/원문을 산출물에 포함하지 않는다. 구현/미리보기는 명시된
텍스트 요구와 개인정보 없는 합성 fixture에 근거한다.

실제 모델/운영 API 호출0, 서버 변경0, push/PR/merge/deploy0이다.
native backend·실제 OAuth·실기기/Safari/Firefox/Windows·배터리는 미실행이다.
기존 jsdom Canvas2D/Vite chunk 크기 경고를 실제 Chromium 검증과 구분한다.
