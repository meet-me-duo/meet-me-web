# 리뷰 디자인 통합과 구 API 호환 · 2026-10-28

승인된 UI `903aac327382988bbeb4e1e39914c33d87910c8e`의 변경 29개를
리뷰 worktree에 정확한 Git blob 바이트로 가져왔다. 충돌 경로는 없었고
29개 SHA256이 일치한다. 원본 UI worktree와 기존 체크포인트·ZIP·검증 기록은
보존했다. 이번 릴리스 후보는 UI 903을 기준으로 한 별도 프론트엔드 파일만 전달한다.

## 표현과 접근성

리뷰의 native dialog에 기존 Card/Header/Content와 네이티브 Button을 사용했다.
같은 sky/slate 색상, 흰 surface, 8/12/16/24px 간격, radius와 focus 토큰을 적용했다.
선택지는 실제 checkbox와 checked 표시를 유지하고 OTHER는 선택 시에만 표시한다.
제출·닫기·주간 숨김, 만족 배타·불만 다중 선택, 2000 코드포인트 초안 기술 한계,
미제출 원문의 화면 메모리 경계와 request/응답 처리 정책은 유지했다.

UI/UX Pro Max는 설치된 프로젝트·사용자 스킬에 없었다. 공식
[SKILL.md](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md),
[정적 quick reference](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/references/quick-reference.md)와
shadcn의 [Card](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/card.tsx),
[Button](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button.tsx) 원본을 확인했다.
정적 웹 접근성·일관성 지침을 수동 적용했으며 CLI·검색 스크립트·Tailwind·Radix나
새 패키지를 설치하지 않았다. 컴포넌트 출처와 MIT 고지는 UI 903의 기록을 보존한다.

React best-practices 점검에서는 native dialog/label/fieldset 의미, 장식 아이콘의
aria-hidden, Button props·disabled 전달, 기존 hooks와 claim dedup·remount key,
focus 정리와 화면 메모리 폐기, 직접 type import와 기존 Lucide named import를 확인했다.
새 전역 상태·저장소·analytics·추가 네트워크 effect는 없다.

## 운영 구 API와의 호환 경계

`RoomResponse.review_prompt_supported`는 optional boolean이다. **정확한 true**와
기존 본인 확정 결과 성공 경로가 모두 충족될 때만 RoomPage의 두 성공 분기에서
ReviewPrompt를 마운트한다. 필드 부재·false·문자열·숫자·null·객체·배열은
미지원으로 처리하며 리뷰 UI와 claim POST가 없다. 404를 먼저 호출해 탐지하지 않는다.

낮은 business state_version 때문에 이전 room을 보존하더라도 지원 여부는 최신
응답으로 갱신한다. 이전 true가 최신 부재/잘못된 값에 남아 리뷰를 실행하지 않는다.
이 지원 힌트는 참여·확정·본인 권한이나 재질문 정책을 대신하지 않는다.

실제 로컬 서버의 지원 힌트 OpenAPI SHA256은
`d603d60ecd0a4cc5acef99fdbc93ceb41c0a76bcf61dce92fe3bfa9cf332def0`다.
RoomResponse의 기존 25필드와 나머지 path/schema/metadata를 보존하고 optional
boolean 한 필드만 추가했다. 기존 리뷰 3경로와 고유 operationId를 유지했다.

이번 UI 코드에 리뷰 디자인이 포함돼도 구 운영 API가 이 필드를 보내지 않으면
화면과 요청은 잠겨 있다. 실제 활성화는 별도로 승인받은 서버 리뷰 API·V19
마이그레이션 배포가 필요하다. 이 프론트엔드 후보가 서버·DB 배포를 승인하지 않는다.

## 이번 변경의 검증

과거 711 unit·437 mock E2E·native12 결과를 이번 결과에 더하지 않는다.
새 결과는 저장소 밖 `/workspace/checkpoints/review-brand-refresh-20261028/`에서
다른 단계의 기록과 분리한다.

- 지원 gate RED: 35건 중 기존 positive 6 PASS, 미구현 decoder·지원 철회·부정 gate 29 FAIL.
- 지원 gate·리뷰·API decode 선택 unit: 66 PASS. Lint·typecheck·build·생성 API 정합 PASS.
- 통합 디자인/접근성 브라우저: 최종 20 PASS (27.6초). 320~1440px, 짧은 가로 화면,
  125% 글자, reduced-motion, focus/Tab/Escape, 만족·불만·OTHER·double-click를 검사한다.
- 실제 SPA 호환 브라우저: 36 PASS. 리뷰 전용 positive fixture만 true이며 기존 fixture에는
  true를 넣지 않았다. missing/false/malformed에서 두 결과 분기의 모든 리뷰 POST가 0이다.
- 이전 native 서버: 4 PASS. 실제 Google/Kakao 합성 로그인으로 HOST/MEMBER의
  기존 Plan·명시 시간 확정 결과를 읽었고 지원 필드 부재·리뷰 요청 0·DB prompt 0을 확인했다.
- 지원 서버 native 통합: 12 PASS (39.9초). 로컬 OIDC/JWT와 실 HTTP/PG/Redis를 사용하며
  API 응답 mock·page.route·token/원문 캡처·운영 요청은 없다.

이름 필터가 절대 경로까지 매칭해 넓어진 중간 실행은 중단했다. 그 부분 결과는
최종 성공 수에 합산하지 않았고 `filter-interrupted.json`으로 구분했다.
