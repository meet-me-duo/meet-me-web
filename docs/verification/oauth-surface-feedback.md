# 최종 로그인 표면 음영 (2026-10-28)

사용자는 앞선 main `fd4d60691a2bfc55a9fef25f7cfcae8d3ea155b3`에 배포한 외곽 hover 선이 Google의 원래 색상 반응을 흐리고 실제 40px 표면 밖 46px 클릭 영역까지 둘러싼다고 지적했다. 이 변경은 그 외곽선 안을 대체한다. 과거 외곽선 기록은 이력이며 최종 디자인이 아니다.

## 동작

- Google 공식 neutral 40px 표면과 기존 8% hover/12% active 상태 레이어·내부 표면 그림자를 유지한다. 46px 링크와 상하3px 여백은 유지하되 포인터 외곽선을 제거한다.
- Kakao의 224×46 원본 SVG와 #FEE500/로고를 변경하지 않는다. SVG rect와 같은 8px 모서리의 wrapper 안에서 검은 상태 레이어가 hover8%/active12%로 나타난다. 표면 밖으로 음영이 나오지 않는다.
- 선택 버튼의 이동 대기는 내부12% 음영과 기존 텍스트 안내를 사용한다. 상대 버튼의 레이어는0%다. 포인터용 pressed/pending 외곽선도 제거한다.
- 키보드 focus-visible의 외곽선은 클릭 영역에 독립적으로 유지한다. OAuth 경로·복귀·중복 클릭 잠금·타이머/복원·공식 자산은 그대로다.

[Google 기본](oauth-surface-images/google-default.png) · [Google hover](oauth-surface-images/google-hover.png) · [Kakao 기본](oauth-surface-images/kakao-default.png) · [Kakao hover](oauth-surface-images/kakao-hover.png)

## 검증

관련 단위13/13, 관련 E2E28/28, lint/typecheck/API 정합/build/diff 검사 통과. E2E는 desktop/mobile ×320/390/1440px에서 Google 표면40px·타깃46px·여백3px, Kakao 표면46px, 상태 레이어의 정확한 표면 경계와 0/8/12% opacity, 포인터 외곽선 없음, pressed 우선순위, keyboard focus, disabled/pending peer, reduced-motion과 이동·복원을 검사한다. 기존 외곽선 기대값을 확정된 내부 상태/표면 경계 검증으로 교체했으며 접근성과 동작 검사는 유지했다.

독립 Chromium 검토에서도 두 표면의 색 변화·실제 높이·클리핑과 포인터/키보드 분리를 확인했고 차단 사항 없이 통과했다. 로컬 API는 합성 대역이며 실제 사용자 로그인·로그아웃·claim·방 마감은 실행하지 않았다. 새 탭의 시스템 Chromium 대역 한계와 loopback fixture는 기존 버튼 검증 기록에 남아 있다.

원래 공식 자산/브랜드 근거는 `public/brands/README.md`, 작업 지침은 `docs/ARCHITECTURE.md`를 따른다. 새 SDK·의존성·서버/API 계약 변경은 없다. 공개 운영 재검증은 실제 배포 SHA와 함께 PR에 기록한다.
