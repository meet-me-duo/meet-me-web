# Issue74 — 내 목록 삭제 확인과 카드 작업 정리

기준 main5fff175에서 독립 feature/74-account-room-delete-confirm을 준비했다. 표시 문구는 삭제지만 실제 API는 기존 body없는 POST /api/account/rooms/{inviteCode}/hide,204빈응답이다. 서버·API·보관정책·조건부참석 지원선언을 변경하지 않는다.

카드 오른쪽 위 쓰레기통+삭제 텍스트를44px이상터치영역에 배치하고 역할은 왼쪽 일반 정보로 분리했다. 생성일은 한국시간의 작은 날짜로 유지하고 정리일은 목록에서 제거했다. 모달은 본인목록만 삭제·되돌릴수없음·모임자체/타인목록/기존참여/직접링크불변을 설명한다. 최초focus취소,Tabtrap,취소/Esc복원,삭제후trigger제거시목록heading복원이다. 바깥클릭은기존RoomCloseConfirmation처럼닫히지않고요청도없다. pending취소·추가확인을막고실패시모달내재시도한다. 기존계정epoch·중복ref·늦은응답/화면이탈방어를보존했다.

## 상세 D-day의 명확한 지원 범위

현재 생성OpenAPI의 RoomResponse에는 created_at/expires_at이 없다. account/rooms만 로그인계정의 미숨김 항목에 두 시각을 주며 코드단건필터가 없다. 추가 API조회/계약변경 없이 현재계정의 유효한 목록cache에서 같은코드의 날짜가 단일하게 확인될 때만 상세에 표시한다. 정확30일의서버기간이아니거나 정보누락·충돌이면표시하지않는다. KST달력일기준 D-N이고 정확expiry순간포함D-0, 이후는이미삭제라고추정하지않고자동정리예정이다.

이는 전체 상세 지원이 아니다. 목록→상세만보장하며 직접링크·새로고침·비로그인·cache소멸후에는표시되지않을수있다. 이API한계는배포전부모에게명시했다. 원문·일정에서생성일을추정하거나시각을지어내지않고 개인정보를WebStorage/URL에저장하지않는다. 계정cache가정리되면메타데이터도숨긴다.

## 구현 후 별도 검토 패스

- modal은항상하나이며button이Link의형제여서탐색과이벤트가충돌하지않는다. purpose는React텍스트로만표시한다.
- 선택시계정epoch를저장하고확정전재검사한다. HTTP전후기존세대검사와mountedguard를보존하고mutation을자동재시도하지않는다.
- 성공후모든필터/페이지cache초기화가끝나기전모달수명과pending을유지한다. 삭제된trigger 대신안정된heading으로focus를돌린다.
- native showModal/inert와명시적키보드trap을사용하며닫힘/이탈때정리한다. 취소가최초focus이고pending은명시적busy다.
- countdown은서버날짜근거만사용하고분당로컬시계/visibility갱신만한다. 추가API/모델호출없으며타이머와구독을해제한다.
- APIclient/OpenAPI/schema/패키지/CIworkflow/서버파일은변경하지않는다. 보류PR51 제외.

UIguidance는checkout에설치경로가없어공식UI/UX ProMax SKILL과pro-rules를수동적용했다. https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
모달구성과접근성은 https://ui.shadcn.com/docs/components/alert-dialog 및 https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ 을참고하고기존native dialog/Button을사용했다. 새CLI/라이브러리설치없음. ReactBestPractices의hooks수명/구독/접근성체크를별도확인했다. 이는PR APPROVE제출이아니다.

## 검증 기록

초기focused단위의옛pending버튼문구기대값과TL옵션타입문제를고쳤다. 관련단위24PASS,기존목록+새삭제브라우저20PASS,200%텍스트/OSdark선호/동작축소/375portrait·844landscape4PASS. 320×480/390×844/1440×844실제캡처를확인했다. 데이터는자연스러운가상문장과가상인물이며실제운영계정/모임아님.

전체검증중cloud연결이중단되어세션24415복구가transportdisconnected/recoverytimeout으로실패했다. node/python프로세스소멸확인후부분단위로그를보존하고남은검사만재개했다. API/lint/typecheck는완료PASS,최종단위/preflight/build/전체브라우저/CI는완료후갱신한다. 중단실행을PASS/FAIL로오인하지않는다. 실제운영API/모델/모임변경0,서버변경0.
