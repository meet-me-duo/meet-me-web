# Frontend architecture

## 범위

제출 MVP는 비로그인 익명 세션으로 방 생성·참여·조건 제출·분석 대기·후보 확정·결과 공유를 제공한다. Google/Kakao 로그인, Google Calendar, 지도 선택과 실시간 소켓은 포함하지 않는다.

## 구조

- React + TypeScript + Vite SPA와 React Router를 사용한다.
- TanStack Query가 서버 상태, polling, retry와 캐시 무효화를 담당한다.
- React Hook Form과 Zod가 방 생성 입력을 검증한다.
- CSS는 프로토타입의 sky/slate·glass-card 디자인을 코드화했고 780px/540px 모바일 구간을 지원한다.
- `/rooms/:inviteCode` 하나가 서버 `public_status`를 기준으로 참여, 제출, 분석, 후보, 결과 화면을 전환한다.

## 보안 경계

- 모든 API 요청에 `credentials: include`와 `Accept-Language: ko-KR`을 적용한다.
- `meet_me_guest`는 JavaScript에서 읽거나 Web Storage·URL·body에 복사하지 않는다.
- 공유 URL만으로 HOST 권한을 가정하지 않고 `viewer.role`만 신뢰한다.
- 분기에는 RFC 9457 `code`, 사용자 문구에는 locale별 `detail` 또는 프론트 fallback을 사용한다.
- 프로덕션은 CSP, HSTS, frame deny와 content-type 보호 헤더를 CloudFront에서 적용한다.

## 조건 입력과 시간 표시

- 조건 제출·수정은 `{ raw_text: string }`만 전송한다. 수동 시간 격자·선택 상태·복원·구간 변환은 제공하지 않는다.
- ECMAScript `String.trim()`으로 앞뒤 공백을 제거한 후 1~500 Unicode 코드포인트인지 검증하며 내부 공백은 보존한다. textarea의 UTF-16 `maxLength` 대신 같은 기준의 카운터와 명시적 유효성을 사용한다. 방 합계 10,000 제한은 서버가 검사한다.
- 서버는 호환 요청의 `manual_available_times` 생략·빈 배열·null만 허용하며 nonempty 배열은 `SUBMISSION_MANUAL_AVAILABILITY_UNSUPPORTED`로 거부한다. 응답의 deprecated 필드는 항상 빈 배열이며 웹은 읽거나 전송하지 않는다.
- 기존 `raw_text: null` 제출은 안전하게 복원하고 자연어 재입력을 안내한다. 로드·재조회만으로 저장하지 않으며 사용자 저장으로 새 revision을 만든다. 기존 데이터는 서버에 보존된다.
- 기존 슬롯 전용 입력은 새 분석에 반영되지 않으며 HOST는 `READY_WITH_WARNINGS`와 `NO_MATCH`에서 nullable 원문 및 `LEGACY_MANUAL_ONLY_UNSUPPORTED` 사유를 확인할 수 있다. MEMBER는 타인 원문을 요청하거나 표시하지 않는다.
- 방 생성 날짜 범위와 서버의 자연어 시간 구간 산출은 유지한다. 후보·확정 일정의 `time_ranges`는 서울 시간으로 읽기 전용 표시하며 기존 후보·결과를 자동 변경하지 않는다.

## API 계약

- 저장된 OpenAPI 스냅샷과 생성된 `schema.d.ts`를 함께 커밋한다. 미배포 계약은 서버 로컬 생성 명세로 동기화하며 운영 snapshot으로 덮어쓰지 않는다.
- CI는 운영 서버를 조회하지 않고 저장된 스냅샷과 생성 타입의 일치만 검사한다.
- 명세 갱신은 명시적 수동 명령이며 코드 리뷰에서 endpoint·enum·nullable 변경을 확인한다.
