# 같은 방 계정 복구와 이 탭의 임시 입력

제출 전 확인 중 계정 복구가 필요하면 저장 완료로 표시하지 않는다. 같은 방을 새 탭에서 열어 같은 계정으로 로그인한 뒤, 원탭의 **로그인 상태 다시 확인**을 누른다. 최신 방·본인 입력 조회가 확인된 뒤에만 임시 원문을 편집기에 복원한다. 자동 제출하지 않으며 서버 revision이 달라지면 사용·폐기를 명시적으로 선택한다.

임시 보관은 검증된 account·본인 참여의 최대500 Unicode 원문1건을 탭 메모리에만 유지한다. 다른 계정·로그아웃·소유권 거절·일반 방 이동은 폐기한다. 계정 복구 때문에 화면이 다시 구성되는 경우에 한해 보관을 유지한다. 500자를 넘는 원문을 자르거나 저장소에 영구 보관하지 않는다. 이탈 경고를 무시하고 전체 문서를 떠나면 미저장 메모리를 복구할 수 없다. 서버에 저장된 입력은 최신 본인 조회로 확인한다.

## 검증 결과와 한계

새 독립55개(유효RED49·초회PASS6)와 기존 HOST26개는81PASS, 전체 단위682PASS다. 독립 결함 주입9종은 모두 assertion으로 탐지했고 각각 정확 복구 후55PASS였다. API 생성 정합·lint·typecheck·build 및 전체 mock browser425PASS/기존skip1도 확인했다. 첫 전체 단위4개 lifecycle 회귀와 새 경계4개 실패는 원본을 보존하고 제품만 최소 수정했다.

별도 실제 로컬 HTTPS6은 desktop·좁은 화면 각각 다음을 검증했다. 정상 SPA·저장본의 안정 reload, 실제401 뒤 새 탭의 같은 계정 로그인과 원탭의 명시적 재확인·최신 본인 조회·정확 원문 복원, beforeunload 취소와 이탈 확정이다. 재시도·skip·flaky0이며 API route mocking은 없다. 테스트 proxy socket 오류1회는 카운터에 보존했고 프로세스 오류 처리를 거쳐 모든 기대값이 통과했다. 입력·런타임·자산 지문과 컨테이너·키·프로필·포트 정리를 확인했다.

기존 빠른 전체 문서 이동8개 원본과 자동 focus 복구의 실패를 새6 성공으로 바꾸지 않았다. headless 탭 전환에서 새 native focus 이벤트가 발생하지 않아 자동 focus의 실제 브라우저 검증은 미완료다. focus 처리의 단위 검증과 명시적 버튼의 실제 HTTPS 검증을 구분한다. 상세 내부 진단은 로컬 전용이며 공개 실행기에는 포함하지 않는다.

테스트는 실제 PostgreSQL·Redis·RS256·로컬 OIDC를 사용하지만 외부 OAuth나 실모델을 호출하지 않는다. Primary 합성 provider가 TwoStage·물리 전송·공통 금융 graph를 우회하므로 이6개는 실제 모델 품질·비용·지연 또는 운영 활성화 증거가 아니다. 서버 고정 기준은 `3982535765e878875a901dd9d28352358e594f6f`이며 별도 runtime #131의 새 코드를 검증했다고 하지 않는다.

## 로컬 HTTPS 실행의 선행 조건

이 실행기는 일반 `pnpm test`·CI mock browser와 별도다. JDK17, Node24와 설치된 web 의존성, Docker, OpenSSL, Chromium 및 사전 검증한 고정 서버 런타임이 필요하다. 새 checkout에서 서버 Gradle build·의존성 수집·동결 manifest 생성을 자동 수행하는 CI job은 제공하지 않는다.

`HOST_INTEGRATION_SERVER_REPO`는 위 서버 commit을 조회할 수 있는 저장소다. `HOST_INTEGRATION_FROZEN_RUNTIME`에는 `runtime-source-manifest.json`, `runtime-frozen.classpath`, `runtime-final/`이 있어야 한다. manifest는 source482·class/resource1559·dependency jar216의 SHA를 고정하며, classpath의 jar 실제 경로도 일치해야 한다. 실행기는 이를 재검증하며 누락·다른 artifact를 사용하면 중단한다. 실행을 위해 manifest를 현재 파일에서 임의 재작성하거나 다른 서버 코드를 같은 artifact로 부르지 않는다.

준비된 artifact가 있을 때 다음처럼 별도 실행한다. 결과는 임시 실행 디렉터리에 남고 임시 인증 material은 정리한다.

```sh
HOST_INTEGRATION_SERVER_REPO=/path/to/server \
HOST_INTEGRATION_FROZEN_RUNTIME=/path/to/frozen-runtime \
HOST_INTEGRATION_SUITE=account-recovery \
JAVA_HOME=/path/to/jdk17 \
node scripts/run-host-integration.mjs
```

`current-host` suite의 기존8은 보존된 별도 oracle이며 현재 승인된 명시적 계정 복구6과 같은 성공 판정으로 합산하지 않는다. 실제 검증 근거는 `.tdd/verification/issue132-account-recovery-{faults,independent-author,https-author}.json` 및 `issue-32-account-recovery-final-gates.json`이다. `issue132`는 로컬 검증 묶음 이름이며 이 웹 변경의 게시 대상은 기존 PR33이다.
