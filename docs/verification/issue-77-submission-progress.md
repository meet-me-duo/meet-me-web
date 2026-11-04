# #77 상세 제출 집계 표시 검증

## 2026-11-04 후속 표시 결정

사용자가 “분수일 때만 빼”라고 확정했다. 정상 목표 비율은 한 자리·두 자리 모두 숫자 분수만 표시하고 작은 ‘제출’ caption을 생략한다. 목표 없는 원은 실제 `2명`과 아래 ‘제출’을 유지한다. 접근성 이름의 제출 의미와 마감 상태는 유지한다. stale의 마지막 확인 안내·집계 누락 안내·목표0 검증·정원 초과 수치·두 자리 줄바꿈은 그대로다.

이 후속 수정은 PR78 develop 병합 뒤, PR79 main 승격 전 별도 피처에서 검증한다. 수정 전 새 회귀 검사는 한 자리 0/4·2/4·6/4에서만3FAIL, 기존 두 자리 포함26PASS로 문제를 재현했다. 수정은 caption 조건 한 곳이며 정상 목표 분수의 DOM 텍스트·접근성 이름과 목표 없는 stale 안내를 검사한다. 반응형 browser도 정상 목표 caption 부재와 목표 없는 ‘제출’을 직접 검증한다. 아래911단위/635browser 기록은 이전 PR78 소스의 결과이며 후속 검증 결과는 정확 HEAD의 PR/CI에 별도로 기록한다.

서버 운영 run41783989711/source6e6ecacf1e54f2328e66d5f6970bd5473bd22afd는 부모가 APPLIED/DEPLOYED_VERIFIED·공개 count 계약 검증 완료로 전달했다. Server→Web 배포 승인 범위가 유지되며 정상 피처→develop→main 절차를 따른다. 운영 방 수정·모델 호출 없이 공개 자산과 사전 합성 API로 배포 번들을 확인한다.

기존 모임 상세 상단 카드에 서버의 실제 제출 집계 한 개를 표시한다. 목록 카드·개인별 상태·새 조회나 권한을 추가하지 않는다. 웹은 공유 왼쪽, 모바일은 공유 아래이며 날짜 다음 줄에 모임 방식을 표시한다.

## 실제 생성 계약

- 서버 [OpenAPI 원문](https://github.com/meet-me-duo/meet-me-server/blob/18fd232fa7b94d8076ed7bfc71bb56f87703d8a4/docs/openapi/account-room-history.openapi.json), source `18fd232fa7b94d8076ed7bfc71bb56f87703d8a4`, 연결 [PR207](https://github.com/meet-me-duo/meet-me-server/pull/207).
- 원문111847바이트, Git blob `2ed12b97d86df57a5bf512b71120564e0fe55b4a`, SHA256 `9e1149f01c35e3b27762c4e3586ac7ed03ed9f26d98be6472ad438ce3103c8a7`. 내려받은 원문 bytes의 Git blob 해시를 직접 재계산했다.
- 이전 웹과의 의미 차이는 `/components/schemas/RoomResponse/properties/submitted_participant_count` 및 `/components/schemas/RoomResponse/required` 두 곳뿐이다. 이 두 항목만 동기화한 웹 snapshot과 서버 원문은 전체 JSON 의미가 같다. 웹 snapshot SHA256 `056f863b4005ee65cce36852a21290d73d13cab867fb689c68f7de0d4434c6e0`, generated schema SHA256 `3b561ebfe1f4471a79b92a6f421ebe4873ce7f216dbdd4f8094e617eb5d30e4d`다.
- `submitted_participant_count`는 required/non-null integer(int32), minimum0이다. `api:generate`로 만든 DTO의 필수 number를 유지한다. 구 서버 누락만 generated `Partial<Pick>` 읽기 alias에서 허용하며 임시 수동 타입은 없다. 기존 nullable `expected_participants`는 그대로다.

집계는 `latest_version_id`가 있는 고유 참여자 수다. 제출한 HOST·회원·게스트를 포함하고 수정·재참여·claim·개인 목록 숨김으로 중복되거나 제외되지 않는다. 초안/precheck는 제외하며 수정 라운드 재제출 수나 분석 배치·실제 참석 수와 다르다. 서버는 목표 초과 수치도 자르지 않는다. 프런트엔드는 명단·개인 원문·본인 precheck·추천 인원에서 이를 계산하지 않는다.

## 표시와 상태 경계

숫자는 실제 집계 그대로이며 원호만0–100%로 제한한다. 목표 없음(null)은 연한 원과 숫자·작은 ‘제출’이며 완료 원호나 progressbar 의미를 부여하지 않는다. 알려진0과 누락을 구별한다. 누락/null/음수/소수/비유한 수/안전한 정수 범위 초과는 ‘— / 집계 미확인’이다. 목표0·누락·잘못된 목표로 나누지 않으며 확인된 제출 수는 보존한다.

초기 로딩/실패에 허위0을 만들지 않는다. 갱신 실패의 보존 수치는 마지막 확인 집계로 설명하며 기존 재조회 동선을 유지한다. 401/403/404·비참여·비로그인 HOST의 기존 권한 분기를 유지한다. 이미지 accessible name에 수집 상태와 실제 제출 인원을 포함한다. 추가 live region·애니메이션·낙관적 증가·polling은 없다.

공통 바깥 지름64px·두께8px·중앙 숫자14px이다. 모바일 공유도64×64px·같은 중심축·12px 간격이며 웹에서는 원이 공유 왼쪽이다. 두 자리 이상 비율은 `20/`·`20명` 두 줄을 같은14px로 배치하고 중복 ‘제출’ caption을 생략한다. stacked 갱신 실패 안내는 같은 카드의 전체 폭 행으로 내려 원 안 숫자를 밀어내지 않는다. 공유 피드백·직접 복사 입력·갱신 실패 안내는 각자 grid 행으로 흐른다.

기존 내 입력·세로 수정·조건부 붉은 마감·최종 확인·삭제 모달·D-day·searching Orb·소유권/복구 흐름은 보존한다. 새 카드 높이 요구에 따라 이전 높이 상한 테스트만 조정했다.

## 최종 검증

- 표시 단위25·RoomPage 단위13. 실제 수치·목표 없음·0/누락·분모0·과원·초기 로딩/실패·같은 state_version 집계 갱신·실패/복구·401/403/404·HOST/MEMBER·게스트/비로그인·수정 라운드·불필요한 private 조회 없음.
- 최종 전체 단위 **911/84파일 PASS**, 2026-11-04 04:53:03 UTC 시작/168.33초. 실제 계약 및 독립 리뷰 수정 후 소스를 고정해 실행했다.
- 최종 관련 browser **36/36 PASS**, retry0. desktop/mobile 프로젝트에서320/390/1440px·긴 제목·목표 유무·실제 원 바깥 지름·공유 축/12px·keyboard·가로 넘침·복사 실패를 확인했다.20/20·50/50·100/50·1000/50 각 글자 줄은 원 안쪽 chord 안에 있다. stale100/50·1000/50도 수치와 안내가 겹치지 않는다. 외부 요청·새 명령·pageerror0이다.
- api:check/lint/typecheck/build/preflight3·V2 합성 evidence6·UI preview18 PASS. 최종 전체 브라우저636개 중 **635 PASS/기존1 SKIP**, unexpected0/flaky0/retry0·reporter errors0을 확인했다(04:53:04.931 UTC 시작/428.697초). 최종 evidence6/preview18도 소스 고정 후 다시 통과했다.
- 검증 중 제품/테스트11파일의 SHA256을 고정해 변화가 없음을 확인한다. 원본 전체 로그·JSON·프로세스 결과는 로컬에 보존한다. 예비906단위/627browser 결과를 현재 최종 성공에 중복 합산하지 않는다.

## 독립 리뷰와 발견 수정

독립 검토자는 실제 snapshot 전체 의미/해시·generated 필수 타입/읽기 optional·privacy/권한·실제 렌더를 확인했다. 초회 P2는 정상 `20/20명` 폭51.39px가 원 내부48px를 넘는 문제였다. 같은14px의 두 줄로 수정했고,1000/50의 inner-chord 경계에 맞춰 line-height1을 적용했다. stale caption이 숫자를 위로 미는 추가 문제는 안내를 카드의 별도 행으로 옮겨 해결했다.

최신 독립 리뷰 **P1/P2=0**. 검토자가320/1440px에서 긴 제목+stale1000/50+복사 실패를 함께 재현하고 숫자·피드백·입력·마지막 집계 안내의 무겹침을 직접 확인했다. 실제 모바일 기기/Safari·운영 OAuth·실제 backend/DB·모델 품질 검증과는 구분한다.

초회 새 fixture 타입/unused binding/동기 DOM 조회 오류는 정정했다. 수정 중 구 소스와 새 테스트가 섞인 중간 단위1실패 및4173 포트 충돌은 최종 결과로 사용하지 않았다. 수정 전 실행하던 전체 브라우저는 정확한 owned Playwright만 SIGINT로 종료·보존했다. 새 소스를 고정한 최종 전체 실행은911단위/635브라우저 PASS로 별도 확인했다.

## 시안과 캡처

제공 Library 시안3개는 공식 materialization과 consumer-local 경로 재준비 후 helper의 `download failed`로 실패했다. 픽셀을 확인하지 않았고 우회/반복 재시도하지 않았다. 이후 텍스트 요구와 실제 합성 렌더로 검수했다.

최신320/390/1440px×목표 없음·2/4·20/20의 PNG9개를 검증·보존했다. 독립 검토의 stale 과원+복사 실패 캡처도 보존한다. 공식 Library 업로드 helper는 `hosted apps tools/list request failed: network`로 exit1, 결과0바이트/ID 반환 없음이다. 재시도·직접 쓰기 우회 없이 차단을 유지하며 Library 저장 성공을 주장하지 않는다. 로컬 경로를 사용자 접근 가능한 Library 산출물로 제공하지 않는다.

정확한 원문·생성 타입·소스/테스트·캡처 해시 및 검사 수는 [기계 판독 검증 기록](issue-77-submission-progress.json)에 보존한다.

## 게시와 배포

기존 Issue77과 feature/issue-77-room-submission-progress를 사용한다. 최종 검사 후 commit/push·develop Draft PR·정확 HEAD CI를 진행한다. Commit/PR은 동일 커밋 예정이며 PR51·무관 변경은 제외한다.

사용자가 서버 배포 후 Web 배포를 승인했다. 서버 담당의 실제 운영 배포·count 계약 검증 완료 신호 전에는 Web 병합·배포를 보류한다. 신호 확인 후 이번 변경만 정상 develop→main PR→기존 production 배포로 진행한다. 보호 우회·PR review APPROVE·운영 방 수정·모델 호출은 수행하지 않는다. 운영 번들 확인은 모든 API를 사전 합성 처리하고 공개 HTML/자산 GET만 허용한다.
