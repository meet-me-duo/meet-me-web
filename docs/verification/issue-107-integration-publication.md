# #107 + #109 통합 별도 Draft 게시

2026-10-17 UTC 후속 사용자 승인으로 검증한 통합 코드를 별도 Draft PR에 게시하고 정확 HEAD CI까지 확인한다. 기존 독립 PR27과 서버116은 유지한다. merge/auto-merge/main 배포/운영 DB/Secret/운영 또는 유료 AI 호출은 제외한다.

실제 분기 기준은 #109 웹95f09c0a98c6538b0f19ed381fdf11a2f5b844d9이며 새 PR base는 main9b183978d5987f8fa8a5f02d542b17181e4929b4다. 해당 #109 이력이 그대로 포함되고, 이 커밋 이후의 변경이 #107 질문 UI·안내·실제 공통 request 연동·통합 native snapshot/타입과 독립 회귀다. 계정 session·App·AccountBoundary·authCookieLock과 공통 request 구현은 #109와 동일하게 보존했다.

최종 로컬 게이트 API/type/lint(경고0)/build·unit466·고정 browser391PASS/기존SKIP1을 통과했다. root의 최종 두 auth 경계 FI는11/10 행동 실패를 탐지하고 source/test/dist를 정확 복원한 뒤35GREEN이다. 최종 source93/dist4 지문은 전체 browser 검증 때와 같다. 실제 통합 서버 browser E2E·운영 공급자 로그인·실제 모델 의미 품질은 포함하지 않는다.

서버 새 Draft는 #109 c06b60a 기반으로 실제 JWT/current-account/공통 resolver와 READ_OWN adapter를 포함한다. 통합 서버는844(840PASS/기존SKIP4)/실제 production JAR·HTTP·명시 분석/독립리뷰를 통과했다. 보호된 공통 파일과 별도 #110 변경은 덮어쓰지 않았다.

Commit/PR: 동일 커밋 예정. 실제 새 commit·Draft URL·정확 HEAD CI 결과는 게시 receipt와 GitHub가 확정한다. 이전 로컬 미게시 문구는 당시 검증 단계의 기록이다.
