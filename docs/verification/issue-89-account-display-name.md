# 계정 닉네임 변경과 긴 참가자 이름 표시

관련 작업: [#89](https://github.com/meet-me-duo/meet-me-web/issues/89).

계정 메뉴의 `닉네임 변경`은 현재 이름을 미리 채운 native dialog를 연다. 취소·닫기·Escape와 포커스 순환을 제공하고, 변경된 유효한 값만 한 번 저장한다. 앞뒤 공백 제거 후 1~50 Unicode 코드포인트를 세며, 제어문자와 고립 서로게이트는 거부한다. HTML `maxLength`의 UTF-16 제한을 사용하지 않아 50개 이모지를 입력할 수 있다. 기존 모임 생성 폼의 숨겨진 이름 검증도 같은 코드포인트 상한으로 맞췄다.

실제 인증 `PUT /api/auth/me`는 이름만 저장한다. 서버에서 확인한 본인 계정 응답을 적용한 뒤 기존 정상 Refresh로 새 토큰을 받으며, PUT 응답으로 토큰이나 만료 시각을 만들지 않는다. 먼저 진행하던 Refresh가 있으면 완료 후 새 Refresh를 시작하고 이전 응답이 새 이름을 되돌리지 않게 한다. 같은 계정의 이름 변경은 계정 경계나 방 입력을 초기화하지 않는다. 다른 쿠키 소유자·로그아웃·재로그인으로 계정 경계가 바뀌면 이전 계정 성공 안내를 적용하지 않는다.

PUT 실패는 입력을 유지한다. PUT 성공 뒤 Refresh 실패는 `닉네임은 저장됐어요. 로그인 상태를 다시 확인해 주세요.`로 구분하고 로그인 링크에 초점을 옮긴다. 불확실한 저장/쿠키 회전 요청을 자동 재시도하지 않는다. 기존 모임 참가자와 완료 분석의 이름 스냅샷은 그대로이며 계정 보안·관리자·로그아웃 진입점도 유지한다.

추천안 이름은 한 줄 말줄임으로 표시한다. 전체 이름은 DOM과 `title`에 보존하고 이름 영역을 실제 hover 대상으로 유지한다. 상태는 오른쪽에 고정하며 API 문자열·참가자 참조·동명이인 키·방식별 판정을 바꾸지 않는다.

로컬 검증은 실제 앱 컴포넌트와 합성 HTTP 응답을 사용했다. PC Chromium과 모바일 에뮬레이션에서 메뉴·모달·pending·실패·부분 성공·키보드와 포커스, 이모지 50개·ZWJ·C1 제어문자·초과 길이, 320px의 긴 이름과 동명이인·더보기·실제 시간 선택을 확인했다. 실제 계정 수정이나 실제 OAuth·물리 iOS 동작을 검증한 것은 아니다. 캡처와 원시 로그는 Git 밖에 보관한다.

디자인은 기존 sky/slate와 공통 Card/Button을 유지했다. UI/UX Pro Max의 접근성 우선 기준과 shadcn Dialog의 제목·설명·입력·액션 구성을 참고했고 외부 의존성이나 전역 reset은 추가하지 않았다.

확인한 로컬 검사:

| 검사 | 결과 |
| --- | --- |
| 전체 Vitest | 89파일, 949 PASS |
| 전체 표준 E2E | 635 PASS, 기존 1 SKIP, 실패·flaky 0 |
| 전체 UI preview | 32 PASS |
| 닉네임 Unicode 경계 보강 재검사 | PC·모바일 6 PASS |
| Evidence preflight / browser | 3 PASS / 6 PASS |
| ESLint / TypeScript / production build | PASS |

표준 E2E는 기본 설정의 시나리오를 유지하고 설치된 시스템 Chromium, 로컬 설정 cwd, workers=2만 지정했다. 합성 서버 및 브라우저 검증은 API base를 loopback으로 고정해 운영 API를 호출하지 않았다. 위 결과는 로컬 검증 기록이며 배포 완료를 뜻하지 않는다.

API 타입은 서버 후보 commit `502dc51`의 실제 Spring Boot·PostgreSQL/Redis fixture에서 `GET /v3/api-docs`로 받은 전체 native Swagger를 사용했다. export SHA256은 `4acb0e718f9e4b82407fc408205cef5b227a34c3feb86b2ab92ecd7e415fc31c`이며, 서버의 공개 배포 계약 projection과 일치한다. 기존 snapshot의 localhost server 표기와 실제 property의 required 여부를 임의 변경하지 않았다. 순서를 제외한 의미 변경은 PUT `/api/auth/me`, `UpdateAccountDisplayNameRequest` 추가와 기존 GET의503 설명 보강이다. `pnpm api:generate`로 생성한 DTO를 사용하고 `pnpm api:check`로 재현성을 확인했다. 타입 교체 후 인증·메뉴·모임 생성 관련 90개 검사와 typecheck/lint/build를 재확인했다. 운영 배포의 Swagger 일치는 별도 배포 확인 단계다.
