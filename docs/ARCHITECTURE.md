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

## 시간 입력

- HOST 지정 범위는 실제 날짜별 `DATED`, 기본 범위는 월–일 반복 `WEEKLY`로 전송한다.
- UI는 30분 단위이며 연속 셀은 하나의 구간으로 병합한다.
- 백엔드 LocalTime 계약상 자정을 넘는 구간을 만들지 않는다. 마지막 셀의 배타적 끝은 `23:59:59`다.
- 빈 시간표는 제약 없음이며, 자연어도 비어 있을 때만 제출을 차단한다.

## API 계약

- 운영 OpenAPI 스냅샷과 생성된 `schema.d.ts`를 함께 커밋한다.
- CI는 운영 서버를 조회하지 않고 저장된 스냅샷과 생성 타입의 일치만 검사한다.
- 명세 갱신은 명시적 수동 명령이며 코드 리뷰에서 endpoint·enum·nullable 변경을 확인한다.
