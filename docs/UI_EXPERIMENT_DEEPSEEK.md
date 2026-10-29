# DeepSeek API 랜딩을 참고한 밝은 UI 실험

2026-10-29 UTC. 사용자가 선택한 방향은 **DeepSeek API 랜딩페이지의 밝은 버전**이다. 이전 어두운 A안은 철회했다. 구현은 `feature/ui-deepseek-experiment`에만 있으며, 사용자가 PC에서 직접 검토하고 추가 승인하기 전에는 develop/main에 병합하지 않는다.

## 분리와 범위

- 저장소 `meet-me-duo/meet-me-web`, 기준 main `22eb625b32056e0762efdc81b168cf31d4fa827a`.
- 조사 시 develop `16e127e6282466cdf7ea678a7b7c8e2aaa8fa837`과 main 파일 트리가 같았다. 채택 시 최신 develop과 다시 비교한다.
- 독립 worktree `/workspace/meet-me-web-ui-deepseek`. 원래 worktree의 제품 파일은 변경하지 않았다.
- 원격 push/PR, 병합, 운영 배포, 공개 프리뷰 게시 없음. 원본 Figma 편집 없음.
- 제품 변경은 랜딩 구조·설명과 공통 CSS다. 서버·분석·API·권한·인증 계약 및 데이터 저장 코드는 변경하지 않았다.

## 근거 구분

참고 사이트: <https://www.deepseek.com/en/platform/>.

### Figma 정적 관측

사용자 제공 [html.to.design 참조](https://www.figma.com/design/HYJMGulsAzaj2bIPrbbHBQ/Untitled?node-id=1-1502)를 읽기 전용으로 확인했다. import 표기는 2026-10-29 17:04:09 GMT+9다. 전체 프레임 `1:1502`, hero `1:1625`, 카드 `1:1518`, 버튼 variant `1:1456`을 조사했다. 프레임 이름은 `1920w light`지만 실제 정적 렌더는 어두웠다. 이름을 테마의 근거로 사용하지 않았다.

| 요소 | 가져온 프레임에서 확인한 값 |
| --- | --- |
| 표면 | 본문 #0A0A0A, 상단 푸른/회청색 배경, 강조 #6799FE |
| 배치 | 1920px 화면에 1280px 콘텐츠, hero 문구/예시 두 열, 열 사이 40px |
| 글꼴 | DM Sans, 제목 500·40/60px, 설명 400·16/25.6px |
| 카드 | 간격·패딩 24px, radius 12px, 흰색 4% 표면·10% 테두리 |
| CTA | 44px 높이, pill, 15/18px 텍스트, 수평 패딩 20px |
| 보조 CTA | 정적 hover variant에서 테두리 흰색 60%→80%, 내부 overlay |

이 값은 가져온 프레임의 값이다. 모션 시간·이징·실제 브라우저 동작을 Figma 정적 화면으로 추정하지 않았다. 로고, 배경 이미지, 브랜드 자산, 글꼴 파일은 복제하지 않았다.

### 실사이트 관측 — 별도 조사 스레드에서 전달받은 결과

최신 네트워크 설정에서 별도 Astra 관측 작업 `01a186b7-71e3-7472-9caf-3b072c421005`가 1440×900 Chromium으로 확인하고 부모가 전달했다. 이 UI 구현 환경은 기존 허용 목록이어서 직접 접속을 재시도하거나 우회하지 않았다.

- 푸른 배경에서 검정 hero로 이어지는 화면, 좌측 정렬, DM Sans, 44px CTA. 카드 24px 간격·12px radius는 실제 CSS에서도 확인.
- hero 두 번째 문구·코드 타이핑과 배경 형상 변화 관측. 정확한 반복 주기는 미측정.
- 카드 초기 `opacity:0`, `translateY(40px)`에서 스크롤 후 위로 등장. 860ms 표본 안 최종 위치였으나 **860ms를 정확한 duration으로 사용하면 안 된다**.
- 스크롤 후 헤더가 좁은 반투명 pill 형태로 변함.
- 주 CTA 중심 원형 overlay 확장: `transform .36s ease-out`, `opacity .1s`, `(hover:hover)` 조건. 보조 CTA 테두리 alpha .6→.8, .35s.
- 키보드 focus outline, Get App hover의 QR popover 관측.
- active 시 버튼 축소, 가격 카드 hover 이동은 관측하지 못함.
- 모바일/reduced-motion 새 페이지는 WAF challenge 및 미허용 호스트로 미완료. 참고 사이트의 모바일·접근성 검증 완료를 주장하지 않는다.

## Meet me에 구현한 해석

아래는 참고 사이트의 복제가 아니라 이 제품을 위한 선택이다.

1. 흰색 카드와 밝은 회색 바탕에 옅은 푸른 hero 배경을 사용했다. 본문 #172033, 보조 #475569, 주 행동 #0369A1로 대비를 확보한다.
2. 1100px 콘텐츠 안에 왼쪽 제목·설명·CTA와 오른쪽 자연어 예시를 배치했다. 한국어 시스템 글꼴을 유지하고 제목 굵기는 600, 설명은 16px 내외로 정돈했다. 예시는 입력 결과처럼 보이지 않도록 “예시”로 표시하며, 원문 비공개와 주최자 예외를 함께 안내한다.
3. 카드 여백·간격 24px와 공통 12px radius, 얇은 테두리·낮은 그림자를 로그인/생성/방/내 모임 표면에 공유했다. 기존 정보 순서와 기능은 유지한다.
4. 주 CTA와 보조 안내 링크를 pill 형태로 나란히 배치한다. 랜딩 클릭 높이는 48px, 공통 버튼 최소 44px다. 키보드 focus와 disabled 처리는 유지한다.
5. CTA 내부의 원형 표면 반응은 .36s로 구현했다. hover 지원 포인터에서만 hover 효과가 나오고, 버튼의 실제 위치·크기는 움직이지 않는다.
6. 기존 긴 고정 스크롤 설명을 세 개의 항상 읽을 수 있는 카드로 바꿨다. 등장 효과는 사용자 피드백 후 **Meet me용 1.15s·56px·opacity .75→1**로 조정했다. 같은 시점에 화면에 들어온 카드는 180ms 간격으로 시작하고, 나중에 보이는 모바일 카드는 추가 지연 없이 시작한다. 카드 30%가 하단 48px 안쪽 관측 영역에 들어오면 한 번 실행한다. 관측 사이트의 정확한 모션 복제라는 뜻이 아니다. IntersectionObserver가 없어도 내용은 그대로 보이며, reduced-motion에서는 정적이다. 중요한 제목·예시·입력은 애니메이션 완료에 의존하지 않는다.
7. 헤더는 밝은 표면·기존 sticky 구조를 유지한다. 축소 pill, 타이핑, 배경 형상 애니메이션, QR popover는 이번 제품 목적에 필요하지 않아 추가하지 않았다.

Google/Kakao 공식 버튼의 원본 자산, 크기, 글자, 전용 hover/focus 규칙은 수정하지 않았다. 공통 `.button` 효과가 해당 버튼에 적용되지 않도록 기존 분리 클래스를 유지한다. 새 패키지·외부 폰트·이미지·모션 라이브러리는 추가하지 않았다.

## 파일별 범위

| 파일 | 변경 |
| --- | --- |
| `src/pages/LandingPage.tsx` | 비생성 랜딩 JSX와 아이콘; 생성 폼/요청 로직 보존 |
| `src/components/LandingStory.tsx` | 세 개 설명 카드와 점진적인 등장 효과 |
| `src/styles.css` | 밝은 hero, 타이포/여백/카드 토큰/CTA 반응/반응형 |
| `scripts/preview-ui.mjs`, `scripts/ui-preview/fixtures.mjs` | 제품에서 import하지 않는 독립 loopback 합성 서버 |
| `package.json`, `.gitignore`, `eslint.config.js` | 로컬 실행 명령과 별도 산출물 제외 |
| `e2e/landing.spec.ts` | 새 레이아웃·접근성 검증으로 기존 긴 sticky 스크롤 전용 assertion 대체 |
| `integration/ui-preview/preview.spec.ts`, `playwright.ui-preview.config.ts` | 합성 화면·선택/리뷰·외부 연결 경계·제품 번들 격리 검증 |

## 로컬 검토와 한계

[UI_PREVIEW.md](UI_PREVIEW.md)의 명령으로 PC에서 실행한다. 이 프리뷰는 합성 화면이며 모델/실제 OAuth/서버 품질 검증이 아니다. 기존 전체 회귀 테스트는 API mock 브라우저 검사다. 참고 사이트에서 확인하지 못한 모바일·모션 감소 조건은 Meet me 자체 화면에서 별도로 검증한다.

최종 검증 결과는 이 브랜치의 `docs/verification/ui-deepseek-light.md`에 기록한다. 채택 결정은 사용자의 피처 브랜치 검토 후에 한다.
