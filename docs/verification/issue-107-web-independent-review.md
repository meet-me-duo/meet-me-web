# #107 웹 독립 검토

검토 시점: 2026-10-17 UTC. 대상은 보완 질문 UI, RoomPage 연결, API 클라이언트와 비공개 캐시 수명이다. 실제 운영 서버와 모델은 호출하지 않았다.

## 역할과 근거

최초 32개 `ClarificationPanel.test.tsx`는 구현을 읽지 않고 PRD, 웹 Architecture, 서버 위험도 기반 TDD 규칙과 합의한 공개 계약에서 작성했다. 빈 skeleton 기준 RED를 확보한 뒤 테스트 준비 경합만 보정했고 기대값은 유지했다. 최종 컴포넌트 테스트 SHA-256은 `0dc404816a85504b9700de81c494b80ad1937a8fbdcb6b692e54677fbfd28a32`다. 이후 별도 최종 리뷰에서만 production 읽기를 허용받았다.

## 확인한 결함

1. **수정 라운드 전환 후 질문 편집 권한이 갱신되지 않음.** 마감 직후 GET의 `editable=false`가 같은 query key에 남아 HOST reopen 또는 MEMBER의 새 room snapshot을 받아도 답변이 잠겼다. 새 `RoomPage.clarifications.test.tsx`의 HOST/MEMBER 사례가 각각 RED를 검출했다. 구현자가 전환 시 질문 재조회 처리를 추가한 뒤 두 사례는 통과했다.
2. **HOST 본인 답변 저장 중 분석 가능.** 기존 Architecture의 본인 저장 진행 중 분석 차단 규칙이 보완 질문에는 연결되지 않았다. 저장 promise를 미해결로 둔 독립 통합 사례가 활성 분석 버튼을 검출했다. 구현자가 보완 질문의 본인 pending 상태를 분석 잠금에 연결한 뒤 통합 사례가 통과했다.
3. **같은 본인의 새 질문·수정 라운드에 이전 답변 의도가 남음.** 질문이 바뀌어도 기존 A/DIRECT 선택·직접 원문·409 잠금·성공 안내·진행 중 요청 수명이 유지됐다. 최신 질문 ID/revision에 이전 선택을 전송하거나 새 질문을 숨길 수 있었다. 독립 `ClarificationPanel.identity.test.tsx` 11개에서 **10 실패 / 1 통과**로 RED를 확보했다. 구현자는 본인 query/cache와 알림을 유지하는 바깥 컴포넌트, `(question_id, source_revision, revision_round_id)`로 수명을 나누는 질문 폼으로 분리했다. 새 질문은 미선택으로 시작하고 같은 질문·같은 라운드 재조회는 draft를 보존한다. 오래된 폼의 POST 성공·거부는 새 질문의 draft/cache/권한을 변경하지 않는다. 최종 diff의 이 경계에서 추가 차단 결함은 발견하지 못했다.

## 추가 시간 입력 안내

실제 `7-8시쯤` 입력에서 오전·오후가 누락되는 경우를 줄이기 위해, 입력창이 표시되는 동안 짧은 안내를 계속 보여준다. 공통 문구는 “시간은 오전·오후를 함께 적어 주세요. 19~20시처럼 적어도 좋아요.”다. REMOTE 예시는 “내일 오후 7~8시, 비대면으로 가능해요.”이며 IN_PERSON/EITHER 예시는 “내일 오후 7~8시, 강남 근처가 좋아요.”다.

`submissionGuidance.ts`의 상수와 mode별 예시 함수는 순수 표시용이다. 일반 textarea와 보완 질문 DIRECT textarea 모두 visible 안내를 `aria-describedby`로 연결하고 명확한 placeholder를 제공한다. 기존 입력 처리·검증·질문 identity·재시도·API 메서드는 변경하지 않았다. 안내는 `7-8시쯤`을 임의 해석하거나 자동 변환하지 않는다. 읽기 전용 검토에서 추가 차단 UI 결함은 발견하지 못했다.

새 독립 테스트 15개는 최초 HOST/MEMBER 입력과 OPEN 수정의 12개 조합, DIRECT의 3개 모임 방식 조합을 포함한다. **RED 15/15 실패**(`/tmp/issue107-web-time-guidance-red.log`)는 정상 렌더된 editor에 안내가 없어서 발생했다. 최소 UI 수정 후 **15/15 통과**, 기존 집중 사례와 합쳐 **67/67 통과**했다(`/tmp/issue107-web-time-guidance-green.log`, `/tmp/issue107-web-guidance-focused-green.log`). 문구·placeholder·접근 가능한 설명·입력 후 안내 유지·원문 무변환·자동 저장/분석 및 추가 네트워크 요청 0회를 검증한다. 고정 SHA와 원본 로그 지문은 `issue-107-web-time-guidance-red.json`에 기록했다. 기존 32개·identity 11개·RoomPage 9개의 기대값은 유지했다.

## 공개 계약·격리 검증

- 서버 지원 marker가 정확히 `owner-clarification-v1`인 경우만 RoomPage가 새 endpoint를 호출한다. marker 없음과 미지원 값은 GET 0회다.
- 본인 질문만 서버 응답으로 표시하고 본인 revision, 활성 round, 요청 UUID와 명시 선택을 전송한다. 성공이 자동 AI 분석으로 이어지지 않는다.
- A/B/DIRECT/CANCEL, 직접 입력의 ECMAScript trim과 1~500 코드포인트, 일시 실패 텍스트·UUID 유지, 변경 intent 새 UUID, 409 중단·갱신, 권한 거부와 viewer/room 격리를 검증한다.
- 실제 RoomPage에서 질문 재마운트 복원, HOST reopen→answer→명시 재분석, MEMBER 외부 OPEN 전환→본인 source 답변을 검증한다.
- 같은 room의 viewer 교체 때는 실제 query cache에서 이전 key를 캡처해 삭제를 확인한다. 최초 32개 중 raw context_id key만 검사한 한계는 이 통합 검증으로 보완했다.
- room 권한이 회수된 동안 미해결 GET/POST가 늦게 완료되어도 기존 질문·답변·본인 캐시가 복원되지 않음을 검사한다.
- 브라우저 E2E는 origin 밖 요청을 차단하고 모든 API를 합성 route로 처리한다. 예상하지 않은 요청과 page error가 없어야 하며 원문을 Web Storage에 보관하지 않는다.

## 실행 기록

- 최초 컴포넌트 32개: 최종 skeleton RED 31 실패 / 1 통과. 구현 후 GREEN 32/32.
- 컴포넌트 테스트 준비 경합 보정 후 대상 ESLint 및 TypeScript 컴파일 통과.
- 새 RoomPage 통합 7개: 최초 RED 2 실패 / 5 통과. 질문 권한 재조회 수정 후 새 저장 경합 사례를 포함한 8개 중 7 통과 / 1 실패.
- 질문 수명 보완 전 컴포넌트 32개 + RoomPage 통합 9개: **41/41 통과**. 로컬 원본 로그는 `/tmp/issue107-web-independent-final.log`다. 새 테스트와 E2E 대상 ESLint 및 TypeScript 컴파일도 통과했다.
- 브라우저 E2E: **desktop 4 + mobile 4 = 8/8 통과**, 23.2초. 최신 원본 source의 TypeScript 컴파일·Vite build 후 `/tmp/issue107-playwright.config.ts`로 실행했다. 원본 로그 `/tmp/issue107-web-independent-e2e.log`, build 로그 `/tmp/issue107-web-independent-build.log`. API 요청은 전부 합성 route로 처리했고 외부 origin 요청은 차단했다.

- 독립 질문 identity 11개: **RED 10 실패 / 1 통과**(`/tmp/issue107-web-identity-red.log`), 동일 질문·동일 라운드 draft 보존만 통과했다. 질문 교체, source revision 교체, 성공/취소 알림, 409 잠금, 같은 질문의 새 round, 지연 POST 성공·거부와 Q1→없음→Q2를 포함한다. 고정 SHA와 실패명·분류는 `issue-107-web-identity-red.json`에 있다.
- 질문 수명 수정 후 컴포넌트 32 + identity 11 + RoomPage 9 = **52/52 통과**(`/tmp/issue107-web-identity-green.log`). 기존 32개·9개 및 새 11개 기대값은 변경하지 않았다. 최신 원본 복원 뒤에도 **52/52 재통과**(`/tmp/issue107-web-restored-final.log`).

## 최종 전체 게이트 대조

2026-10-17 UTC에 통합 작업자의 최종 실행 로그를 읽기 전용으로 대조했다. 이 검토에서는 production/test 수정, build 또는 테스트 재실행을 하지 않았다.

| 범위 | 확인 결과 | 근거 |
| --- | --- | --- |
| 시간 안내 수정 전 전체 Vitest | 21개 파일, **360/360 통과** | `/tmp/issue107-web-all-before-guidance.log` |
| 시간 안내 포함 최신 API snapshot/typecheck/lint/build | 모두 **exit 0**, lint warning **0개**. 전체 6개 게이트 exit 0 | `/tmp/issue107-web-final-gate.json` 및 각 원본 로그 |
| 최초 전체 브라우저 실행 | **389 통과 / 2 실패 / 1 의도적 건너뜀** | `/tmp/issue107-web-e2e-all.log` |
| 위 실패 2개 선별 재실행 | **2/2 통과** | `/tmp/issue107-web-e2e-navigation-rerun.log` |
| 질문 수명 수정 전 bundle 전체 브라우저 재실행 | **391 통과 / 1 의도적 건너뜀** | `/tmp/issue107-web-e2e-before-identity.log` |
| 질문 수명 수정 후·시간 안내 수정 전 고정 bundle 전체 브라우저 | **391 통과 / 1 의도적 건너뜀**, 7.3분 | `/tmp/issue107-web-e2e-before-guidance.log` |
| 시간 안내 수정 후 집중 검증 | **15/15 신규, 67/67 집중·복원 통과** | 안내 GREEN 로그와 `/tmp/issue107-web-restored-final.log` |
| 시간 안내 포함 최신 전체 Vitest | 23개 파일, **375/375 통과** | `/tmp/issue107-web-final-all.log` |
| 시간 안내 포함 최종 고정 bundle 전체 브라우저 | **391 통과 / 1 의도적 건너뜀**, 6.1분 | `/tmp/issue107-web-e2e-fixed-bundle.log` |

건너뛴 1개는 desktop 프로젝트의 `landing.spec.ts` mobile layout 검사다. 앞선 최초 전체 실행에는 mobile `submission.spec.ts`의 `page.reload()`와 `page.goto()`가 `net::ERR_HTTP_RESPONSE_CODE_FAILURE`를 낸 실패 2개가 있었고, 해당 2개 선별 재실행은 별도로 통과했다(`/tmp/issue107-web-e2e-navigation-rerun.log`). 이후 질문 수명 수정 전 같은 bundle의 전체 392개를 다시 실행해 **391 통과 / 1 의도적 건너뜀**을 확보했다. 이 결과와 별도로 identity 수정 후·시간 안내 수정 전 고정 bundle에서도 전체 실행 **391 통과 / 1 의도적 건너뜀**을 확보했다. 이전 단계의 panel SHA는 `6eeaf9bdf8e3f56e048f97b4cae6024b74ec5fcbe346023d9bd02c9af908f587`다. 시간 안내가 추가된 최신 source는 전체 단위 **375/375**, 최종 고정 bundle 브라우저 **391 통과 / 1 의도적 건너뜀**으로 별도 완주했다. 최신 `/tmp/issue107-web-final-gate.json`은 6개 게이트 exit 0과 최종 브라우저 실행 전후 dist 불변을 기록한다. 기록된 panel SHA `088e3370051a584fd94c1b1c116e26a7b2e624d5f4713aebb8f3f1a3d7846cd7`와 현재 실제 파일 SHA 및 FI 원본 SHA가 일치함을 대조했다. 최신 Vite build의 503.35 kB chunk 크기 권고는 남아 있으며 build는 성공했다. 과거 탐색 실패의 근본 원인은 확인되지 않았다. 선별 재실행, identity 수정 전 전체 완주, identity 수정 후·시간 안내 전 전체 완주, 시간 안내 포함 최종 전체 완주를 각각 독립된 실행 결과로 보존한다.

native OpenAPI 기반 `clarification_protocol`이 enum으로 생성된 뒤, 미지원 marker 음성 fixture에는 타입 단언 한 줄만 추가했다. GET 0회 기대는 유지됐고 후속 tsc/대상 ESLint/RoomPage **9/9**가 통과했다(`/tmp/issue107-web-native-schema-tests.log`). 최초 컴포넌트 32개 SHA는 위 고정값과 동일함을 재확인했다. native schema의 질문·목록·답변 타입을 별도 수기 인터페이스 대신 참조하는 변경도 읽기 전용으로 확인했다.

## 의도적 결함 주입

시간 안내까지 반영한 최신 source에서 고정된 기존 52개와 안내 15개의 기대값을 유지하고 `ClarificationPanel.tsx`만 일시 변이했다. 각 변이 후 원본 bytes를 복원하고 최상위 `finally`에서도 복원을 보장했다. 구조화 결과와 네 원본 JSON 보고서를 독립 검토해 실제 행동 assertion 실패임을 확인했다. 컴파일·로드 오류는 검출로 계산하지 않았다.

| 결함 | 행동 assertion 실패 수 |
| --- | ---: |
| 같은 작업 재시도마다 UUID 재생성 | 1 |
| 직접 입력에 UTF-16 길이 판정 적용, 500 emoji 거부 | 1 |
| 이전 폼 live guard 제거 | 2 |
| 질문·source revision·round가 달라도 폼 key 재사용 | 7 |

**4/4 결함이 검출됐다.** 최신 source SHA-256은 `088e3370051a584fd94c1b1c116e26a7b2e624d5f4713aebb8f3f1a3d7846cd7`이며, 실행 전·복원 후·현재 실제 파일 SHA가 일치한다. 다섯 테스트 파일의 실제 SHA도 `issue-107-web-faults.json`과 대조해 일치함을 확인했다. 복원 후 집중 테스트는 **67/67 통과**했다. mutant 상태에서는 dist를 빌드하지 않았다.

최종 근거는 `issue-107-web-faults.json`, `/tmp/issue107-web-fault-status.log`, 각 `/tmp/issue107-web-fault-*.json`·`.log`, `/tmp/issue107-web-restored-final.log`에 있다. 질문 수명 보완 전 3종/41개, 질문 수명 보완 후·시간 안내 전 4종/52개는 각 이전 source의 근거다. 시간 안내 후 최신 4종/67개 결과와 구별한다.

## 검증 한계와 재개

이 테스트들은 브라우저/UI→HTTP 계약과 화면·캐시 수명을 검증한다. 실제 공급자의 모호성 판단, 상대 날짜·자정·불가/선호의 의미 정확도, 서버 트랜잭션·멱등성·인가와 실제 운영 쿠키/CORS는 증명하지 않는다. 해당 경계는 서버 fixture·통합 테스트와 별도 실제 환경 검증이 필요하다. 최초 브라우저 탐색 실패, 선별 재실행, identity 수정 전후 전체 완주와 시간 안내 포함 최종 전체 완주를 위에 분리해 기록했다. 운영 호출, 비용 발생 모델 호출, push·PR·병합·배포는 수행하지 않았다.

재개 명령:

```sh
node node_modules/vitest/vitest.mjs run src/components/ClarificationPanel.test.tsx src/components/ClarificationPanel.identity.test.tsx src/pages/RoomPage.clarifications.test.tsx src/pages/RoomPage.time-guidance.test.tsx src/components/ClarificationPanel.time-guidance.test.tsx --configLoader runner --pool threads --maxWorkers 1
node node_modules/@playwright/test/cli.js test --config /tmp/issue107-playwright.config.ts e2e/clarifications.spec.ts
```

Playwright는 저장소 설정을 바꾸지 않고 `/usr/bin/chromium`을 쓰는 임시 config를 사용한다. `/tmp` 파일은 로컬 근거이므로 새 실행 환경에서는 재생성해야 한다.
