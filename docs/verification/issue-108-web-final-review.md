# #108 웹 독립 최종 리뷰

- 검토일: 2026-10-17 UTC
- 검토자: `/root/independent_review` (구현·독립 테스트 설계와 분리)
- 판정: **현재 #108/#109 통합 웹 범위 승인. 미해결 P1/P2 없음.** 서버 최종 게이트, #107/#110 통합, 병합·배포 승인은 포함하지 않는다.

## 코드 검토

API client, `GuestAccessPanel`, `GuestParticipation`, `RoomPage`, 생성 API 타입과 스타일을 검토했다. 이름만·선택 암호·회원 입력 면제, 중복 이름의 participant ID 명시 선택, 최초 참여 기록 번호의 보조 표시가 계약에 맞는다. 번호와 응답 level 자체를 권한 증명으로 사용하지 않는다.

재접근 응답은 방·인증 세대·마운트를 확인한 뒤 반영한다. 최초 참여의 외부 cache·최근 모임 갱신도 동일 경계를 확인한다. VERIFIED_GUEST 복구는 기존 요청 취소와 비공개 cache 제거 이후 서버 viewer를 다시 조회하며 클라이언트가 HOST 권한을 만들지 않는다. REPLACE_ONLY는 빈 입력·전용 PUT만 사용하고 본인 원문 GET이나 일반 저장 경로로 전환하지 않는다. 마감·확정 시 신규 참여·대체 입력은 막고 암호 재접근은 유지한다. 암호와 오류 상세를 화면·Web Storage에 노출하지 않는 것을 확인했다.

## 최종 증거 대조

- [최종 웹 게이트](issue-108-final-web-gates.json)의 소스 85개 SHA-256을 현재 파일과 직접 대조하여 모두 일치했다. 정렬된 각 `path + NUL + sha256 + LF`를 연결한 UTF-8 바이트의 SHA-256도 `354cee12b940fceb3be5fec127f1e40f6f58e3a29679435421cf267af6ee8664`로 일치했다.
- `api:check`, lint, typecheck, build, unit, browser 여섯 단계가 모두 exit 0이다. 여섯 원본 로그의 SHA-256도 기록과 일치했다. API 생성 검사와 성공 build 출력을 확인했다.
- 최신 unit 원본 로그: **31개 파일, 400개 통과, 실패 0**.
- `/tmp/issue108-isolated-browser-results.json`을 직접 순회한 결과: **384개 중 383개 통과, 기존 landing skip 1개, 실패 0, flaky 0, 보고서 오류 0, 실제 재시도 0, worker 1**. skip은 기존 `landing.spec.ts`의 모바일 viewport 항목이며 신규 제외가 아니다. 원본 보고서 SHA-256은 [브라우저 게이트](issue-108-final-browser-gate.json)와 일치했다.
- 현재 `dist` 4개 파일 전부가 브라우저 게이트 지문과 일치했다. JS bundle은 `index-BFAmp3oO.js`, SHA-256 `23874e3ebbf2d1210f1414fd1928a9073ee543cfc0a30d49198771a863bad96c`다. `dist/index.html`도 해당 JS·CSS를 참조한다.
- 고정 컴포넌트 20개 테스트 SHA-256은 `41134954949bc58a23191cb9d5528eb5ca6315d59a55d457b3ddd6586ea03c97`, 독립 RoomPage 16개 테스트는 `846821503dd4c3750c6cff5c63f5708a40f291fbfdfa7cecefb592b3a113b0c5`로 유지된다.
- [웹 결함 주입](issue-108-roompage-mutations.json)의 비공개 cache 제거 누락, REPLACE_ONLY 원문 GET, stale 완료의 조기 조회 세 결함이 각각 지정 assertion으로 탐지됐다. 현재 두 제품 소스 및 두 고정 테스트 지문은 복원 증거와 일치하며 복원 후 독립 16개 GREEN도 기록되어 있다.
- native는 최종 immutable 서버 runtime manifest `b72e40fada1b6906e2a9dd39f07e2c99031c23119dedf2baea0d021c31f38b64`와 1,051개 파일 지문을 직접 대조한 증거에 연결된다. [최종 runtime 재검증](issue-108-final-runtime-recheck.json), [#108 native](issue-108-native.json), [#109 회귀](issue-109-after-108-native.json)는 각각 **16개·12개 PASS**, API mock 0, 브라우저 외부 요청 0이다. 두 native script 지문도 receipt와 일치했다. 확인·경합의 상세 transaction 경계는 별도 서버 HTTP/PostgreSQL 테스트의 범위다.

## 범위 제한

이 승인은 현재 소스와 위 산출물에만 적용한다. #107/#110 또는 새 공유 proof/catalog 변경을 합친 뒤의 동작을 승인한 것은 아니다. 서버 전체 guard 결과는 아직 실행 중이므로 서버·웹 전체 작업의 최종 승인으로 해석하지 않는다. 원격 push·PR·병합·배포·운영 호출을 수행하지 않았다.

검토자가 이번 단계에서 작성한 파일은 이 독립 리뷰 기록뿐이며 제품 소스·테스트·기존 증거는 수정하지 않았다.
