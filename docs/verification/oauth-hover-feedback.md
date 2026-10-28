# 소셜 로그인 hover 가시성 보완 (2026-10-28)

## 문제와 실제 재현

사용자는 main `ff3a91b320a690d1a350b7263832a37620733fda` 배포 후에도 Kakao에 커서를 올렸을 때 변화가 보이지 않는다고 제보했다. 원래 작업은 클릭/대기/복원 동작과 함께 hover 차이도 다뤄야 했지만, 첫 수정의 Kakao hover는 기존의 작은 그림자를 유지했다.

실제 공개 운영 번들을 Chromium에서 읽고 모든 API를 합성 대역으로 차단해 hover 전후를 캡처했다. Kakao의 computed shadow는 `rgba(15,23,42,.12) 0 4px 16px -8px`였다. 캡처의 채널 변화 최댓값은 8/255이고 20을 넘는 변화가 있는 픽셀은 0개여서 사용자에게 명확한 피드백이 되지 못했다. Google에는 공식 내부 상태 레이어의 변화가 보였다.

## 변경

기존 Kakao 전용의 약한 그림자 대신 양쪽 제공자 링크에 동일한 **2px slate 외곽선과 외곽 그림자**를 적용한다. 제공자의 내부 배경·로고·색상·비율은 변경하지 않는다. Google 공식 상태 레이어도 유지한다. 외곽선은 흰 카드와 3:1 이상의 대비가 있고, hover 중 위치/크기는 고정된다.

기존 active의 3px sky 표시가 뒤에서 우선하고, 키보드 focus-visible의 outline은 유지된다. aria-disabled인 이동 대기 중에는 hover가 적용되지 않는다. 축소 동작과 기존 로그인 URL·복귀·잠금/재시도 정책을 유지한다. 계정 메뉴·히스토리 변경은 별도 worktree이며 이 변경에 포함하지 않는다.

수정 후 390px desktop Kakao 캡처의 채널 변화 최댓값은 155/255이며 20을 넘는 변화가 있는 픽셀은 1,104개다. 이는 외곽선이 실제로 렌더링되는지 확인하는 시각 근거이고 사용자 전체의 지각 품질 측정으로 해석하지 않는다.

[기본 Kakao](oauth-hover-images/kakao-default.png) · [hover Kakao](oauth-hover-images/kakao-hover.png) · [hover Google](oauth-hover-images/google-hover.png)

## 검증

- lint/typecheck/API snapshot 정합성/build/diff 검사 통과. 공식 자산·API 계약·lockfile 변경 없음.
- 관련 로그인 단위 **13/13 PASS**.
- 최종 관련 E2E **28/28 PASS**, retries 0. 새 hover 테스트 6건은 desktop/mobile 프로젝트 × 320/390/1440px에서 기본/hover/active/focus/disabled/reduced-motion과 위치·크기·가로 넘침을 확인한다. hover 자체는 OAuth 요청을 내지 않는다.
- 독립 검토: 두 제공자 모두 명확한 시각 변화, 3개 폭의 위치/크기 보존, 눌림 우선순위와 대기/키보드 규칙을 별도 Chromium에서 재현했고 추가 차단 사항 없이 통과했다.
- 기존 로컬 시스템 Chromium의 새 탭 첫 요청 interception 한계로 초기 E2E는 기존 popup 2건에서 실패했다. loopback GET OAuth 대역을 복원한 뒤 같은 28건을 재실행해 모두 통과했다. 테스트를 건너뛰거나 완화하지 않았다. 이 대역은 브라우저→실서버 인증 검증이 아니다.

공개 재현의 Chromium은 인증서 저장소에서 ERR_CERT_AUTHORITY_INVALID를 반환해 UI 전용 context에서 HTTPS 오류를 무시했다. 공개 자산 다운로드는 별도 urllib 기본 TLS 검증을 유지했고, 앞선 main의 11개 자산 지문이 모두 일치했다. 이 결과는 실외부 OAuth/실계정 로그인이나 TLS 보안 검증의 성공을 뜻하지 않는다. 실사용자 계정 로그인/로그아웃은 수행하지 않았다.

## 지침

저장소 `docs/ARCHITECTURE.md`의 UI/UX Pro Max 상호작용·접근성 및 shadcn 기반 기존 구조를 따른다. 적용한 공식 원문은 기존 [버튼 검증 기록](oauth-button-feedback.md)에 있다. [Google 브랜드 가이드](https://developers.google.com/identity/branding-guidelines)와 [Kakao 디자인 가이드](https://developers.kakao.com/docs/ko/kakaologin/design-guide)의 공식 자산·색상·비율과 동등한 강조를 유지하며 앱 링크 외곽에 상태만 추가한다.

이 외곽선 안은 사용자 후속 피드백으로 폐기했다. 최종 디자인과 검증은 [버튼 표면 음영](oauth-surface-feedback.md)을 따른다.
