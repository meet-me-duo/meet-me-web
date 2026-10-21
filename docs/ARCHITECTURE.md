# Frontend architecture

## #110 운영 요약 경계

- `/operations`는 일반 모임 화면과 독립된 읽기 전용 화면이다. HOST·일반 회원·게스트를 운영자로 간주하지 않는다. 서버의 명시적 allowlist만 접근을 허용하며, 실제 운영자 등록과 공통 인증 연결 전에는 기본 거부다.
- 운영 응답은 페이지 메모리에서만 유지한다. 공유 QueryClient·Web Storage·URL에 응답이나 인증을 저장하지 않는다. 화면 이동·조회 실패 시 기존 응답을 제거하고, 취소된 이전 요청의 늦은 결과를 무시한다. 자동 polling이나 쓰기 명령은 없다.
- 세 GET API만 사용하며 20개 단위의 서버 cursor를 전달한다. 요청은 `cache: no-store`다. 허용 필드만 runtime 검증하고 고정된 오류 안내를 사용하며, 원문·이름·초대 코드·공급자 응답·비밀값을 렌더링하지 않는다. 서버 응답의 성공·오류 `Cache-Control: no-store`는 서버 계약이다.
- 방 요약은 현재 설정이다. 실행의 종료·winner와 최종 결과 게시를 동일시하지 않는다. 기록된 경과 시간은 저장 시각 차이며 HTTP 지연 측정값이 아니다. 시도는 기록된 admission의 INITIAL/RETRY/FALLBACK 분류이며 parser dispatch·HTTP 횟수는 미상이다.
- 알려진 사용량만 소계로 표시한다. 미상 null과 알려진 0을 구별하고, coverage 분모는 기록된 admission이다. 소계를 전체 사용량이나 실제 과금으로 해석하지 않는다. REUSED 라운드는 신규 provider 시도로 합산하지 않는다.
- #109 공통 인증은 `createOperationsApi(getAccessToken)`에 메모리 토큰 공급자를 주입하고, 로그인·로그아웃·계정 전환마다 `OperationsPage`의 `authRevision`을 변경한다. 안정적인 API 인스턴스를 유지한다. revision은 권한·사용자 ID가 아닌 화면 수명 경계이며 전송·표시·보관하지 않는다. 요청 전후 토큰과 취소 상태도 확인한다. 기본 App에는 실제 공급자가 없어 운영 조회는 서버의 기본 거부에 머문다. 공통 store와 연결한 실인증·만료 흐름은 아직 통합 검증 전이다.

## 범위

#109부터 Google/Kakao 로그인과 계정 주최자의 본인 방 아카이브를 제공한다. 방 생성은 로그인 필수이며 일반 참여는 게스트도 가능하다. 회원은 공급자 프로필 이름을 사용한다. Google Calendar, 지도 선택과 실시간 소켓은 포함하지 않는다. 실제 공급자 설정·운영 활성화와 격리 공급자 대역 검증은 구분한다.

## 계정과 소유권 (#109)

- `auth/session.ts`의 Access·계정 정보는 메모리에만 둔다. Refresh는 서버의 HttpOnly/Secure cookie로 전달한다. 로그인 복귀 경로만 검증된 상대 경로로 sessionStorage에 저장하며 token·프로필·본인 원문은 저장하지 않는다.
- 페이지 시작 시 Refresh를 한 번 공유하고 만료 30초 전에 갱신한다. Refresh와 로그아웃 cookie 요청은 Web Locks 지원 브라우저에서 탭 사이에 직렬화한다. 미지원 환경은 탭 내부 singleflight만 보장하며 token을 탭 간 전송하지 않는다.
- 모든 API 요청에 현재 Bearer를 적용한다. 계정이 있으나 Access가 만료됐으면 요청 전 인증 오류로 중단한다. 요청에 `cache: no-store`를 적용하며 mutation을 자동 재시도하지 않는다.
- 로그인·로그아웃으로 계정 경계가 바뀌면 query와 mutation cache를 비우고 화면 subtree를 재생성한다. API는 fetch와 JSON decode 뒤에도 계정 epoch를 확인하여 이전 계정의 늦은 응답을 차단한다. 진행 중 Refresh는 세대가 바뀐 뒤 계정을 복원하지 않는다.
- `/account/rooms`는 로그인 계정의 HOST 방만 표시하고 서버가 반환한 정리 예정 시각을 표시한다. 30일 보존·삭제는 기존 서버 정책을 따른다.
- 기존 게스트 기록은 사용자의 명시적 연결 동작과 서버의 계정·게스트 이중 증명으로만 귀속한다. 이름·이메일·초대 링크로 자동 연결하지 않는다. 같은 방에 이미 계정 기록이 있으면409를 표시하고 기존 기록을 보존한다. 닫힌 기존 방도 연결할 수 있다.
- 과거 게스트 HOST는 로그인·명시 연결 안내를 표시한다. 서버에서 계정 HOST 권한을 확인하기 전에는 HOST 명령을 제공하지 않는다. `viewer.context_id`는 화면 cache 힌트이며 인증 증명이 아니다.

## 구조

- React + TypeScript + Vite SPA와 React Router를 사용한다.
- TanStack Query가 서버 상태, polling, retry와 캐시 무효화를 담당한다.
- React Hook Form과 Zod가 방 생성 입력을 검증한다.
- CSS는 프로토타입의 sky/slate·glass-card 디자인을 코드화했고 780px/540px 모바일 구간을 지원한다.
- `/rooms/:inviteCode` 하나가 서버 `public_status`를 기준으로 참여, 제출, 분석, 후보, 결과 화면을 전환한다.

## 보안 경계

- 모든 API 요청에 `credentials: include`와 `Accept-Language: ko-KR`을 적용한다.
- `meet_me_guest`는 JavaScript에서 읽거나 Web Storage·URL·body에 복사하지 않는다.
- 공유 URL만으로 HOST 권한을 가정하지 않고 `viewer.role`과 작업별 서버 capability를 확인한다.
- 분기에는 RFC 9457 `code`, 사용자 문구에는 locale별 `detail` 또는 프론트 fallback을 사용한다.
- 프로덕션은 CSP, HSTS, frame deny와 content-type 보호 헤더를 CloudFront에서 적용한다.

## 조건 입력과 시간 표시

- 방 생성은 모임 설정과 HOST 참여 기록만 만든다. 자연어 조건은 생성 후 같은 방의 본인 제출 API로 저장하며, 생성 성공과 조건 제출 성공을 따로 안내한다. 미제출 HOST도 예상 인원에는 포함되지만 제출 수에는 포함되지 않는다.
- 생성 성공 응답을 방 캐시에 보관해 후속 조회의 일시 실패에도 공유 링크와 기존 HOST 화면을 유지한다. HOST 안내는 서버가 확인한 역할과 본인 제출 없음 응답을 기준으로 표시하며, 참여 세션이나 원문을 새로 저장하지 않는다. 나중에 입력은 기존 최근 모임·초대 링크로 같은 브라우저에서 돌아오는 흐름을 사용한다.
- 생성과 저장 각각의 진행 중 중복 클릭은 즉시 잠근다. 조건 저장 실패 후에는 입력을 유지하고 같은 방의 저장만 재시도한다. 서버의 참여자별 제출·동일 원문 멱등성과 마감 후 수정 제한을 그대로 따른다.
- 네트워크 오류·HTTP 5xx·408은 생성/저장 결과 미확인으로 안내한다. 생성 결과를 잃으면 재시도로 새 방이 생길 수 있음을 알리고, 저장 결과를 잃으면 기존 방에서 확인·재시도한다. 저장 시도 후에는 미제출 확정 안내를 숨기며, 본인 조회가 시도한 원문과 일치하면 이전 결과 미확인 안내를 해소한다. 그동안 더 입력한 임시 원문은 유지한다.
- 최초 HOST 입력도 마감·분석 전환 시 현재 방·viewer 메모리에만 읽기 전용으로 남긴다. 이를 서버 저장이나 분석 반영으로 표시하지 않으며 마감 후 제출 권한을 새로 주지 않는다. 성공한 저장과 같은 임시 입력은 제거하고, 새로고침·방 이동·viewer 변경·접근 거부 시 기존 비공개 캐시 정리 경계를 따른다.
- 최초 수집 중 조건 제출·수정은 `{ raw_text: string }`만 전송한다. 마감된 모임의 조건 수정 라운드에서는 `revision_round_id`와 `expected_revision`을 함께 전송한다. 수동 시간 격자·선택 상태·복원·구간 변환은 제공하지 않는다.
- ECMAScript `String.trim()`으로 앞뒤 공백을 제거한 후 1~500 Unicode 코드포인트인지 검증하며 내부 공백은 보존한다. textarea의 UTF-16 `maxLength` 대신 같은 기준의 카운터와 명시적 유효성을 사용한다. 방 합계 10,000 제한은 서버가 검사한다.
- 서버는 호환 요청의 `manual_available_times` 생략·빈 배열·null만 허용하며 nonempty 배열은 `SUBMISSION_MANUAL_AVAILABILITY_UNSUPPORTED`로 거부한다. 응답의 deprecated 필드는 항상 빈 배열이며 웹은 읽거나 전송하지 않는다.
- 기존 `raw_text: null` 제출은 안전하게 복원하고 자연어 재입력을 안내한다. 로드·재조회만으로 저장하지 않으며 사용자 저장으로 새 revision을 만든다. 기존 데이터는 서버에 보존된다.
- 기존 슬롯 전용 입력은 새 분석에 반영되지 않으며 HOST는 `READY_WITH_WARNINGS`와 `NO_MATCH`에서 nullable 원문 및 `LEGACY_MANUAL_ONLY_UNSUPPORTED` 사유를 확인할 수 있다. MEMBER는 타인 원문을 요청하거나 표시하지 않는다.
- 방 생성 날짜 범위와 서버의 자연어 시간 구간 산출은 유지한다. 후보·확정 일정의 `time_ranges`는 서울 시간으로 읽기 전용 표시하며 기존 후보·결과를 자동 변경하지 않는다.

## API 계약

- 저장된 OpenAPI 스냅샷과 생성된 `schema.d.ts`를 함께 커밋한다. 미배포 계약은 서버 로컬 생성 명세로 동기화하며 운영 snapshot으로 덮어쓰지 않는다.
- CI는 운영 서버를 조회하지 않고 저장된 스냅샷과 생성 타입의 일치만 검사한다.
- 명세 갱신은 명시적 수동 명령이며 코드 리뷰에서 endpoint·enum·nullable 변경을 확인한다.

## 같은 모임에서 조건 수정과 다시 조율

- 마감 후에도 참여자는 본인의 저장 원문을 펼쳐 읽는다. 미확정 `NO_MATCH`/`READY_WITH_WARNINGS`에서 서버가 `can_open_revision`을 허용한 HOST만 조건 수정을 연다. 확정된 모임과 기존 정상 결과의 권한을 웹에서 추정하지 않는다.
- `POST /reopen`은 현재 `analysis_id`, `revision_generation`, 작업별 UUID를 전송한다. 모임·기존 참가자·입력을 유지하고 AI 요청이나 자동 저장은 하지 않는다. 라운드가 열려도 DB의 `collection_status`는 `CLOSED`이므로 신규 참여는 허용하지 않는다.
- OPEN 라운드에서 `can_edit_own_submission`을 받은 참여자만 기존 편집기를 사용한다. 바꾸지 않은 입력은 재제출하지 않는다. 로컬 미저장 내용은 polling·재조회·실패 중에 유지하고, HOST 자신의 미저장 내용이나 진행 중 저장이 있으면 분석 버튼을 잠근다. 다른 참여자의 미저장 내용을 클라이언트가 알고 있다는 안내는 하지 않는다.
- `POST /analysis`는 현재 라운드 ID, 작업별 UUID, 기본 `force_reparse=false`를 전송한다. 허용된 HOST가 체크박스를 명시적으로 선택할 때만 변경 없는 입력의 재해석을 요청한다. 저장·재조회·재시도는 이 선택을 자동으로 켜지 않는다. 일시 실패 후 같은 작업의 재시도는 같은 UUID를 사용하며, 분석 횟수 소진 409는 영구 제한으로 안내한다. 남은 횟수가 0이어도 수정·저장과 변경 없는 결과 재사용은 허용한다.
- 기존 `/close`나 지연 고정 배치 `/analysis/retry`를 조건 수정 분석에 재사용하지 않는다. 이전 후보 캐시는 라운드 열기·분석 시작 시 취소·제거하고 후보 응답의 `analysis_id`를 현재 방의 분석 ID와 대조한다.
- 방의 `state_version`은 같은 방의 조율 상태를 비교하는 값이다. 더 작은 응답은 화면을 되돌리지 않고, 같은 값의 세션 만료 응답은 수용해 비공개 캐시를 제거한다. 본인 원문의 revision은 별도로 비교한다. 작업 재생 응답의 과거 라운드 기록과 응답에 담긴 현재 `room`을 구분해 현재 방의 라운드만 편집·분석에 사용한다.
- capability가 없는 구 서버 응답은 저장 입력과 결과를 읽는 기존 화면으로 유지한다. 새 복구 계약 배포 전에는 기능을 활성화하지 않으며, 해석 미리보기나 구체적인 불확실 구절은 현재 API에 없어 표시하지 않는다.
- 다른 HOST가 분석을 시작해 편집기가 닫혀도 미저장 수정은 현재 방·viewer의 브라우저 메모리에만 보관해 읽기 전용으로 표시한다. 다시 조건 수정을 열 수 있을 때 편집을 이어가며 자동 저장하지 않는다. 새로고침·다른 모임 이동·접근 거부·관찰 가능한 viewer 변경 시 삭제한다. Web Storage에 원문을 기록하지 않는다.
- 후보·미반영 원문·확정 결과 조회와 후보 확정의 401/403/404도 방 전체 접근 경계로 처리한다. 이전 권한 정리의 비동기 cache 삭제가 접근 복구 후의 새 cache를 지우지 않도록 접근 세대를 대조한다. 새 계약의 `viewer.context_id`는 서버가 제공하는 본인 참가자의 방 한정 식별 힌트이며 cache 분리에만 사용한다. 인증 권한·요청 body·URL에 사용하지 않고 credential이나 실제 session ID를 노출하지 않는다. 식별 힌트가 없는 구 서버 응답에서는 동일 name/role의 숨겨진 세션 교체를 구별하는 검증이 제한된다.
- quota 0에서 수정 전 새 분석 불가를 안내한다. 원문을 되돌려 다시 저장해도 새 입력 version이 생기므로 기존 결과를 재사용할 수 없다. 변경 없이 원래 version 집합을 유지한 요청만 기존 결과를 재사용한다.

본인 제출 cache는 새 서버의 `viewer.context_id`가 있으면 `[submission, invite_code, context_id]`로 격리한다. 방 snapshot 없이 이전 본인 cache만 남은 첫 조회에서도 다른 참여자의 원문이나 높은 revision을 복원하지 않는다. context가 없는 기존 서버는 기존 key를 사용하며 본인 구분은 관찰 가능한 viewer context 전환과 권한 실패 정리에 한정된다.


### #110 로컬 client call 관측 후속

운영 요약은 승인 시도와 로컬 client call을 별도로 표시한다. 관측 부재 null, 확인된 무호출 빈 배열, 부분 관측의 알려진 호출 소계를 구분한다. HTTP 상태와 단조 경과 ns는 로컬 lifecycle 사실이며 수신·청구 보장이 아니다. actual local OpenAPI에서 operations3 경로와 참조 DTO만 기존 snapshot에 병합했다. #109 메모리 token supplier/authRevision 실제 주입은 통합 대기이며 기본 App은 운영 인증을 제공하지 않는다. 최종 로컬 근거는 docs/verification/issue-110-web-final.json이다.
