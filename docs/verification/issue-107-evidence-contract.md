# V2 입력 근거 계약의 웹 검증

기준은 web main `22eb625b32056e0762efdc81b168cf31d4fa827a`이며 작업 트리는 `<local-checkout>`, 브랜치는 `feature/issue-107-evidence-contract`다. 시각 디자인 변경과 분리한 실험이다. main/develop 병합, push, 배포, 실제 사용자 데이터·계정·모델 사용은 하지 않는다.

## 적용 범위

- `PRE_SUBMIT_V2` 방만 원문과 보완 답변을 따로 표시한다. A/B는 전체 입력 재작성 대신 질문 대상의 답변을 미리 보여 주고 명시적으로 제출한다. 안전한 A/B가 없는 질문은 직접 답변만 허용한다. 직접 답변 편집기는 원문을 채우지 않는다.
- `RECEIVED`는 접수 완료와 최종 해석 대기를 표시한다. `CLEAR`와 동일한 해석 확정 안내를 하지 않는다. 질문·취소 버튼을 다시 열지 않는다. 원문과 확정한 답변을 본인 화면에 남긴다.
- 질문 한도 뒤 새 원문이 `UNRESOLVED`이면 접수 완료로 표시하지 않는다. 마감 시 이전 접수본을 유지한다는 실험 정책을 설명한다. 질문 한도는 웹에서 초기화하지 않는다.
- V2 최초 입력 화면부터 최종 미반영 원문·제출한 답변·사유가 주최자에게 표시될 수 있음을 알린다. 주최자 미반영 상세에는 서버가 공개한 최종 답변과 실패 범위를 표시한다. 중간 질문은 표시하지 않는다.
- 활성 초안은 원문 또는 특정 check/question/revision의 보완 답변에 연결한다. 질문이 사라진 답변 초안은 읽기 전용으로 보존하며 새 원문으로 제출하지 않는다. 입력 방식을 명시적으로 바꾸면 이전 초안 1개를 별도로 보관한다. 메모리 격리 보관은 `PRECHECK_ANSWER`와 정확한 question ID를 확인하고, 오래된 답변을 다른 revision에 자동 재사용하지 않는다. 인증·소유자 경계와 자동 POST 금지는 유지한다. 별도로 보관한 초안은 이 화면을 떠나면 사라질 수 있음을 안내한다.
- 원문과 보완 답변은 합계 500 Unicode 코드포인트 이내로 유지한다. A/B와 직접 답변 모두 남은 분량을 확인하며, 필요하면 질문 중에도 원문 편집을 명시적으로 연다.
- 마감 후 `UNVERIFIED_CORRECTION` 수정본은 최초 검사 원문·이전 보완 답변과 구분한다. 새 수정 접수본만 표시하고 해석이 확정됐다고 안내하지 않는다.
- V1과 LEGACY 화면·요청 계약은 유지한다. 후보 계산이나 정렬·시간 선택 로직은 바꾸지 않는다. CSS 변경은 없다.

질문 미응답·검사 중·기술 실패·질문 한도를 사용한 뒤 새 원문 재입력의 마감 처리는 사용자 최종 확정이 남은 정책이다. 여기서는 서버가 실험 플래그 뒤에서 유지하는 보수적 상태를 그대로 표시하며 웹이 이를 CLEAR나 접수 완료로 승격하지 않는다.

## 로컬 합성 화면 확인

```bash
cd meet-me-web
corepack pnpm install --frozen-lockfile
corepack pnpm dev --host 127.0.0.1 --port 4188 --strictPort
```

브라우저에서 `http://127.0.0.1:4188/integration/evidence-review.html`을 연다. 위의 링크로 A/B 질문, 직접 답변 질문, 미확정 접수, 주최자 미반영 사유를 확인할 수 있다. 이 페이지는 개발 서버 전용이며 운영 빌드 진입점에 포함하지 않는다. 합성 transport는 외부 API 요청을 차단한다. 실제 서버·DB·OAuth·모델 검증을 대신하지 않는다.

```bash
CHROMIUM_PATH=/usr/bin/chromium node node_modules/@playwright/test/cli.js test --config playwright.evidence.config.ts
```

desktop/mobile 각 3개 시나리오를 재시도 없이 실행한다. 스크린샷은 `test-results/evidence-contract-*/v2-*.png`에 저장한다. 필요한 브라우저 실행 파일은 `CHROMIUM_PATH`로 지정한다.

## 검증 근거

- 신규 핵심 3개 assertion RED를 먼저 확인했다. 접수 미확정 상태, 비어 있는 직접 답변 편집기, 선택한 답변의 명시 제출이 기존 코드에서 없었다. 원본 로그는 `.codex/tdd-evidence/issue-107-evidence-red.log`에 보존했다.
- 신규 핵심 3개 GREEN 뒤 질문 한도 후 `UNRESOLVED`의 접수 오표시 방지 1개를 추가했다. 이 추가 1개는 처음부터 통과한 회귀 검증이다. 결함 주입 뒤 현재 접수본을 이전 접수본으로 오표시하지 않는 assertion을 보강했으며, 최종 4개 명세를 기준 main 소스에서 다시 실행해 4개 assertion RED를 재확인했다. 이 재확인을 최초 구현 전 실행으로 주장하지 않는다.
- 신규 상태 4개와 관련 기존 테스트를 합친 29개 PASS. 독립 리뷰의 초안 경합·질문 ID·길이 검증 11개와 마감 후 수정본 검증 1개를 추가한 최종 전체 unit은 76파일 801개 PASS다. 초기 전체 787개 PASS는 추가 테스트 이전 기록으로 별도 보존한다.
- 암호 없는 기록의 V2 대체 입력에도 주최자 공개 범위를 저장 전에 안내한다. 독립 신규 테스트 1개를 RED→GREEN으로 확인했다.
- 실제 Chromium의 합성 desktop/mobile 6개 PASS, 재시도 0. 서버·외부 모델·OAuth 호출 0.
- typecheck와 lint PASS, 생성 타입과 현재 로컬 OpenAPI snapshot의 일치 PASS, production build PASS. 기존 의존성 주석·큰 번들 경고는 빌드를 막지 않았다.
- 접수 판정 제거·직접 답변에 원문 채움·접수 후 취소 허용 3가지 결함 주입은 각각 1개 assertion 실패로 탐지했다. 첫 접수 판정 결함은 기존 문구 assertion만으로 탐지하지 못해 명세를 보강했다. 최종 탐지와 원복 소스 SHA-256은 `.codex/tdd-evidence/issue-107-fi-results.json`에 기록했다.

초기 원문·답변·미확정 상태·공개 범위 5개에 안전 보완 12개를 더해 이번 작업의 신규 unit 테스트는 총 17개다. 최종 전체 unit 로그는 `.codex/tdd-evidence/issue-107-all-unit-safety-final.log`, Chromium 재실행 로그는 `.codex/tdd-evidence/issue-107-browser-safety-final.log`에 보존했다. 독립 11개 중 경합·한도 4개와 질문 격리 2개가 RED였고 기존 충족 5개는 초기 PASS로 구분했다. 수정 후 관련 40개 PASS, 새 결함 주입 5개를 각각 assertion 실패로 탐지하고 모든 소스를 정확하게 복원했다. `.codex/tdd-evidence/issue-107-draft-fi-results.json`에 지문을 기록했다. 독립 테스트 설계자가 복원된 최종 소스의 용도·질문·개인정보 경계를 검토했고 차단 소견이 없었다.

OpenAPI snapshot은 실제 서버 `/v3/api-docs` export로 교체·재생성했다. 서버 export SHA-256은 `3e5801cdd32bfb3db2e2c6f26998c5f2543f26ce90dd7a08769b09ad4129453e`, 웹의 가독성 정리 snapshot SHA-256은 `e2a0b636d9a1b0ae640e83e7ef7ec525a8da048ac7590375ec176d47aa5ae54a`이며 JSON 의미가 동일함을 확인했다. 입력 근거의 nullable/required 필드와 `UNVERIFIED_CORRECTION`도 실제 서버 계약을 따른다. 네이티브 앱 브라우저 검증은 별도 실행 결과로 기록한다.


## 네이티브 앱 브라우저 검증

고정한 서버 클래스 디렉터리에서 실행한 실제 Spring 앱과 PostgreSQL/Redis, 실제 worker·마감·동결·서버 후보 계산·확정 API를 사용했다. 데스크톱에서는 A/B 선택, 모바일에서는 직접 답변으로 같은 시나리오를 각각 한 번 실행했으며 **2/2 PASS, 재시도 0, 총 34.3초**였다.

각 실행은 원문 제출 → 질문 1회 → 보완 답변 → 해석 미확정 접수 → 새로고침 복구 → 직접 마감 → 원문·답변을 포함한 제출 버전 3개 동결 → 주최자에게 시간 미반영 사유 표시 → 추천 범위의 실제 시작·종료 선택·확정까지 통과했다. API 변경 요청 기록에서 최초 checks 생성 1건과 답변 1건을 확인했고, 기존 전체 원문 PUT 경로로 전환되지 않았다. 실제 실행 앱의 OpenAPI에서 근거·질문·접수·미반영 DTO 6개가 웹 snapshot과 같음을 검증했다.

로그인 갱신 응답은 로컬 fixture가 발급한 토큰으로 대체했고, 서버의 RS256 검증과 실제 방 권한 검증은 통과했다. AI 공급자는 의도적으로 답변 후 미확정·최종 해석 실패를 반환하는 합성 fixture다. 이 결과는 Jev/Luna/Gemini 판단 품질이나 외부 OAuth 검증을 뜻하지 않는다. rate limit·retention은 끄고 로컬 HTTP로 실행했다. 실제 모델 평가는 서버의 별도 제한된 실행 결과로 분리한다.

- 로그: `.codex/tdd-evidence/issue-107-native-browser-run1.log`
- 보존한 실제 API 요청·동결 증거·확정 응답: `.codex/tdd-evidence/issue-107-native-browser-proof/{desktop,mobile}/native-v2-evidence.json`
- 주최자 미반영 화면: 같은 폴더의 `native-v2-host-diagnostics.png`
- 실제 일정 확정 화면: 같은 폴더의 `native-v2-confirmed.png`
- 서버 실행 원본 manifest: `local-only-evidence/native-immutable-manifest.json`
- 서버 source digest: `6b9d3becc3b64c5713db47131ba66c1577995c925b7aa40bfa5020ca63642776`
- 서버 고정 클래스 digest: `d1b58045f8825483d688cb25869aa1fe8d86e542e1121395ef980073a9e65fe2`

네이티브 서버 fixture의 `18932` API·`18933` control이 준비된 상태에서 아래 명령을 실행한다. worker는 1개로 고정하며 테스트가 격리 fixture DB를 reset한다. 운영이나 다른 DB에 연결하지 않는다.

```bash
CHROMIUM_PATH=/usr/bin/chromium node node_modules/@playwright/test/cli.js test --config playwright.evidence-native.config.ts
```

이전 startup의 공유 클래스 디렉터리 경합과 준비 코드의 CLEAR 대기 조건 불일치는 서버 fixture 준비 단계에서 별도로 기록·수정했다. 브라우저 2개 시나리오는 준비 완료 후 최초 실행에서 통과했으며, startup 준비 오류를 제품 실패나 모델 품질 결과로 집계하지 않았다.
