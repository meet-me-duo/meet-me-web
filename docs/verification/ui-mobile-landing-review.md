# 모바일 랜딩 로컬 검토안 (2026-10-29)

기준 운영 main: `476b2e7a6d556b28f8ae47d34a253555d08c86fb`.
별도 로컬 브랜치: `feature/ui-mobile-landing-review`. 이 안은 원격 게시·병합·배포하지 않았다.

## 변경

- 540px 이하에서 랜딩 시연 예시를 숨긴다. 입력 기능이나 실제 사용자 데이터는 바꾸지 않는다.
- 첫 hero에 `min-height: calc(100svh - 69px)`를 적용하고 문구·CTA를 중앙에 배치한다. 고정 높이/overflow 제한 없이 콘텐츠 증가 시 자연스럽게 늘어난다.
- 이용 방법 영역은 첫 화면 아래부터 시작하며 기존 이동 링크와 스크롤 등장 동작을 유지한다.
- 데스크톱 배치·글꼴·기능 카드의 기존 모바일 세로 배치는 변경하지 않았다.

## 확인

- 빌드 성공. 기존 랜딩 E2E 45개 통과, 기존 모바일 전용 테스트의 desktop skip 1개.
- 기존 예시 가시성 assertion을 새 요구에 맞게 모바일 숨김/데스크톱 표시로 구분하고 모바일 상세 영역이 첫 viewport 아래에 위치하는지 검증한다.
- 360×640 / 390×844 / 430×932 / 390×640에서 CTA가 첫 화면 안에 있고 예시 숨김, 상세 영역 시작 y가 각각 640 / 844 / 932 / 640px임을 확인했다.
- 키보드, 작은 높이, reduced-motion, observer 미지원, 순차 등장 기존 회귀 검증 통과.
- 1440×900 수정 전후 첫 화면·스크롤 화면·전체 화면 PNG 바이트 동일. 가로 overflow/JS 오류 없음.
- S25 실기기 테스트가 아니라 Linux Chromium의 CSS viewport 검증이다.

## 기존 모바일 진단

360×640에서 예시 카드 y≈451, 높이≈317, bottom≈768로 첫 화면 아래에 이어진다. 문장 자체나 조상에 overflow clipping은 없고 끝까지 스크롤 가능했다. 390/430px도 동일하게 실제 잘림은 재현되지 않았다. 기능 카드는 높이≈204px씩, 세로 간격 56px로 총≈725px다.

## 글꼴 진단

루트 font-family는 `Inter, Pretendard, Noto Sans KR, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`다. @font-face나 웹폰트 로딩은 없고, 데스크톱/모바일의 font 요청 및 실패는 모두 0건이다.

- 상단 브랜드: computed weight 700, 18.4px, variation normal, synthesis none (모바일/데스크톱 동일).
- hero의 Meet me: computed weight 600, variation normal, synthesis none (모바일/데스크톱 동일). 크기는 반응형.
- 이 Linux 환경에서 CDP가 확인한 실제 글꼴은 두 화면 모두 로컬 `Noto Sans CJK KR / NotoSansCJKkr-Bold`다.

사용자 S25의 실제 글꼴은 확인하지 않았다. 웹폰트를 제공하지 않아 OS의 설치 글꼴과 굵기 매칭/렌더링에 따라 달라질 가능성은 있으나, 실기기 원인 확정은 아니다. 임의 weight 증가는 하지 않았다. 플랫폼 간 동일한 브랜드 표현이 필요하면 별도 검토 후 라이선스가 확인된 동일 폰트 파일을 self-host하는 방안을 제안한다.
