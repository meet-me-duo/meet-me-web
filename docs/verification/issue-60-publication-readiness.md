# 보완 답변·장소 미확인 후보 표시의 게시 준비

2026-10-31. [웹 #60](https://github.com/meet-me-duo/meet-me-web/issues/60), [서버 #176](https://github.com/meet-me-duo/meet-me-server/issues/176)의 무료 통합 준비다. 피처 push와 develop 대상 Draft PR 및 일반 CI 확인까지 승인됐고, 사용자 직접 확인과 후속 승인 전 develop 병합은 보류한다. 운영 배포·DB·설정·자격증명 변경, 추가 유료 모델·지도 요청은 포함하지 않는다. 기존 PR #51은 변경하지 않는다.

최신 develop `62d6878aeb70c4220612d86da45af3750659665e`의 디자인·모바일·운영자 진입·UI preview를 보존하며 입력 원문·보완 답변·초안 소유권·미해결 접수·주최자 미반영 진단을 이식한다. 후보의 확인된 시간과 장소·이동 미확인을 기존 설명에 담고, 선택·확정·새로고침 뒤에도 실제 참석 가능으로 단정하지 않는다. 새 장소 경고 영역은 추가하지 않는다.

기존 웹 격리 소스 `6e406ce07f5045790120bce6f34407ca0d65e108`와 미커밋 변경에서 고유 807개 검증 및 관련 빌드·브라우저 검증이 완료됐었다. 현재 통합 소스의 로컬 최종 검증은 아래 결과로 확정했다. 과거 해시·검증 요약은 역사 근거이며 현재 소스의 합격으로 재사용하지 않는다.

기본 desktop/mobile E2E는 기본 앱 의존성으로 실행하고, native 통합 검사는 Spring·격리 DB/Redis·제어 서버의 명시적 구동 경로에서 별도로 수행한다. native 검사를 조용히 건너뛰어 일반 CI 성공으로 포장하지 않는다. API snapshot은 새 격리 서버 export와 일치시키고 구 서버의 새 필드 누락도 검증한다.

실제 Gemini 단일 요청은 기존 15초 제한에서 TIMEOUT이었다. 독립 Luna 단일 요청은 27초 상한 내 9.319초에 성공했다. 합성 Gemini 오류+저장 Luna 응답의 로컬 worker/DB/Chromium 검증도 통과했지만 실제 공급자 fallback이나 실모델 전체 품질·운영 성공은 아니다. 저장 응답·원본 로그·토큰/헤더·봉인 자료는 공개하지 않는다.

최종 commit SHA·Draft PR/해당 SHA CI 결과는 게시 후 실제 결과로 기록한다. CI가 통과해도 병합·배포는 실행하지 않는다.

## 최종 로컬 검증 (2026-10-31)

- 생성 API/check·타입·lint·build 통과, Vitest **818 PASS**, native 사전 확인 **3 PASS**. 실제 새 서버의 OpenAPI export를 사용했고 운영 API snapshot을 가져오지 않았다.
- 기본 브라우저 **517 PASS / 기존 SKIP 1 / FAIL 0**. 기존 skip은 desktop에서 mobile 전용 landing 검사를 실행하지 않는 한 건이다. 초기 전체는 515 PASS / 2 FAIL / 같은 SKIP 1이었다. popup 첫 요청이 브라우저 route를 벗어나 localhost API 프록시 연결 실패로 끝났음을 확인한 뒤, 기존 로컬 preview 포트의 테스트 전용 Vite middleware로 합성 OAuth 시작 응답을 제공했다. 원래 URL·원본 탭 이용 가능 assertions를 유지했고 제품 auth·기본 Vite·timeout·retry 정책은 변경하지 않았다. 수정 후 동일 518개 전체를 다시 실행한 결과다.
- 명시적 mock 브라우저 **6 PASS**, 새 로컬 서버·PostgreSQL·Redis·worker의 native desktop/mobile **2 PASS**. 원문→질문 한 번→답변·미해결 접수→동결 입력→주최자 진단→최신 단계형 후보 선택→확정 HTTP/DB tuple을 검증했다. 실제 OAuth와 실제 모델 품질 검사가 아니다.
- native 첫 준비 확인은 브라우저 실행 전에 실패했다. 이후 control/API 정상 응답을 재확인해 실행한 2개가 통과했다. 초기 준비 실패 원인은 확정하지 않았다. 확정 스크린샷에는 기존 리뷰 modal이 겹쳐 있으므로 확정 카드 전체의 시각 검증으로 확대하지 않는다. 확정 헤딩·HTTP·선택 값 assertions는 통과했다.
- 앱·API·통합 설정의 최종 201개 소스 지문을 별도 로컬 증거에 고정했다. 원본 소스·실패 이력·모델 응답은 공개본에 복사하지 않았다. 두 단계 UI를 유지하는 테스트 보정, 구 서버의 새 필드 누락·단일 variant 표시 검사도 통과했다.
- 웹 Node/Chromium 전역 packet/배경 요청 계측은 하지 않았다. mock은 외부 origin fetch를 거절하고 native는 고정 loopback의 합성 backend에 연결했다. 웹 코드에 provider/map SDK·직접 endpoint는 없으며 새 유료/지도 검증은 수행하지 않았다. 이 한계를 외부 요청 전체의 관측 0으로 표현하지 않는다.

## 피처에서 직접 확인하기

기존 로컬 개발 명령 `corepack pnpm dev --host 127.0.0.1` 실행 후 `http://127.0.0.1:5173/integration/evidence-review.html?state=question`에서 합성 화면을 확인할 수 있다. `state=text`, `received`, `unapplied`도 지원한다. 이 페이지는 외부 API를 호출하지 않는 명시적 mock이며 실제 모델/운영 방을 사용하지 않는다. native 통합은 별도 합성 backend의 정상 상태를 확인한 뒤 `corepack pnpm test:evidence:native`로 실행한다. 일반 `test:e2e`가 native 하네스를 조용히 실행하거나 생략하지 않는다.

현재 웹 로컬 검증과 독립 diff 검토를 완료했으며 develop 대상 Draft 게시·최종 SHA CI 확인이 남았다. 서버의 V22 catalog/DDL와 운영 reader 전환은 별도 서버 작업 및 후속 운영 승인 범위다.
